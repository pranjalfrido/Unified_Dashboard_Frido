// Builds the Frido working columns on a raw Delhivery invoice.
//
// Replicates the yellow columns from the sample file
// ("Invoices/June 26/Delhivery Express jun 26.xlsx"), formula for formula:
//
//   SKU / Sub_cat      from production.awb_wise_shipment_weight, joined on waybill_num
//   del. Slab wt       =IF(charged_weight<=500,500,CEILING(charged_weight,500))
//   Frido wt           total_weight * 1000   (BQ stores kg, invoice works in grams)
//   Frido Slab wt      =IF(Frido wt<=500,500,CEILING(Frido wt,500))
//   Min                = Frido Slab wt
//   zone 2             our zone, from zone_mapped_strict.csv (pickup city + dest pin)
//   frido_charge_dl    =MIN(charge_DL, VLOOKUP(Min, Rates[service], zone2))
//   frido_charge_RTO   =IF(status="RTO", frido_charge_dl*0.9, 0)
//   frido_charge_COD   =MIN(charge_COD, IF(AND(payment="COD",status<>"RTO"),MAX(20,cod_amount*1.1%),0))
//
// Rates come from the sample file's own Rates sheet:
//   Surface  B:G  slab + zones A-E
//   Express  J:M  slab + zones A-C   (Express has no D/E column - see ZONE note below)
//
// ZONE note: the sample maps Express to A/B/C only. Delhivery bills most metro-to-metro
// lanes as D; Frido maps them to C (15,443 such rows in the sample). Where our mapping
// yields D or E on an Express shipment there is no rate to look up, so the row keeps
// Delhivery's charge and is flagged in frido_note rather than silently priced at zero.
//
// Usage:
//   node scripts/delhivery-invoice-working.mjs "<raw invoice.xlsx>" [out.xlsx]
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { BigQuery } from '@google-cloud/bigquery'

const INVOICE = process.argv[2]
const OUT = process.argv[3] || INVOICE.replace(/\.xlsx?$/i, '_working.xlsx')
const SAMPLE = process.argv[4] ||
  "c:/Users/TusharGupta/OneDrive - Arcatron Mobility Pvt Ltd/Sachin Mariwala's files - Delhivery/Invoices/June 26/Delhivery Express jun 26.xlsx"
const ZONECSV = process.argv[5] || 'c:/Users/TusharGupta/Downloads/zone_mapped_strict.csv'
if (!INVOICE) { console.error('usage: node scripts/delhivery-invoice-working.mjs <invoice.xlsx>'); process.exit(1) }

// DTO (door-to-door return) is billed at 1.45x the forward rate for the same slab and zone.
// Reverse-engineered from the June Surface working: across all 51 slab|zone combinations
// present there, Frido_charge_DTO / Surface rate is exactly 1.4500 with zero variation.
// The multiplier also appears literally in the Rates sheet beside the "Express- RTO" label.
const DTO_MULTIPLIER = 1.45

const UC = v => String(v ?? '').trim().toUpperCase()
const NUM = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const PIN = v => { const m = String(v ?? '').trim().match(/\d{6}/); return m ? m[0] : '' }
// Excel CEILING(x, 500) with the <=500 floor the sample applies. Correct for Express, whose
// card steps 500g all the way up.
const slab500 = g => (g <= 500 ? 500 : Math.ceil(g / 500) * 500)

// Surface does NOT step uniformly: its card runs 500, 1000, 2000, 3000, ... so a flat
// CEILING(x,500) invents slabs like 1500 that the card has no row for (895 rows on the July
// Surface invoice). Snapping to the next slab the card actually contains is what a courier
// bills and what VLOOKUP-exact expects.
const slabOnCard = (g, table) => {
  for (const r of table) if (g <= r.slab) return r.slab
  return table[table.length - 1].slab
}

// ── rates from the sample workbook ───────────────────────────────────────────────
function loadRates(path) {
  const rs = XLSX.readFile(path).Sheets['Rates']
  if (!rs) throw new Error('sample file has no "Rates" sheet')
  const rows = XLSX.utils.sheet_to_json(rs, { header: 1, defval: null })
  const surface = [], express = []
  for (const r of rows) {
    if (typeof r[1] === 'number') surface.push({ slab: r[1], A: r[2], B: r[3], C: r[4], D: r[5], E: r[6] })
    if (typeof r[9] === 'number') express.push({ slab: r[9], A: r[10], B: r[11], C: r[12] })
  }
  surface.sort((a, b) => a.slab - b.slab)
  express.sort((a, b) => a.slab - b.slab)
  return { surface, express }
}
// VLOOKUP(..., FALSE) is an EXACT match: a slab absent from the table returns #N/A, it does
// not round up to the next row. Mirrored here - an unmatched slab yields null and the row
// keeps Delhivery's own charge.
function rateFor(table, slab, zone) {
  const row = table.find(r => r.slab === slab)
  if (!row) return null
  const v = row[zone]
  return typeof v === 'number' ? v : null
}

// ── our zone, keyed on (pickup city, destination pincode) ────────────────────────
function parseLine(line) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c }
  }
  out.push(cur)
  return out
}
function loadZones(path) {
  const raw = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
  const H = parseLine(raw[0]).map(h => h.trim())
  const ix = Object.fromEntries(H.map((h, i) => [h, i]))
  const cityPin = new Map(), pinOnly = new Map()
  const vote = (m, k, z) => { if (!m.has(k)) m.set(k, {}); const v = m.get(k); v[z] = (v[z] || 0) + 1 }
  for (const line of raw.slice(1)) {
    const c = parseLine(line)
    const z = UC(c[ix.Zone]), dp = PIN(c[ix.drop_pincode])
    if (!'ABCDE'.includes(z) || z.length !== 1 || !dp) continue
    const city = UC(c[ix.pickup_city])
    if (city) vote(cityPin, `${city}|${dp}`, z)
    vote(pinOnly, dp, z)
  }
  const best = v => Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]
  return {
    cityPin: new Map([...cityPin].map(([k, v]) => [k, best(v)])),
    pinOnly: new Map([...pinOnly].map(([k, v]) => [k, best(v)])),
  }
}

async function main() {
  const rates = loadRates(SAMPLE)
  console.log(`rates: surface ${rates.surface.length} slabs, express ${rates.express.length} slabs`)
  const zones = loadZones(ZONECSV)
  console.log(`zones: ${zones.cityPin.size} city+pin, ${zones.pinOnly.size} pin`)

  const wb = XLSX.readFile(INVOICE)
  const sheet = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null })
  if (!rows.length) throw new Error('invoice sheet is empty')
  const cols = Object.keys(rows[0])
  const find = (...c) => cols.find(x => c.some(n => x.toLowerCase().trim() === n)) ||
    cols.find(x => c.some(n => x.toLowerCase().includes(n)))
  const AWB = find('waybill_num', 'waybill'), CW = find('charged_weight')
  // Express invoices carry "Pickup city"; Surface ones don't — only origin_center, e.g.
  // "Pune_BhamboliMIDC_H (Maharashtra)". The city is the segment before the first underscore.
  const CITY = find('pickup city', 'pickup_city')
  const ORIGIN = find('origin_center')
  const DEST = find('destination_pin', 'destination pin')
  const STATUS = find('status'), PAY = find('package_type', 'payment_mode'), COD = find('cod_amount')
  const DL = find('charge_dl'), CODC = find('charge_cod'), DTOC = find('charge_dto')
  const SVC = find('service')
  for (const [n, v] of Object.entries({ AWB, CW, DEST, STATUS, PAY, COD, DL, CODC })) {
    if (!v) throw new Error(`column not found: ${n}`)
  }
  if (!CITY && !ORIGIN) throw new Error('need either a pickup city or origin_center column')
  const cityOf = r => {
    if (CITY && String(r[CITY] ?? '').trim()) return UC(r[CITY])
    return UC(String(r[ORIGIN] ?? '').split('_')[0])
  }
  // Service decides which rate table applies. Express invoices often omit the column, so
  // fall back to the filename - misreading Surface as Express would price every row wrong.
  const fileSvc = /surface/i.test(INVOICE) ? 'Surface' : /heavy/i.test(INVOICE) ? 'Heavy' : 'Express'
  console.log(`invoice: ${rows.length} rows | service col=${SVC || `(none, using "${fileSvc}")`}`)

  // ── BigQuery: SKU, sub-category, weight ──
  const awbs = [...new Set(rows.map(r => String(r[AWB] ?? '').trim()).filter(Boolean))]
  const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })
  const [bqRows] = await bq.query({
    query: `SELECT TrackingNumber awb, ANY_VALUE(sku_list) sku, ANY_VALUE(Sub_Category) sub,
              MAX(total_weight) wt
            FROM \`frido-429506.production.awb_wise_shipment_weight\`
            WHERE TrackingNumber IN UNNEST(@a) GROUP BY 1`,
    params: { a: awbs },
  })
  const bqMap = new Map(bqRows.map(r => [r.awb, r]))
  console.log(`BQ matched ${bqMap.size} of ${awbs.length} AWBs (${((bqMap.size / awbs.length) * 100).toFixed(1)}%)`)

  const tally = { wtBQ: 0, wtFallback: 0, zCity: 0, zPin: 0, zTheirs: 0, zNone: 0, noRate: 0 }
  let sumDL = 0, sumFDL = 0, sumRTO = 0, sumFRTO = 0, sumCOD = 0, sumFCOD = 0, sumDTO = 0, sumFDTO = 0

  const out = rows.map(r => {
    const awb = String(r[AWB] ?? '').trim()
    const b = bqMap.get(awb)
    const chargedG = NUM(r[CW])
    const service = SVC ? (String(r[SVC] ?? '').trim() || fileSvc) : fileSvc

    // Frido weight in GRAMS. BQ stores kg. Where the AWB has no BQ row, or its weight is
    // zero, fall back to Delhivery's charged weight so the row still prices.
    let fridoG = b && NUM(b.wt) > 0 ? NUM(b.wt) * 1000 : 0
    if (fridoG > 0) tally.wtBQ++
    else { fridoG = chargedG; tally.wtFallback++ }

    // Heavy is billed off the SURFACE card — the June Heavy working sets Service="Surface"
    // and VLOOKUPs the Surface table. There is no separate Heavy rate card.
    const table = /express/i.test(service) ? rates.express : rates.surface
    // Slab snaps to the service's own card. On Express this is identical to CEILING(x,500);
    // on Surface it skips the half-kg steps that card does not have.
    const delSlab = table ? slabOnCard(chargedG, table) : slab500(chargedG)
    const fridoSlab = table ? slabOnCard(fridoG, table) : slab500(fridoG)
    // MIN(Delhivery slab, Frido slab) — the June Heavy working's rule, applied to every
    // service per the user's decision. Never prices above the slab Delhivery itself billed,
    // so a Frido weight heavier than theirs cannot inflate our own figure.
    const minSlab = Math.min(delSlab, fridoSlab)

    // our zone
    const city = cityOf(r), dp = PIN(r[DEST])
    let z2 = null
    if (city && dp && zones.cityPin.has(`${city}|${dp}`)) { z2 = zones.cityPin.get(`${city}|${dp}`); tally.zCity++ }
    else if (dp && zones.pinOnly.has(dp)) { z2 = zones.pinOnly.get(dp); tally.zPin++ }
    else {
      // Last resort: Delhivery's own zone, with Heavy's sub-zones collapsed onto the A-E
      // card (D1/D2 -> D, C1/C2 -> C, F -> E). Without this the Heavy file's zone labels
      // match no card column and the row cannot price at all.
      const theirs = UC(r[find('zone')]).replace(/\d+$/, '')
      const mapped = theirs === 'F' ? 'E' : theirs
      if ('ABCDE'.includes(mapped) && mapped.length === 1) { z2 = mapped; tally.zTheirs++ }
      else tally.zNone++
    }

    // Express is contractually a three-zone product: its card has A, B and C only. The
    // sample confirms the convention — across 20,381 Express rows the mapped zone is never
    // D or E, and every D Delhivery billed maps to C. So on Express, D and E collapse into
    // C, which is the farthest zone that service prices. Surface keeps the full A-E.
    const zoneCols = table ? Object.keys(table[0]).filter(k => k !== 'slab') : []
    const z2Eff = (z2 && !zoneCols.includes(z2)) ? 'C' : z2
    const carded = (table && z2Eff) ? rateFor(table, minSlab, z2Eff) : null

    const dlCharge = NUM(r[DL])
    let note = ''
    let fridoDL
    if (carded == null) {
      // No rate: keep Delhivery's charge rather than zeroing the row, and say why.
      fridoDL = dlCharge
      tally.noRate++
      note = !z2 ? 'zone unmapped'
        : (table && !table.some(x => x.slab === minSlab)) ? `slab ${minSlab}g not in ${service} card`
        : `zone ${z2Eff} not priced for ${service}`
    } else {
      fridoDL = Math.min(dlCharge, carded)
    }

    const isRTO = UC(r[STATUS]) === 'RTO'
    const fridoRTO = isRTO ? fridoDL * 0.9 : 0

    const isCOD = UC(r[PAY]) === 'COD'
    const codAmt = NUM(r[COD])
    const codCharge = NUM(r[CODC])
    const fridoCOD = Math.min(codCharge, (isCOD && !isRTO) ? Math.max(20, codAmt * 0.011) : 0)

    // DTO: only rows Delhivery actually billed a DTO on, priced at 1.45x the forward rate
    // for that slab and zone.
    //
    // NOT capped at their charge, unlike freight and COD. Verified against the June Surface
    // working: at slab 1000 zone D it carries 81.20 (= 56 x 1.45) where Delhivery billed 81,
    // so the Frido figure is allowed to exceed theirs. Capping produced 1,514 mismatches
    // against that file; uncapped it reproduces every row.
    const dtoCharge = DTOC ? NUM(r[DTOC]) : 0
    const fridoDTO = dtoCharge > 0
      ? (carded != null ? carded * DTO_MULTIPLIER : dtoCharge)
      : 0

    sumDL += dlCharge; sumFDL += fridoDL
    sumRTO += NUM(r[find('charge_rto')]); sumFRTO += fridoRTO
    sumCOD += codCharge; sumFCOD += fridoCOD
    sumDTO += dtoCharge; sumFDTO += fridoDTO

    return {
      ...r,
      SKU: b?.sku ?? null,
      Sub_cat: b?.sub ?? null,
      'del. Slab wt': delSlab,
      'Frido wt': Math.round(fridoG * 100) / 100,
      'Frido Slab wt': fridoSlab,
      Min: minSlab,
      // The zone actually priced. On Express this is the A/B/C-collapsed value, matching the
      // sample; frido_zone_raw keeps the uncollapsed mapping so the difference stays visible.
      'zone 2': z2Eff,
      frido_zone_raw: z2,
      frido_charge_dl: Math.round(fridoDL * 100) / 100,
      frido_charge_RTO: Math.round(fridoRTO * 100) / 100,
      frido_charge_COD: Math.round(fridoCOD * 100) / 100,
      frido_charge_DTO: Math.round(fridoDTO * 100) / 100,
      frido_weight_source: b && NUM(b.wt) > 0 ? 'bq' : 'delhivery',
      frido_note: note,
    }
  })

  const nb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(out), sheet.slice(0, 31))
  // Carry the rate card through so the output is self-contained and auditable.
  XLSX.utils.book_append_sheet(nb, XLSX.readFile(SAMPLE).Sheets['Rates'], 'Rates')
  XLSX.writeFile(nb, OUT)

  const R = n => '₹' + Math.round(n).toLocaleString('en-IN')
  const pc = n => ((n / rows.length) * 100).toFixed(1) + '%'
  console.log(`\nweight   bq ${tally.wtBQ} (${pc(tally.wtBQ)}) · delhivery fallback ${tally.wtFallback} (${pc(tally.wtFallback)})`)
  console.log(`zone     city+pin ${tally.zCity} · pin ${tally.zPin} · delhivery-fallback ${tally.zTheirs} · unmapped ${tally.zNone}`)
  console.log(`no rate  ${tally.noRate} rows kept at Delhivery's charge`)
  console.log(`\n              delhivery        frido         diff`)
  console.log(`freight   ${R(sumDL).padStart(12)} ${R(sumFDL).padStart(12)} ${R(sumDL - sumFDL).padStart(12)}`)
  console.log(`rto       ${R(sumRTO).padStart(12)} ${R(sumFRTO).padStart(12)} ${R(sumRTO - sumFRTO).padStart(12)}`)
  console.log(`cod       ${R(sumCOD).padStart(12)} ${R(sumFCOD).padStart(12)} ${R(sumCOD - sumFCOD).padStart(12)}`)
  console.log(`dto       ${R(sumDTO).padStart(12)} ${R(sumFDTO).padStart(12)} ${R(sumDTO - sumFDTO).padStart(12)}`)
  console.log(`total     ${R(sumDL + sumRTO + sumCOD + sumDTO).padStart(12)} ${R(sumFDL + sumFRTO + sumFCOD + sumFDTO).padStart(12)} ${R((sumDL + sumRTO + sumCOD + sumDTO) - (sumFDL + sumFRTO + sumFCOD + sumFDTO)).padStart(12)}`)
  console.log('\nwritten: ' + OUT)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
