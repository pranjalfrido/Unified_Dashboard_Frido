import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
          if (id.includes('node_modules/recharts')) return 'recharts'
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    },
    watch: {
      ignored: ['**/*.pbix', '**/*.docx', '**/*.xlsx', '**/*.doc', '**/*.pdf']
    }
  }
})
