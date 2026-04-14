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
            if (id.includes('recharts')) return 'charts'
            if (id.includes('react-simple-maps') || id.includes('d3-geo')) return 'maps'
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('@google/genai')) return 'genai'
            if (id.includes('@tanstack/react-table')) return 'table'
            if (
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
})
