// Loads the built CJS entries with every external stubbed, and checks the ESM entries
// only import externals by bare specifier. Run after `npm run build`.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const dist = path.resolve(__dirname, '../dist');
const isLocal = (id) => id.startsWith('.') || id.startsWith('node:') || path.isAbsolute(id);

// Externals are the real devDependencies when they load in plain Node (so interop is checked
// against real __esModule shapes); the DOM-bound ones fall back to a permissive stub.
const callable = () => {
  const fn = () => p;
  const p = new Proxy(fn, { get: (t, k) => (k in t ? t[k] : p) });
  return p;
};
const stub = () => new Proxy({ __esModule: true, default: callable() }, {
  get: (t, k) => (k in t ? t[k] : callable()),
});

const seen = new Set();
const stubbed = new Set();
const load = Module._load;
Module._load = function (id, ...rest) {
  if (isLocal(id)) return load.call(this, id, ...rest);
  seen.add(id);
  try {
    return load.call(this, id, ...rest);
  } catch {
    stubbed.add(id);
    return stub();
  }
};

const index = require(path.join(dist, 'index.cjs.js'));
const auth = require(path.join(dist, 'mirador-auth.cjs.js'));
Module._load = load;

assert.ok(Object.keys(index).length > 0, 'index.cjs.js has no exports');
assert.ok(Object.keys(auth).length > 0, 'mirador-auth.cjs.js has no exports');
assert.ok(seen.has('react') && seen.has('mirador'), 'externals were not required');

for (const file of ['index.esm.js', 'mirador-auth.esm.js']) {
  const src = fs.readFileSync(path.join(dist, file), 'utf8');
  const specs = [...src.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(specs.includes('react') || file.startsWith('mirador-auth'), `${file}: react not external`);
  assert.ok(!specs.some((s) => /(^|\/)node_modules\//.test(s)), `${file}: bundled node_modules path`);
}
console.log(`dist smoke OK (${seen.size} externals, ${stubbed.size} stubbed, ${Object.keys(index).length}+${Object.keys(auth).length} exports)`);
