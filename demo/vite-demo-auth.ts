/**
 * Demo-only Vite dev middleware: a transparent, per-service auth proxy in front of the REAL
 * lab backend. Models INDEPENDENT IIIF Auth services (each resource its own login/token):
 *   - protected spectra (`/lab/files/<uuid>`) are gated by their DATASET service's BEARER
 *     token — our plugin attaches it after its own Sign-in;
 *   - protected maXRF IMAGES (`/lab/iiifserver/...` info.json + tiles) are gated by a
 *     per-service COOKIE (OpenSeadragon fetches them itself and can't send a bearer, so —
 *     like real IIIF image auth — the login is cookie-based). Their info.json returns a 401
 *     declaring the image auth service, so MIRADOR drives its own login directly on the map.
 * Manifests + unprotected files proxy freely. NOT part of the published plugin.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { authServiceFor, serviceForPath, SERVICE_LABELS, tokenFor } from './demo-auth-config';

const BACKEND = 'http://192.168.122.250:8000';

// The login window sets a per-service cookie (same-origin → OpenSeadragon sends it with the
// image/tile requests). The token service is still postMessaged for Mirador's own flow.
const loginPage = (svc: string) => `<!doctype html><meta charset="utf-8"><title>Sign in — ${svc}</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0">
<div style="text-align:center;max-width:340px;padding:1.5rem"><div style="font-size:2.4rem">🔐</div>
<h2 style="margin:.4rem 0">${SERVICE_LABELS[svc] ?? svc}</h2>
<p style="color:#94a3b8;line-height:1.5">Mock IIIF Auth login (service <code>${svc}</code>). Click to authenticate — this window closes and the resource loads from its original source.</p>
<button id="b" style="padding:.6rem 1.6rem;font-size:1rem;cursor:pointer;border:0;border-radius:8px;background:#22c55e;color:#06210f;font-weight:600">Log in</button>
</div><script>document.getElementById('b').onclick=function(){document.cookie=${JSON.stringify(`demo-auth-${svc}`)}+'=1; path=/; SameSite=Lax'; window.close();};</script></body>`;

const tokenPage = (svc: string) => `<!doctype html><meta charset="utf-8"><title>token</title><script>
var p=new URLSearchParams(location.search);
(window.opener||window.parent||window).postMessage({messageId:p.get('messageId'),accessToken:${JSON.stringify(tokenFor(svc))}},'*');
</script>token service (${svc})`;

const reply = (res: ServerResponse, status: number, type: string, body: string | Buffer, origin: string): void => {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Content-Type', type);
  res.end(body);
};

const cookieHas = (req: IncomingMessage, name: string): boolean =>
  (req.headers.cookie ?? '').split(';').some((c) => c.trim().startsWith(`${name}=`));

export function demoAuthPlugin(): Plugin {
  return {
    name: 'demo-auth-proxy',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '';
        const path = url.split('?')[0];
        const origin = `http://${req.headers.host ?? 'localhost:3000'}`;
        const svcParam = new URLSearchParams(url.split('?')[1] ?? '').get('svc') ?? 'x';

        if (req.method === 'OPTIONS' && (url.startsWith('/lab/') || url.startsWith('/demo-auth/'))) {
          return reply(res, 204, 'text/plain', '', origin);
        }
        if (url.startsWith('/demo-auth/login')) return reply(res, 200, 'text/html', loginPage(svcParam), origin);
        if (url.startsWith('/demo-auth/token')) return reply(res, 200, 'text/html', tokenPage(svcParam), origin);
        if (!url.startsWith('/lab/')) return next();

        const svc = serviceForPath(path);
        const isImage = !!svc && path.includes('/iiifserver/');
        const isImageInfo = isImage && /\/info\.json$/.test(path);
        // Images: cookie (OpenSeadragon) OR bearer (Mirador's own refetch). Datasets: bearer only.
        const bearerOk = !!svc && (req.headers.authorization ?? '') === `Bearer ${tokenFor(svc)}`;
        const cookieOk = !!svc && cookieHas(req, `demo-auth-${svc}`);
        const authed = !svc ? true : isImage ? bearerOk || cookieOk : bearerOk;

        try {
          // maXRF image description: declare its auth service in the body; 401 ("degraded")
          // until authed, so Mirador drives its own login for THIS image's service.
          if (isImageInfo) {
            const upstream = await fetch(BACKEND + path.replace(/^\/lab/, ''));
            const info = JSON.parse(JSON.stringify(await upstream.json()).split(BACKEND).join(`${origin}/lab`)) as Record<string, unknown>;
            const existing = info.service;
            info.service = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), authServiceFor(origin, svc!)];
            return reply(res, authed ? 200 : 401, 'application/json', JSON.stringify(info), origin);
          }
          if (svc && !authed) {
            return reply(res, 401, 'text/plain', `Unauthorized — sign in (service ${svc}).`, origin);
          }
          // Everything else (tiles once authed, manifests, unprotected files): transparent proxy.
          const upstream = await fetch(BACKEND + url.replace(/^\/lab/, ''));
          const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
          return reply(res, upstream.status, ct, Buffer.from(await upstream.arrayBuffer()), origin);
        } catch (err) {
          return reply(res, 502, 'text/plain', `Proxy error: ${String(err)}`, origin);
        }
      });
    },
  };
}
