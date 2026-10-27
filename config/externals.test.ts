import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isExternal, HOST_PROVIDED } from './externals';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>;
};

describe('build externals', () => {
  it.each([
    'react',
    'react/jsx-runtime',
    'react-dom/client',
    'react-redux',
    'redux',
    'mirador',
    'mirador/dist/es/src/state/selectors',
    '@mui/material',
    '@mui/material/styles',
    '@mui/icons-material/Close',
    '@emotion/react',
    '@emotion/styled',
    'plotly.js',
    'plotly.js/dist/plotly',
    'react-plotly.js',
    'openseadragon',
    'react-rnd',
  ])('keeps %s out of the bundle', (id) => {
    expect(isExternal(id)).toBe(true);
  });

  it.each(['papaparse', 'ipaddr.js', './local', 'react-select', 'reactivity'])(
    'bundles %s',
    (id) => {
      expect(isExternal(id)).toBe(false);
    },
  );

  it('only leaves type-only packages undeclared as peers', () => {
    for (const name of HOST_PROVIDED) expect(pkg.peerDependencies[name]).toBeUndefined();
    expect(HOST_PROVIDED).toEqual(['redux']);
  });

  it('declares every runtime host package as a peer', () => {
    for (const name of ['@mui/icons-material', 'openseadragon', 'react-rnd']) {
      expect(pkg.peerDependencies[name]).toBeDefined();
    }
  });
});
