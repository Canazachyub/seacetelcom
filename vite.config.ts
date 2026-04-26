import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/seacetelcom/',
  server: {
    proxy: {
      '/ocds-api': {
        target: 'https://contratacionesabiertas.oece.gob.pe',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocds-api/, '/api/v1'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://contratacionesabiertas.oece.gob.pe/',
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('@google/genai')) return 'genai'
            if (
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/react/') ||
              id.includes('/react-is/') ||
              id.includes('/scheduler/') ||
              id.includes('/prop-types/') ||
              id.includes('/recharts/') ||
              id.includes('/react-smooth/') ||
              id.includes('/victory-vendor/') ||
              id.includes('/react-simple-maps/') ||
              id.includes('/d3-') ||
              id.includes('/topojson') ||
              id.includes('/@tanstack/react-table/') ||
              id.includes('/react-window/')
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
})
