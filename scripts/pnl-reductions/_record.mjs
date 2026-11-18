// Shared by render-parity.mjs (browser) and node-parity.mjs (Node): record a range from BigQuery
// once, replay every phase on the same rows, and build each app version's P&L inputs.
//   old: fast + origin/main's pnl_detail (its own pickPhaseFields on the same payload)
//   new: fast + this branch's pnl_detail          full: the full response (rows present)
//   adsOld: fast + old pnl_detail + ads_detail    adsNew: fast + pnl_margin + ads_detail
// Every object is JSON round-tripped, as the browser receives it.
// Needs SA_KEY_PATH (BigQuery key) and COGS_ENV_PATH (a .env with SUPABASE_URL), both read in place.
import { readFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { execSync } from 'child_process'
import { loadKeyIntoEnv, importBQClient, importInstrumentedHandler, recordReplay, callHandler, quiet } from '../staged-loading/_harness.mjs'
import { mergePhase } from '../../src/bqPhaseMerge.js'
import { checkPnlPayload } from './payload-check.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')
export const OLD = join(HERE, 'harness', '.parity-old')

// origin/main's src/ and api/ (inside the repo tree so their imports resolve node_modules)
export function exportOld({ reuse = false } = {}) {
  const base = execSync('git merge-base HEAD origin/main', { cwd: ROOT }).toString().trim()
  if (!reuse || !existsSync(join(OLD, 'src', 'pnl', 'PnLPage.jsx'))) {
    rmSync(OLD, { recursive: true, force: true }); mkdirSync(OLD, { recursive: true })
    execSync(`git archive --format=tar ${base} src api | tar -x -C "${OLD}"`, { cwd: ROOT, stdio: 'inherit' })
  }
  return base
}

export async function setupRecorder() {
  const oldPhases = await import(pathToFileURL(join(OLD, 'api', '_bqPhases.js')).href)
  loadKeyIntoEnv()
  const { getBQ } = await importBQClient()
  const handler = await importInstrumentedHandler()
  globalThis.__NO_CACHE = true
  const rr = recordReplay(getBQ())
  for (const line of readFileSync(process.env.COGS_ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_URL\s*=\s*"?(.*?)"?\s*$/)
    if (m && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = m[1]
  }
  const cogsHandler = (await import(pathToFileURL(join(ROOT, 'api', 'cogs-monthly.js')).href)).default

  async function cogsFor(start, end) {
    const r = await quiet(() => callHandler(cogsHandler, { startMonth: `${start.slice(0, 7)}-01`, endMonth: `${end.slice(0, 7)}-01` }))
    if (r.status !== 200) throw new Error('cogs-monthly ' + r.status + ' ' + JSON.stringify(r.body))
    return r.body
  }

  async function recordRange(body, { parts = false } = {}) {
    rr.store.clear(); rr.setReplayOnly(false)
    const full = await quiet(() => callHandler(handler, { ...body }))
    if (full.status !== 200) throw new Error(`full ${full.status}`)
    rr.setReplayOnly(true)
    const ph = {}
    for (const p of ['fast', 'pnl_detail', 'pnl_margin', 'ads_detail']) {
      const r = await quiet(() => callHandler(handler, { ...body, phase: p }))
      if (r.status !== 200) throw new Error(`${p} ${r.status}`)
      ph[p] = r.body
    }
    rr.store.clear()
    const l1 = [...checkPnlPayload(full.body, ph.pnl_detail), ...checkPnlPayload(full.body, ph.pnl_margin, ['shopify', 'amzSC', 'flipkart'])]
    const rt = x => JSON.parse(JSON.stringify(x))
    const fast = rt(ph.fast)
    const oldPnl = rt(oldPhases.pickPhaseFields(full.body, oldPhases.getPhaseDef('pnl_detail')))
    return {
      l1,
      old: mergePhase(fast, oldPnl),
      new: mergePhase(fast, rt(ph.pnl_detail)),
      adsOld: mergePhase(mergePhase(fast, oldPnl), rt(ph.ads_detail)),
      adsNew: mergePhase(mergePhase(fast, rt(ph.pnl_margin)), rt(ph.ads_detail)),
      full: rt(full.body),
      parts: parts ? { fast, oldPnl, pnl_detail: ph.pnl_detail, pnl_margin: ph.pnl_margin } : {},
      sizes: { full: JSON.stringify(full.body).length, oldPnl: JSON.stringify(oldPnl).length, pnl_detail: JSON.stringify(ph.pnl_detail).length, pnl_margin: JSON.stringify(ph.pnl_margin).length },
    }
  }
  return { recordRange, cogsFor }
}
