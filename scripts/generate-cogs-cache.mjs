// One-off/rerunnable conversion: COGS master xlsx (flat, per-SKU, not yet month-wise —
// see PNL_TAB_ROADMAP.md) → public/cogs-data.json, served from Vercel CDN like inv-data.json.
// Re-run this whenever a new COGS sheet lands (same filename or pass a path as argv[2]).
//
// Source columns: SKU, Category, SubCategory, Type (SIMPLE/BUNDLE), " COGS " (per-unit cost).
import XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const srcPath = process.argv[2] || 'cogs_3rd_july_26.xlsx'
const wb = XLSX.readFile(srcPath)
const sheetName = wb.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }).slice(1).filter(r => r[0])

const bySku = {}
let missing = 0
rows.forEach(r => {
  const sku = String(r[0]).trim()
  const cogs = parseFloat(r[4])
  const hasCogs = !isNaN(cogs) && cogs > 0
  if (!hasCogs) missing++
  bySku[sku] = {
    category: r[1] || '',
    subCategory: r[2] || '',
    type: r[3] || '',
    cogs: hasCogs ? cogs : null,
  }
})

writeFileSync('public/cogs-data.json', JSON.stringify(bySku))
console.log(`Wrote public/cogs-data.json — ${Object.keys(bySku).length} SKUs, ${missing} missing/zero COGS (${(missing / Object.keys(bySku).length * 100).toFixed(1)}%)`)
