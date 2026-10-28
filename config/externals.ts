import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  peerDependencies?: Record<string, string>;
};

// Externalized but not peers: redux is only imported as a type here.
export const HOST_PROVIDED = ['redux'];

const packages = new Set([...Object.keys(pkg.peerDependencies ?? {}), ...HOST_PROVIDED]);

/** True for a package id or any of its subpaths (e.g. react/jsx-runtime, @mui/material/styles). */
export function isExternal(id: string): boolean {
  for (const name of packages) {
    if (id === name || id.startsWith(`${name}/`)) return true;
  }
  return false;
}
