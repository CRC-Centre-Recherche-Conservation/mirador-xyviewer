/**
 * Demo-only Vite dev middleware: a transparent, per-service auth proxy in front of the REAL
 * lab backend. Which resource needs which service is keyed by ANNOTATION UUID
 * (demo-auth-config); at startup we resolve each protected annotation's body to what the
 * proxy actually sees — a dataset (`/files/<uuid>`) or a manifest whose exact images we
 * fetch once — so nothing depends on image filenames. Two enforcement mechanisms:
 *   - protected spectra (`/lab/files/<uuid>`) are gated by their service's BEARER token —
 *     the plugin attaches it after Sign-in;
 *   - protected maXRF IMAGES (`/lab/iiifserver/...`) are gated by a per-service COOKIE
 *     (OpenSeadragon can't send a bearer). Their info.json returns 401 declaring the image
 *     auth service, so MIRADOR drives its own login on the map.
 * Manifests + unprotected files proxy freely. NOT part of the published plugin.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  authServiceFor,
  iiifServiceKey,
  imageServiceKeysFromManifest,
  issueToken,
  SESSION_TTL_S,
  serviceForAnnotation,
  SERVICE_LABELS,
  TOKEN_TTL_MS,
  validateToken,
} from './demo-auth-config';

const BACKEND = 'http://192.168.122.250:8000';

/** fileUuid → service and iiif-image-key → service, derived from the protected annotations. */
interface ProtectionMaps {
  files: Map<string, string>;
  images: Map<string, string>;
}

/** Resolve protected annotations to their bodies (datasets + each manifest's exact images). */
async function buildProtectionMaps(publicDir: string): Promise<ProtectionMaps> {
  const files = new Map<string, string>();
  const manifestSvc = new Map<string, string>(); // manifest uuid → service (dedupe fetches)

  const lists = readdirSync(publicDir).filter((f) => /^annotations-v2-canvas-\d+\.json$/.test(f));
  for (const name of lists) {
    let json: { resources?: { '@id'?: string; resource?: { '@id'?: string } }[] };
    try { json = JSON.parse(readFileSync(join(publicDir, name), 'utf8')); } catch { continue; }
    for (const ann of json.resources ?? []) {
      const svc = serviceForAnnotation(ann['@id']);
      const bodyId = ann.resource?.['@id'];
      if (!svc || typeof bodyId !== 'string') continue;
      const file = /\/files\/([^/?]+)/.exec(bodyId);
      if (file) { files.set(file[1], svc); continue; }
      const manifest = /\/manifest\/([^/?]+)/.exec(bodyId);
      if (manifest) manifestSvc.set(manifest[1], svc);
    }
  }

  const images = new Map<string, string>();
  for (const [uuid, svc] of manifestSvc) {
    try {
      const manifest = await (await fetch(`${BACKEND}/manifest/${uuid}`)).json();
      for (const key of imageServiceKeysFromManifest(manifest)) images.set(key, svc);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[demo-auth] could not load protected manifest ${uuid}:`, err);
    }
  }
  return { files, images };
}

/** The auth service a `/lab` request requires (undefined = public), per the derived maps. */
function serviceForRequest(path: string, maps: ProtectionMaps): string | undefined {
  const file = /^\/lab\/files\/([^/?]+)/.exec(path);
  if (file) return maps.files.get(file[1]);
  if (path.startsWith('/lab/iiifserver/')) {
    const key = iiifServiceKey(path);
    return key ? maps.images.get(key) : undefined;
  }
  return undefined;
}

// The login window sets a per-service cookie (same-origin → OpenSeadragon sends it with the
// image/tile requests). The token service is still postMessaged for Mirador's own flow.
const loginPage = (svc: string) => `<!doctype html><meta charset="utf-8"><title>Sign in — ${svc}</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0">
<div style="text-align:center;max-width:340px;padding:1.5rem"><div style="font-size:2.4rem">🔐</div>
<h2 style="margin:.4rem 0">${SERVICE_LABELS[svc] ?? svc}</h2>
<p style="color:#94a3b8;line-height:1.5">Mock IIIF Auth login (service <code>${svc}</code>). Click to authenticate — this window closes and the resource loads from its original source.</p>
<button id="b" style="padding:.6rem 1.6rem;font-size:1rem;cursor:pointer;border:0;border-radius:8px;background:#22c55e;color:#06210f;font-weight:600">Log in</button>
</div><script>document.getElementById('b').onclick=function(){fetch(${JSON.stringify(`/demo-auth/session?svc=${svc}`)},{method:'POST'}).then(function(){window.close();});};</script></body>`;

// IIIF Auth token service: returns a (short-lived) token ONLY if the access cookie is
// already set — i.e. there's a valid session. With no session it posts a tokenless reply, so
// a silent re-acquisition fails cleanly (→ the client shows "Sign in"). This is what lets a
// reload restore access without a re-login: the cookie persists, the token is re-derived.
const tokenPage = (svc: string, hasSession: boolean) => `<!doctype html><meta charset="utf-8"><title>token</title><script>
var p=new URLSearchParams(location.search);
(window.opener||window.parent||window).postMessage(${
  hasSession
    ? `{messageId:p.get('messageId'),accessToken:${JSON.stringify(issueToken(svc, Date.now()))},expiresIn:${TOKEN_TTL_MS / 1000}}`
    : `{messageId:p.get('messageId')}`
},'*');
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
      const publicDir = server.config.publicDir;
      let maps: Promise<ProtectionMaps> | undefined;
      const getMaps = () => (maps ??= buildProtectionMaps(publicDir));
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '';
        const path = url.split('?')[0];
        const origin = `http://${req.headers.host ?? 'localhost:3000'}`;
        const svcParam = new URLSearchParams(url.split('?')[1] ?? '').get('svc') ?? 'x';

        if (req.method === 'OPTIONS' && (url.startsWith('/lab/') || url.startsWith('/demo-auth/'))) {
          return reply(res, 204, 'text/plain', '', origin);
        }
        if (url.startsWith('/demo-auth/login')) return reply(res, 200, 'text/html', loginPage(svcParam), origin);
        if (url.startsWith('/demo-auth/session')) {
          // The login window POSTs here to open the session. Set the access cookie SERVER-SIDE
          // as HttpOnly (unreadable by JS → XSS-safe) + SameSite=Lax — the secure, realistic
          // way (vs document.cookie). It still rides OSD tile + token-service requests.
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Set-Cookie', `demo-auth-${svcParam}=1; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_S}`);
          return res.end();
        }
        if (url.startsWith('/demo-auth/token')) {
          // Only issue a token when the access cookie proves an active session.
          const hasSession = cookieHas(req, `demo-auth-${svcParam}`);
          return reply(res, 200, 'text/html', tokenPage(svcParam, hasSession), origin);
        }
        if (!url.startsWith('/lab/')) return next();

        const svc = serviceForRequest(path, await getMaps());
        const isImage = !!svc && path.includes('/iiifserver/');
        const isImageInfo = isImage && /\/info\.json$/.test(path);
        // Images: cookie (OpenSeadragon) OR bearer (Mirador's own refetch). Datasets: bearer
        // only. The bearer is rejected once past its embedded expiry → a 401 the client
        // recovers from by silently re-deriving a fresh token from the (longer-lived) session.
        const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        const bearerOk = !!svc && validateToken(svc, bearer, Date.now());
        const cookieOk = !!svc && cookieHas(req, `demo-auth-${svc}`);
        const authed = !svc ? true : isImage ? bearerOk || cookieOk : bearerOk;

        try {
          // maXRF image description. Unauthed: 401 + the declared auth service, so Mirador
          // drives its own login. Authed: a clean 200 info.json WITHOUT the auth service —
          // like a real IIIF server once you're logged in. Keeping the login service on the
          // authed response leaves Mirador's info-response stuck "degraded" (it never
          // transitions to full), so the canvas never reloads its now-authed tiles.
          if (isImageInfo) {
            const upstream = await fetch(BACKEND + path.replace(/^\/lab/, ''));
            const info = JSON.parse(JSON.stringify(await upstream.json()).split(BACKEND).join(`${origin}/lab`)) as Record<string, unknown>;
            if (!authed) {
              const existing = info.service;
              info.service = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), authServiceFor(origin, svc!)];
            }
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
