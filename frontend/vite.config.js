import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// While developing, the screens run on port 5173 and pass every /api request
// on to the Python backend on port 8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
