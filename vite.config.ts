import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
  ],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  server: {
    proxy: {
      '/api/koios': {
        target: 'https://preprod.koios.rest/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/koios/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/api/lighthouse': {
        target: 'https://api.lighthouse.storage',
        changeOrigin: true,
        rewrite: (path) => {
          // Rewrite /api/lighthouse/add to /api/v0/add (IPFS endpoint)
          // or /api/lighthouse/upload to /api/upload (Lighthouse endpoint)
          if (path.includes('/add')) {
            return path.replace(/^\/api\/lighthouse/, '/api/v0');
          }
          // Default to /api/upload for Lighthouse upload endpoint
          return path.replace(/^\/api\/lighthouse/, '/api');
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Lighthouse proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward Authorization header if present
            if (req.headers.authorization) {
              proxyReq.setHeader('Authorization', req.headers.authorization);
            }
            console.log('Lighthouse proxy request:', req.method, req.url);
          });
        },
      },
    },
  },
});
