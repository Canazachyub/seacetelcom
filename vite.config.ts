import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/seacetelcom/',
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
