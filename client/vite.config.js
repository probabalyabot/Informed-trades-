import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser only ever talks to Vite; /api is forwarded to Express.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
