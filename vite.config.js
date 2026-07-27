import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'recharts': ['recharts'],
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
