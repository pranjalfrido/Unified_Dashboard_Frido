// "⬇ Excel" for tables in a NavAI answer: the tables are read from the answer text itself, turned into an .xlsx in the
// browser (numbers as numbers, bold header row, sheet named after the table's title), and downloaded. No server call and
// nothing stored. The Excel library is loaded only when the button is clicked (see downloadAnswerTables).
import { splitAnswer } from './markdown.js'

const plain = s => String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()

// "₹1.71 Cr" -> the number 1.71 shown as ₹1.71 Cr; "5.1%" -> 0.051 shown as 5.1%; "2,28,008" -> 228008; "▲ 12.4%" -> 0.124
// shown with its arrow ("▼ …" is stored negative, so sums and sorting stay right). Anything else stays text.
const NUM = /^([▲▼])?\s?([-+−])?\s?(₹)?\s?(\d[\d,]*(?:\.\d+)?|\.\d+)\s?(%|Cr|L|K|k|M|x|d|days|pts|pp)?$/
export function cellOf(raw) {
  const t = plain(raw)
  if (t === '') return { v: '', t: 's' }
  const m = NUM.exec(t)
  if (!m) return { v: t, t: 's' }
  const [, arrow, sign, rupee, digits, unit] = m
  let num = parseFloat(digits.replace(/,/g, ''))
  if (!Number.isFinite(num)) return { v: t, t: 's' }
  const dec = (digits.split('.')[1] || '').length
  const grouped = /,/.test(digits)
  let body = (grouped ? '#,##0' : '0') + (dec ? '.' + '0'.repeat(dec) : '')
  if (sign === '-' || sign === '−') num = -num
  if (unit === '%') { num /= 100; body += '%' } else if (unit) body += ` "${unit}"`
  if (rupee) body = `"₹"${body}`
  let z = body
  if (arrow) { z = `"▲ "${body};"▼ "${body}`; if (arrow === '▼') num = -Math.abs(num) }
  return { v: num, t: 'n', z }
}

// Sheet names: at most 31 characters, none of  [ ] : * ? / \, unique, never empty.
export function sheetNames(titles) {
  const used = new Set()
  return titles.map(raw => {
    let base = String(raw || '').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').slice(0, 31).trim() || 'NavAI'
    let name = base, n = 2
    while (used.has(name.toLowerCase())) { const suffix = ` (${n++})`; name = base.slice(0, 31 - suffix.length).trim() + suffix }
    used.add(name.toLowerCase())
    return name
  })
}

// The heading line just above a table, cleaned: "**D2C returns, October:**" -> "D2C returns, October".
const titleFrom = mdText => {
  const lines = String(mdText || '').split('\n').map(l => l.trim()).filter(Boolean)
  const last = lines[lines.length - 1]
  if (!last || /^source\s*:/i.test(plain(last))) return ''
  return plain(last.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s+/, '')).replace(/[:：]\s*$/, '').trim()
}

// Blocks of an answer, tables carrying their title and their position. Used by both the phone and laptop views.
export function answerBlocks(text) {
  const blocks = splitAnswer(text)
  let prev = ''
  let n = 0
  return blocks.map(b => {
    if (b.type === 'table') return { ...b, title: titleFrom(prev), index: n++ }
    if (b.type === 'md') prev = b.text
    return b
  })
}
export const tablesOf = text => answerBlocks(text).filter(b => b.type === 'table')

// Build the workbook with the given library (xlsx-js-style, which supports the bold header). One sheet per table.
export function buildWorkbook(XL, tables) {
  const wb = XL.utils.book_new()
  const names = sheetNames(tables.map(t => t.title))
  tables.forEach((t, i) => {
    const ncol = Math.max(t.headers.length, ...t.rows.map(r => r.length))
    const head = Array.from({ length: ncol }, (_, j) => ({ v: plain(t.headers[j]), t: 's', s: { font: { bold: true } } }))
    const body = t.rows.map(r => Array.from({ length: ncol }, (_, j) => cellOf(r[j])))
    const ws = XL.utils.aoa_to_sheet([head, ...body])
    ws['!cols'] = Array.from({ length: ncol }, (_, j) => ({ wch: Math.min(60, Math.max(8, ...[head[j], ...body.map(r => r[j])].map(c => String(c.v).length + 2))) }))
    XL.utils.book_append_sheet(wb, ws, names[i])
  })
  return wb
}

const slug = s => String(s || '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const fileNameFor = tables => (tables.length === 1 ? `NavAI-${slug(tables[0].title) || 'table'}-${today()}.xlsx` : `NavAI-answer-${today()}.xlsx`)

// Click handler body: loads the Excel library now (not before), builds the file from the tables, downloads it.
export async function downloadAnswerTables(tables) {
  const mod = await import('xlsx-js-style')
  const XL = mod.utils ? mod : mod.default
  XL.writeFile(buildWorkbook(XL, tables), fileNameFor(tables))
}
