/**
 * Demo-only Vite dev middleware: a mock IIIF Content Search (API 1.0) endpoint.
 * It indexes the bundled v2 annotation lists (label + target) once at startup and,
 * on GET /demo-search?q=…, returns a sc:AnnotationList whose resources/hits match
 * the query. Targets reference …/AVRANCHES_MS059/<N>, which exist in BOTH the v2 and
 * v3 demo manifests, so one endpoint serves both. NOT part of the published plugin.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEARCH_PATH = '/demo-search';

interface SearchEntry {
  id: string;
  label: string;
  on: string;
}

/** Expand a point region (w/h ≤ 5) into a visible box so the hit highlight is clickable. */
function widenRegion(on: string): string {
  return on.replace(/#xywh=(\d+),(\d+),(\d+),(\d+)$/, (_m, x, y, w, h) => {
    const W = Math.max(Number(w), 60);
    const H = Math.max(Number(h), 60);
    return `#xywh=${x},${y},${W},${H}`;
  });
}

/** Read label + target from each bundled v2 annotation list. */
function buildIndex(publicDir: string): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const lists = readdirSync(publicDir).filter((f) => /^annotations-v2-canvas-\d+\.json$/.test(f));
  for (const name of lists) {
    let json: { resources?: Array<{ '@id'?: unknown; label?: unknown; on?: unknown }> };
    try {
      json = JSON.parse(readFileSync(join(publicDir, name), 'utf8'));
    } catch {
      continue;
    }
    for (const ann of json.resources ?? []) {
      const id = (ann as { '@id'?: unknown })['@id'];
      if (typeof id === 'string' && typeof ann.label === 'string' && typeof ann.on === 'string') {
        entries.push({ id, label: ann.label, on: widenRegion(ann.on) });
      }
    }
  }
  return entries;
}

/** Split a label around the (case-insensitive) query for IIIF hit before/match/after. */
function highlightAround(label: string, q: string): { before: string; match: string; after: string } {
  const i = label.toLowerCase().indexOf(q);
  if (i < 0) return { before: '', match: label, after: '' };
  return { before: label.slice(0, i), match: label.slice(i, i + q.length), after: label.slice(i + q.length) };
}

/** Build a Search API 1.0 response for the matched entries. */
function searchResponse(serviceId: string, q: string, matches: SearchEntry[]) {
  return {
    '@context': [
      'http://iiif.io/api/presentation/2/context.json',
      'http://iiif.io/api/search/1/context.json',
    ],
    '@id': `${serviceId}?q=${encodeURIComponent(q)}`,
    '@type': 'sc:AnnotationList',
    within: { '@type': 'sc:Layer', total: matches.length },
    resources: matches.map((m) => ({
      '@id': m.id,
      '@type': 'oa:Annotation',
      motivation: 'oa:highlighting',
      resource: { '@type': 'cnt:ContentAsText', label: m.label, chars: m.label },
      on: m.on,
    })),
    hits: matches.map((m) => {
      const { before, match, after } = highlightAround(m.label, q);
      return { '@type': 'search:Hit', annotations: [m.id], before, match, after };
    }),
  };
}

export function demoSearchPlugin(): Plugin {
  return {
    name: 'demo-search',
    configureServer(server) {
      const publicDir = server.config.publicDir;
      let index: SearchEntry[] | undefined;
      const getIndex = () => (index ??= buildIndex(publicDir));
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(SEARCH_PATH)) return next();
        const origin = `http://${req.headers.host ?? 'localhost:3000'}`;
        const q = (new URLSearchParams(url.split('?')[1] ?? '').get('q') ?? '').trim().toLowerCase();
        const matches = q ? getIndex().filter((e) => e.label.toLowerCase().includes(q)) : [];
        const body = JSON.stringify(searchResponse(`${origin}${SEARCH_PATH}`, q, matches));
        res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}
