import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Service ports. The defaults match the README; set SK_<NAME>_PORT to point the dev server at a different instance. */
const port = (name: string, fallback: number) => Number(process.env[`SK_${name}_PORT`] ?? fallback);

/** In dev, /api/<service>/* is forwarded to that service with the /api prefix removed. In AWS the API gateway does this. */
const service = (port: number) => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/[^/]+/, ''),
});

/** Forwards /api/<path> to <path> on the service. */
const stripApi = (port: number) => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api/, ''),
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // fail loudly instead of silently moving to 5174 (Google sign-in is authorised for 5173 only)
    proxy: {
      '/api/auth': {
        target: `http://localhost:${port('AUTH', 8081)}`,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
      '/api/catalog': service(port('CATALOG', 8082)),
      '/api/cart': service(port('CART', 8083)),
      '/api/assistant': service(port('ASSISTANT', 8086)),
      // order-service and user-service keep their natural paths (/orders, /admin/orders, /addresses)
      '/api/orders': stripApi(port('ORDER', 8085)),
      '/api/admin/orders': stripApi(port('ORDER', 8085)),
      '/api/addresses': stripApi(port('USER', 8084)),
    },
  },
});
