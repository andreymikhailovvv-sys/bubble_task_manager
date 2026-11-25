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
          const [pathname, query] = (req.url || '').split('?', 2);
          if (pathname === '/android-mascot' || pathname === '/android-mascot/') {
            req.url = '/android-mascot.html' + (query ? '?' + query : '');
          }
          if (pathname === '/economic' || pathname === '/economic/') {
            req.url = '/economic.html' + (query ? '?' + query : '');
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
        economic: fileURLToPath(new URL('./economic.html', import.meta.url)),
        androidMascot: fileURLToPath(new URL('./android-mascot.html', import.meta.url))
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
