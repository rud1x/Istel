import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import config from './config.json';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('phosphor-react')) return 'icons';
            if (id.includes('qrcode-generator')) return 'qr';
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: config.ports.devServer || 5173,
    strictPort: true,
  },
});
