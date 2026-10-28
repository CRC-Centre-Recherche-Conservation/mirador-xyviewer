import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { demoAuthPlugin } from './vite-demo-auth';
import { demoSearchPlugin } from './vite-demo-search';

/**
 * Vite config for demo application
 * Includes development server configuration with DevTools support
 */
export default defineConfig(({ mode }) => ({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  base: mode === 'production' ? '/mirador-xyviewer/' : '/',
  plugins: [react(), demoAuthPlugin(), demoSearchPlugin()],
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
  },
  build: {
    // Source maps for debugging
    sourcemap: true,
    // Remove console.log/debug in production (keep warn/error); the Oxc minifier already drops `debugger`.
    rolldownOptions:
      mode === 'production'
        ? { treeshake: { manualPureFunctions: ['console.log', 'console.debug'] } }
        : {},
  },
  // Define for Redux DevTools
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
}));
