// A tool call with no command must be refused, never crash /chat (26 Nov 2026: "Chat failed" after a photo question).
import { isAllowed, blockReason } from '../lib/safety.js'
let bad = 0
const check = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) bad++ }
for (const target of ['bigquery', 'supabase', 'repo', undefined]) {
  check(`isAllowed(undefined, ${target}) is false and does not throw`, (() => { try { return isAllowed(undefined, target) === false } catch { return false } })())
  check(`blockReason(undefined, ${target}) says why and does not throw`, (() => { try { return /no command/.test(blockReason(undefined, target)) } catch { return false } })())
}
check('isAllowed(null) is false', isAllowed(null, 'bigquery') === false)
check('a normal select still passes the first check', typeof isAllowed('SELECT 1', 'bigquery') === 'boolean')
console.log(bad ? `\n${bad} failed` : '\nAll checks passed')
process.exit(bad ? 1 : 0)
