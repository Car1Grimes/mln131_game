/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Absolute base: the app is served from the Node server root and has an /admin route.
  base: '/',
  plugins: [react()],
  // Development: the Node server (npm run dev:server) runs on 3001; Vite proxies API and Socket.IO.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
