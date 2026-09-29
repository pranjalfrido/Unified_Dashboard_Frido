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
    // Without this, Vite/Node sometimes binds only the IPv6 loopback (::1) and not
    // IPv4 (127.0.0.1) — browsers that resolve "localhost" to IPv4 first then get
    // ERR_CONNECTION_REFUSED even though the dev server is actually running. Binding
    // the literal IPv4 address (rather than the 'localhost' hostname, which some
    // Node/OS DNS setups still resolve to ::1 only) guarantees the IPv4 side is up.
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://localhost:3001'
    },
    watch: {
      ignored: ['**/*.pbix', '**/*.docx', '**/*.xlsx', '**/*.doc', '**/*.pdf']
    }
  }
})
