import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  const apiPort = env['API_PORT'] ?? '3000';
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: Number(env['WEB_PORT'] ?? 5173),
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}` },
        '/socket.io': { target: `http://127.0.0.1:${apiPort}`, ws: true },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
