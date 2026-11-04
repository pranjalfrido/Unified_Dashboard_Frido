// Vite server for the P&L parity pages (PNL_REDUCTIONS_PLAN.md §5, layer 2): old.html renders
// origin/main's PnLPage (exported to .parity-old/ by render-parity.mjs), new.html this branch's.
// No app shell, no login: Supabase is stubbed (authFetch then sends no token), and the parity
// script answers the page's two requests (/snd-rates.json, /api/cogs-monthly) and the data files.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../../..')

export default defineConfig({
  root: here,
  logLevel: 'warn',
  plugins: [
    react(),
    {
      name: 'supabase-stub',
      enforce: 'pre',
      resolveId(id, importer) {
        if (importer && /authFetch\.js$/.test(importer) && /supabase\.js$/.test(id)) return path.join(here, 'supabase-stub.js')
      },
    },
  ],
  server: { port: Number(process.env.PARITY_PORT || 5199), strictPort: true, fs: { allow: [ROOT] } },
  optimizeDeps: { entries: ['old.html', 'new.html'] },
})
