import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for demo application
 * Includes development server configuration with DevTools support
 */
export default defineConfig(({ mode }) => ({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  base: mode === 'production' ? '/mirador-xyviewer/' : '/',
  plugins: [react()],
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
}));
