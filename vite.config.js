import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const buildId = mode === 'production' ? Date.now().toString() : 'development';
  return {
    plugins: [
      react(),
      {
        name: 'inject-build-id',
        transformIndexHtml(html) {
          return html.replace(/__BUILD_ID__/g, buildId);
        }
      }
    ],
    base: '/',
    server: {
      host: '0.0.0.0',
      port: 4000,
      // Serve index.html for all routes so react-router handles them
      historyApiFallback: true,
    },
  };
});
