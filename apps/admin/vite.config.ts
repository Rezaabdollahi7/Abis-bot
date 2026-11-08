import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The admin API runs on the server app; proxy it in development.
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
