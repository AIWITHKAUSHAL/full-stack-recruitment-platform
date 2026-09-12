// vitest/config re-exports Vite's defineConfig and adds the `test` block,
// so one config file serves both the dev server and the test runner.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true, // required so the container's dev server is reachable from the host
    port: 5173,
    // Local development calls the API with the relative base "/api/v1" and this
    // proxy forwards it. That keeps the browser on one origin (no CORS
    // preflight locally) and mirrors production, where CloudFront routes
    // /api/* to the ALB under the same domain.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Vendor code changes far less often than app code; splitting it means a
    // feature deploy only invalidates one small chunk in CloudFront.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
