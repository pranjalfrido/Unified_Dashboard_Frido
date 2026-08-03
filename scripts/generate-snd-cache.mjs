// One-off/rerunnable conversion: SnD weight-slab rate sheet xlsx → public/snd-rates.json.
// Source columns: weight_slab_gm, forward_logistics_cost, rto_logistics_cost,
// reverse_logistics_cost, fulfilment_cost. Slabs are irregular (500g steps early on, widening
// later) — kept as a sorted array so the app can find the first slab >= order weight (standard
// courier billing: round UP to the next slab), not a flat per-gram rate.
import XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const srcPath = process.argv[2] || 'logistics_and_fulfilment_cost.xlsx'
const wb = XLSX.readFile(srcPath)
const sheetName = wb.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }).slice(1).filter(r => r[0] != null)

const slabs = rows.map(r => ({
  weightGm: parseFloat(r[0]),
  forward: parseFloat(r[1]) || 0,
  rto: parseFloat(r[2]) || 0,
  reverse: parseFloat(r[3]) || 0,
  fulfilment: parseFloat(r[4]) || 0,
})).sort((a, b) => a.weightGm - b.weightGm)

writeFileSync('public/snd-rates.json', JSON.stringify(slabs))
console.log(`Wrote public/snd-rates.json — ${slabs.length} weight slabs, ${slabs[0].weightGm}g to ${slabs[slabs.length - 1].weightGm}g`)
