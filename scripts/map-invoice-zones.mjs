// Adds our zone to a courier invoice, keyed on (pickup city, destination pincode).
//
// The invoice carries a pickup CITY, not a pickup pincode, while zone_mapped_strict.csv is
// keyed on the pincode LANE. So the lookup is built at city level: for each
// (pickup_city, drop_pincode) the sheet's rows are folded to one zone by majority vote.
// Measured on the source: 98.89% of city+drop combinations resolve to a single zone
// already; the 1.11% that conflict are all A-vs-B (same city vs same state), which is
// exactly what varies when a city has warehouses both inside and outside its limits.
//
// Two fallbacks, in order, and each row records which one was used so the output can be
// audited rather than trusted blindly:
//   city+pin  exact (pickup_city, drop_pincode)      — the intended key
//   pin       drop pincode alone, majority across all pickups
//   (blank)   unresolved — left empty, never guessed
//
// Usage: node scripts/map-invoice-zones.mjs "<invoice.xlsx>" ["<zone csv>"] ["<out.xlsx>"]
import XLSX from 'xlsx'
import { readFileSync } from 'fs'

const INVOICE = process.argv[2]
const ZONECSV = process.argv[3] || 'c:/Users/TusharGupta/Downloads/zone_mapped_strict.csv'
const OUT = process.argv[4] || INVOICE.replace(/\.xlsx?$/i, '_zoned.xlsx')
if (!INVOICE) { console.error('usage: node scripts/map-invoice-zones.mjs <invoice.xlsx>'); process.exit(1) }

const VALID = new Set(['A', 'B', 'C', 'D', 'E'])
const UC = v => String(v ?? '').trim().toUpperCase()
const PIN = v => {
  const s = String(v ?? '').trim()
  const m = s.match(/\d{6}/)
  return m ? m[0] : ''
}

// RFC4180 parse. A naive split(',') corrupts this file — ~2,850 rows carry quoted address
// fragments containing commas, which shifts every later column and lands state names in the
// Zone column.
function parseLine(line) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out
}

// ---- build lookups from the zone sheet ----
const raw = readFileSync(ZONECSV, 'utf8').split(/\r?\n/).filter(Boolean)
const ZH = parseLine(raw[0]).map(h => h.trim())
const zi = Object.fromEntries(ZH.map((h, i) => [h, i]))
for (const need of ['pickup_city', 'drop_pincode', 'Zone']) {
  if (zi[need] === undefined) throw new Error(`zone sheet missing column: ${need}`)
}

const cityPinVotes = new Map()   // "CITY|pin" -> {zone: count}
const pinVotes = new Map()       // "pin"      -> {zone: count}
const vote = (m, k, z) => {
  if (!m.has(k)) m.set(k, {})
  const v = m.get(k)
  v[z] = (v[z] || 0) + 1
}
for (const line of raw.slice(1)) {
  const c = parseLine(line)
  const z = UC(c[zi.Zone])
  const dp = PIN(c[zi.drop_pincode])
  if (!VALID.has(z) || !dp) continue
  const city = UC(c[zi.pickup_city])
  if (city) vote(cityPinVotes, `${city}|${dp}`, z)
  vote(pinVotes, dp, z)
}
const best = v => Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]
const cityPin = new Map([...cityPinVotes].map(([k, v]) => [k, best(v)]))
const pinOnly = new Map([...pinVotes].map(([k, v]) => [k, best(v)]))
console.log(`zone sheet: ${cityPin.size} city+pin keys, ${pinOnly.size} pincode keys`)

// ---- read invoice ----
const wb = XLSX.readFile(INVOICE)
const sheetName = wb.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
if (!rows.length) throw new Error('invoice sheet is empty')

const cols = Object.keys(rows[0])
const find = (...cands) => cols.find(c => cands.some(x => c.toLowerCase().trim() === x)) ||
  cols.find(c => cands.some(x => c.toLowerCase().includes(x)))
const CITY = find('pickup city', 'pickup_city', 'origin_city')
const DEST = find('destination_pin', 'destination pin', 'drop_pincode', 'dest_pin')
const THEIRS = find('zone')
if (!CITY || !DEST) throw new Error(`could not find pickup city / destination pin columns in: ${cols.join(', ')}`)
console.log(`invoice: ${rows.length} rows | city="${CITY}" dest="${DEST}"${THEIRS ? ` theirs="${THEIRS}"` : ''}`)

// ---- map ----
const tally = { 'city+pin': 0, pin: 0, unresolved: 0 }
const zoneDist = {}, matrix = new Map()
const out = rows.map(r => {
  const city = UC(r[CITY]), dp = PIN(r[DEST])
  let z = null, how = 'unresolved'
  if (city && dp && cityPin.has(`${city}|${dp}`)) { z = cityPin.get(`${city}|${dp}`); how = 'city+pin' }
  else if (dp && pinOnly.has(dp)) { z = pinOnly.get(dp); how = 'pin' }
  tally[how]++
  if (z) zoneDist[z] = (zoneDist[z] || 0) + 1
  if (THEIRS) {
    const k = `${UC(r[THEIRS]) || '(blank)'}|${z || '(none)'}`
    matrix.set(k, (matrix.get(k) || 0) + 1)
  }
  return { ...r, frido_zone: z, frido_zone_source: how }
})

const ws = XLSX.utils.json_to_sheet(out)
const nb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(nb, ws, sheetName.slice(0, 31))
XLSX.writeFile(nb, OUT)

const pct = n => ((n / rows.length) * 100).toFixed(2) + '%'
console.log('\nmatch source:')
for (const k of ['city+pin', 'pin', 'unresolved']) console.log(`  ${k.padEnd(10)} ${String(tally[k]).padStart(6)}  ${pct(tally[k])}`)
console.log('\nour zone distribution:')
for (const [k, v] of Object.entries(zoneDist).sort()) console.log(`  ${k}  ${String(v).padStart(6)}  ${pct(v)}`)

if (THEIRS) {
  // Where our zone and the courier's disagree, the invoice may be billed at the wrong slab.
  let same = 0, diff = 0
  for (const [k, n] of matrix) {
    const [a, b] = k.split('|')
    if (a === b) same += n; else if (b !== '(none)') diff += n
  }
  console.log(`\nvs courier's own zone: agree ${same} (${pct(same)}) · differ ${diff} (${pct(diff)})`)
  console.log('theirs -> ours (top disagreements):')
  for (const [k, n] of [...matrix].sort((a, b) => b[1] - a[1])) {
    const [a, b] = k.split('|')
    if (a === b || b === '(none)') continue
    console.log(`  ${a} -> ${b}  ${n}`)
  }
}
console.log('\nwritten: ' + OUT)
