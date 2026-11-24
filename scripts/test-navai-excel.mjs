// NavAI "Excel" button: reading tables from an answer and building the .xlsx (no browser needed for this part;
// the click itself, downloads and no-server-call are in scripts/navai-files-voice-browser-check.mjs).
//   node scripts/test-navai-excel.mjs
import { tablesOf, answerBlocks, cellOf, sheetNames, buildWorkbook, fileNameFor } from '../src/ask/answerTables.js'
import * as XLS from 'xlsx-js-style'
import * as XLSXplain from 'xlsx'
import JSZip from 'jszip'

let failed = 0
const check = (name, got, want = true) => { const ok = got === want; if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ' -> ' + JSON.stringify(got)}`) }
const XL = XLS.utils ? XLS : XLS.default

const ANSWER = `Here is October for D2C.

**D2C returns, October:**
| Metric | Value | vs Sep |
|---|---|---|
| Orders | 2,28,008 | ▲ 4.2% |
| Gross revenue | ₹33.90 Cr | ▼ 1.3% |
| Cancellation % | 5.1% | ▲ 0.2% |
| Total | — | |

### RTO by courier
| Courier | RTO shipments | RTO % |
|---|---|---|
| Bluedart | 12,608 | 8.7% |
| Delhivery | 3,001 | 9.4% |

Source: Return Analysis`

const t = tablesOf(ANSWER)
check('two tables found in the answer', t.length === 2)
check('title comes from the line above the table (markdown stripped, colon dropped)', t[0].title === 'D2C returns, October')
check('title from a ### heading', t[1].title === 'RTO by courier')
check('table with no heading line gets no title (sheet will be "NavAI")', tablesOf('| a | b |\n|---|---|\n| 1 | 2 |')[0].title === '')
check('a "Source:" line is not taken as a title', tablesOf('Source: x\n| a | b |\n|---|---|\n| 1 | 2 |')[0].title === '')
check('the blank cell in the Total row is kept under its header', t[0].rows[3].length === 3 && t[0].rows[3][2] === '')
check('answerBlocks keeps the original markdown of each table (laptop view renders from it)', answerBlocks(ANSWER).filter(b => b.type === 'table').every(b => /^\|/.test(b.raw) && b.raw.includes('---')))
check('a Source line keeps its original text', answerBlocks(ANSWER).find(b => b.type === 'src').raw === 'Source: Return Analysis')

// numbers as numbers
const n = s => cellOf(s)
check('"2,28,008" -> number 228008', n('2,28,008').v === 228008 && n('2,28,008').t === 'n')
check('"₹33.90 Cr" -> number 33.9 shown as ₹33.90 Cr', n('₹33.90 Cr').v === 33.9 && n('₹33.90 Cr').z === '"₹"0.00 "Cr"')
check('"5.1%" -> 0.051 shown as 5.1%', Math.abs(n('5.1%').v - 0.051) < 1e-12 && n('5.1%').z === '0.0%')
check('"▲ 4.2%" -> +0.042 with an up arrow', Math.abs(n('▲ 4.2%').v - 0.042) < 1e-12 && /^"▲ "0\.0%;"▼ "0\.0%$/.test(n('▲ 4.2%').z))
check('"▼ 1.3%" -> -0.013 (so sums and sorting are right)', Math.abs(n('▼ 1.3%').v + 0.013) < 1e-12)
check('"₹731" -> number 731 shown as ₹731', n('₹731').v === 731 && n('₹731').z === '"₹"0')
check('"-12" and "−12" -> -12', n('-12').v === -12 && n('−12').v === -12)
check('"3.1x" -> 3.1', n('3.1x').v === 3.1)
check('bold markers are ignored: "**1,234**"', n('**1,234**').v === 1234)
check('text stays text: "Bluedart", "—", "₹1.71 Cr (raw 17145019)", "12 Oct"', ['Bluedart', '—', '₹1.71 Cr (raw 17145019)', '12 Oct'].every(s => n(s).t === 's'))
check('empty cell stays empty text', n('').t === 's' && n('').v === '')
check('the second line of a cell (<br>) is joined into the text', n('Bluedart<br>(forward)').v === 'Bluedart (forward)')

// sheet names
const names = sheetNames(['D2C returns, October', 'D2C returns, October', '', 'A/B: C*D?[x]', 'x'.repeat(50), 'x'.repeat(50)])
check('sheet names: duplicate gets " (2)"', names[0] === 'D2C returns, October' && names[1] === 'D2C returns, October (2)')
check('sheet names: empty title -> "NavAI"', names[2] === 'NavAI')
check('sheet names: forbidden characters removed', !/[[\]:*?/\\]/.test(names[3]))
check('sheet names: at most 31 characters, even with a duplicate suffix', names.every(x => x.length <= 31) && new Set(names.map(x => x.toLowerCase())).size === names.length)

// the workbook
const wb = buildWorkbook(XL, t)
check('one sheet per table, named after the titles', JSON.stringify(wb.SheetNames) === JSON.stringify(['D2C returns, October', 'RTO by courier']))
const buf = XL.write(wb, { type: 'buffer', bookType: 'xlsx' })
const back = XLSXplain.read(buf, { cellStyles: true })
const ws = back.Sheets['D2C returns, October']
check('header cells are text', ws.A1.v === 'Metric' && ws.B1.t === 's')
check('"2,28,008" is a numeric cell with the value 228008', ws.B2.t === 'n' && ws.B2.v === 228008)
check('"₹33.90 Cr" is numeric 33.9 and displays as ₹33.90 Cr', ws.B3.t === 'n' && ws.B3.v === 33.9 && /₹33\.90 Cr/.test(XLSXplain.utils.format_cell(ws.B3)))
check('"5.1%" is numeric and displays as 5.1%', ws.B4.t === 'n' && Math.abs(ws.B4.v - 0.051) < 1e-9 && XLSXplain.utils.format_cell(ws.B4) === '5.1%')
check('"▼ 1.3%" is numeric -0.013 and displays with its arrow', ws.C3.t === 'n' && ws.C3.v < 0 && /▼ 1\.3%/.test(XLSXplain.utils.format_cell(ws.C3)))
check('"—" and the blank stay text', ws.B5.t === 's' && (ws.C5 === undefined || ws.C5.v === ''))
const rto = back.Sheets['RTO by courier']
check('second sheet: counts and percentages are numeric', rto.B2.t === 'n' && rto.B2.v === 12608 && rto.C3.t === 'n' && Math.abs(rto.C3.v - 0.094) < 1e-9)
const zip = await JSZip.loadAsync(buf)
const styles = await zip.file('xl/styles.xml').async('string')
const sheet1 = await zip.file('xl/worksheets/sheet1.xml').async('string')
const firstRow = sheet1.match(/<row r="1"[^>]*>(.*?)<\/row>/s)[1]
const secondRow = sheet1.match(/<row r="2"[^>]*>(.*?)<\/row>/s)[1]
const fonts = [...styles.match(/<fonts[^>]*>(.*?)<\/fonts>/s)[1].matchAll(/<font>(.*?)<\/font>|<font\/>/gs)].map(m => /<b\/>/.test(m[0]))
const xfs = [...styles.match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/s)[1].matchAll(/<xf [^>]*fontId="(\d+)"/g)].map(m => fonts[+m[1]])
const styleOf = (rowXml, ref) => +rowXml.match(new RegExp('<c r="' + ref + '"[^>]*s="(\\d+)"'))[1]
check('every header cell is bold (its format uses a bold font)', ['A1', 'B1', 'C1'].every(r => xfs[styleOf(firstRow, r)] === true))
check('body cells are not bold', ['A2', 'B2', 'C2'].every(r => xfs[styleOf(secondRow, r)] === false))
check('a table with no title builds a sheet named "NavAI"', buildWorkbook(XL, tablesOf('| a | b |\n|---|---|\n| 1 | 2 |')).SheetNames[0] === 'NavAI')
check('"Download all" = one sheet per table (3 tables -> 3 sheets, names unique)', buildWorkbook(XL, [...t, ...t]).SheetNames.length === 4 && new Set(buildWorkbook(XL, [...t, ...t]).SheetNames).size === 4)
check('file name: one table uses its title, several use "answer"', /^NavAI-D2C-returns-October-\d{4}-\d{2}-\d{2}\.xlsx$/.test(fileNameFor([t[0]])) && /^NavAI-answer-\d{4}-\d{2}-\d{2}\.xlsx$/.test(fileNameFor(t)))

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
