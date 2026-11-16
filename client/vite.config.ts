import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'economic-clean-entry-dev',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && /^\\/economic\\/?(?:\\?|$)/.test(req.url)) {
            req.url = req.url.replace(/^\\/economic\\/?/, '/economic.html');
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        work: fileURLToPath(new URL('./work.html', import.meta.url)),
        authEmail: fileURLToPath(new URL('./auth-email.html', import.meta.url)),
        economic: fileURLToPath(new URL('./economic.html', import.meta.url))
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
});
