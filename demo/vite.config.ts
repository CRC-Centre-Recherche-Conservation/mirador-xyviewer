import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, join } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createGunzip, createBrotliDecompress, createInflate } from 'zlib';

const DEFAULT_SOURCE_URL = 'http://192.168.122.250:8000';
const PROXY_PREFIX = '/__backend';

// Backend path prefixes that the app fetches via XHR/fetch and therefore need
// to be same-origin (proxied) to avoid CORS. Everything else (annotation id,
// /resources, /rdm, /report) is only shown as a clickable link — top-level
// navigation is not subject to CORS, so those keep the real backend URL.
//  - /files       dataset bodies (datasetFetcher)
//  - /iiifserver  IIIF image tiles (OpenSeadragon)
//  - /manifest    Manifest-type annotation bodies (Mirador fetches these)
const FETCHED_PREFIXES = ['/files', '/iiifserver', '/manifest'];

// Once a Manifest/annotation is fetched through the proxy, every backend path
// it references must also stay same-origin (the backend has no CORS and
// Mirador's `new URL()` rejects relative paths). So inside proxied response
// bodies we absolutize ALL backend-relative prefixes to the proxy, not just
// the fetched ones.
const BACKEND_PATH_PREFIXES = [
  '/files',
  '/iiifserver',
  '/manifest',
  '/iiif',
  '/resources',
  '/rdm',
  '/report',
];

interface RewriteConfig {
  sourceUrl: string;
  targetUrl: string;
  iiifVersion: string;
  proxyPrefix: string;
  shouldRewrite: boolean;
}

function readRewriteConfig(): RewriteConfig {
  // npm exposes `npm run X --foo=bar` as process.env.npm_config_foo
  const cliUrl = process.env.npm_config_url || '';
  const cliSource = process.env.npm_config_source || '';
  const cliVersion = process.env.npm_config_iiif_version || process.env.npm_config_version || '';

  const sourceUrl = (cliSource || process.env.DEMO_SOURCE_URL || DEFAULT_SOURCE_URL).replace(/\/$/, '');
  const targetUrl = (cliUrl || process.env.DEMO_API_URL || '').replace(/\/$/, '');
  const iiifVersion = cliVersion || process.env.DEMO_IIIF_VERSION || '';

  return {
    sourceUrl,
    targetUrl,
    iiifVersion,
    proxyPrefix: PROXY_PREFIX,
    shouldRewrite: Boolean(targetUrl) || Boolean(iiifVersion),
  };
}

/**
 * Rewrites the hardcoded backend URL in JSON files served from public/.
 *
 * Two rewrite targets:
 *  - Fetched resources (FETCHED_PREFIXES) -> same-origin proxy path
 *    (http://localhost:PORT/__backend/...) so XHR/fetch is not blocked by CORS.
 *  - Everything else -> the real target URL, so the UI shows the canonical
 *    address and link clicks (navigation, not CORS-restricted) work.
 *
 * Optionally injects an IIIF API version segment after /iiif/.
 *
 * Usage:
 *   npm run dev:demo                                          (no rewrite, keeps default URL)
 *   npm run dev:demo --url=https://example.trycloudflare.com
 *   npm run dev:demo --url=https://example.trycloudflare.com --iiif-version=v3
 *   npm run dev:demo --source=http://other-host:8000 --url=https://...
 *
 * Env-var equivalents also work: DEMO_API_URL, DEMO_IIIF_VERSION, DEMO_SOURCE_URL.
 */
function rewriteBackendUrlPlugin(publicDir: string, cfg: RewriteConfig): Plugin {
  const transform = (content: string, absBase: string): string => {
    let out = content;
    if (cfg.targetUrl) {
      // 1) Fetched resource prefixes -> same-origin proxy (absolute, so
      //    isValidUrl() in src/utils/security.ts accepts it).
      for (const prefix of FETCHED_PREFIXES) {
        out = out
          .split(`"${cfg.sourceUrl}${prefix}/`)
          .join(`"${absBase}${cfg.proxyPrefix}${prefix}/`);
      }
      // 2) Remaining occurrences -> real target URL (clean display).
      out = out.split(cfg.sourceUrl).join(cfg.targetUrl);
    }
    if (cfg.iiifVersion) {
      // Insert /<version> right after iiif/ (but only if not already versioned)
      const versioned = new RegExp(`/iiif/(?!v\\d+/)`, 'g');
      out = out.replace(versioned, `/iiif/${cfg.iiifVersion}/`);
    }
    return out;
  };

  return {
    name: 'demo-rewrite-backend-url',
    apply: 'serve',
    configureServer(server) {
      if (!cfg.shouldRewrite) {
        server.config.logger.info(
          `[demo-rewrite] no rewrite (keeping ${cfg.sourceUrl}). Pass --url=https://... to override.`,
        );
        return;
      }
      server.config.logger.info(
        `[demo-rewrite] ${cfg.sourceUrl} -> ${cfg.targetUrl || '(unchanged)'} ` +
          `(fetched ${FETCHED_PREFIXES.join(',')} via ${cfg.proxyPrefix})` +
          `${cfg.iiifVersion ? ` | iiif/${cfg.iiifVersion}/` : ''}`,
      );
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.endsWith('.json')) return next();
        const url = req.url.split('?')[0];
        if (url.startsWith(cfg.proxyPrefix)) return next();
        const filePath = join(publicDir, url);
        if (!existsSync(filePath)) return next();
        try {
          const raw = await readFile(filePath, 'utf8');
          const host = req.headers.host || 'localhost:3000';
          const proto = (req.headers['x-forwarded-proto'] as string) ||
            ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
          const rewritten = transform(raw, `${proto}://${host}`);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(rewritten);
        } catch (err) {
          next(err as Error);
        }
      });
    },
  };
}

/**
 * Rewrite URLs inside a proxied response body so the browser/Mirador keeps
 * hitting the same-origin proxy for nested fetched resources (e.g. an IIIF
 * image info.json whose @id/tile URLs would otherwise point at the CORS-less
 * backend). Handles plain and JSON-escaped (\/) slashes.
 */
function rewriteProxiedBody(body: string, cfg: RewriteConfig, absBase: string): string {
  let out = body;
  const proxied = `${absBase}${cfg.proxyPrefix}`;
  const escProxied = proxied.replace(/\//g, '\\/');
  // Absolute backend URLs the backend may echo back -> same-origin proxy
  for (const u of [cfg.targetUrl, cfg.sourceUrl]) {
    if (!u) continue;
    const escU = u.replace(/\//g, '\\/');
    out = out.split(`"${u}`).join(`"${proxied}`);
    out = out.split(`"${escU}`).join(`"${escProxied}`);
  }
  // Relative backend paths -> absolute same-origin proxy URL (so new URL() works)
  for (const prefix of BACKEND_PATH_PREFIXES) {
    const escPrefix = prefix.replace(/\//g, '\\/');
    out = out.split(`"${prefix}/`).join(`"${proxied}${prefix}/`);
    out = out.split(`"${escPrefix}\\/`).join(`"${escProxied}${escPrefix}\\/`);
  }
  return out;
}

function makeConfigure(cfg: RewriteConfig): ProxyOptions['configure'] {
  return (proxy) => {
    proxy.on('proxyRes', (proxyRes, req, res) => {
      const ct = String(proxyRes.headers['content-type'] || '');
      const isText = /json|text|javascript|xml|\+json/i.test(ct);
      const headers = { ...proxyRes.headers };
      if (isText) {
        delete headers['content-length'];
        delete headers['content-encoding'];
      }
      res.writeHead(proxyRes.statusCode || 200, headers);
      if (!isText) {
        proxyRes.pipe(res);
        return;
      }
      const enc = String(proxyRes.headers['content-encoding'] || '');
      let stream: NodeJS.ReadableStream = proxyRes;
      if (enc === 'gzip') stream = proxyRes.pipe(createGunzip());
      else if (enc === 'br') stream = proxyRes.pipe(createBrotliDecompress());
      else if (enc === 'deflate') stream = proxyRes.pipe(createInflate());
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      stream.on('end', () => {
        const host = req.headers.host || 'localhost:3000';
        const proto = (req.headers['x-forwarded-proto'] as string) ||
          ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
        const body = Buffer.concat(chunks).toString('utf8');
        res.end(rewriteProxiedBody(body, cfg, `${proto}://${host}`));
      });
      stream.on('error', () => res.end());
    });
  };
}

function buildProxy(cfg: RewriteConfig): Record<string, ProxyOptions> | undefined {
  if (!cfg.targetUrl) return undefined;
  const common: ProxyOptions = {
    target: cfg.targetUrl,
    changeOrigin: true,
    secure: false,
    selfHandleResponse: true,
    configure: makeConfigure(cfg),
  };
  const entries: Record<string, ProxyOptions> = {
    [cfg.proxyPrefix]: {
      ...common,
      rewrite: (path) => path.replace(new RegExp(`^${cfg.proxyPrefix}`), ''),
    },
  };
  // Also proxy bare backend paths in case any relative URL reaches the browser
  // unrewritten (resolved against localhost).
  for (const prefix of BACKEND_PATH_PREFIXES) {
    entries[prefix] = common;
  }
  return entries;
}

/**
 * Vite config for demo application
 * Includes development server configuration with DevTools support
 */
export default defineConfig(({ mode }) => {
  const rewriteCfg = readRewriteConfig();
  return {
    root: resolve(__dirname),
    publicDir: resolve(__dirname, 'public'),
    base: mode === 'production' ? '/mirador-xyviewer/' : '/',
    plugins: [react(), rewriteBackendUrlPlugin(resolve(__dirname, 'public'), rewriteCfg)],
    resolve: {
      alias: {
        '@': resolve(__dirname, '../src'),
      },
    },
    server: {
      port: 3000,
      open: true,
      // Enable CORS for loading external manifests
      cors: true,
      proxy: buildProxy(rewriteCfg),
    },
    // Source maps for debugging
    build: {
      sourcemap: true,
    },
    // Remove console.log/debug in production (keep warn/error)
    esbuild: {
      pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
      drop: mode === 'production' ? ['debugger'] : [],
    },
    // Define for Redux DevTools
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
  };
});
