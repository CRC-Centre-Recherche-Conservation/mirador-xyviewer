import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { isExternal } from './config/externals';

export default defineConfig({
  plugins: [
    react({
      // Enable React DevTools in development
      babel: {
        plugins: process.env.NODE_ENV === 'development' ? [] : [],
      },
    }),
    dts({ tsconfigPath: './tsconfig.build.json' }),
  ],
  define: {
    // Enable Redux DevTools in development
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  build: {
    lib: {
      // Multi-entry: the core (".") plus the optional "mirador-auth" subexport, which
      // is the only entry allowed to couple to Mirador's auth-state shape.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'mirador-auth': resolve(__dirname, 'src/mirador-auth/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'esm' : format}.js`,
    },
    rollupOptions: {
      // Every peer/host package and its subpaths stays out of the bundle.
      external: isExternal,
      // 'auto' unwraps __esModule default exports of external CJS deps.
      output: { exports: 'named', interop: 'auto' },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
