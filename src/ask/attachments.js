// File upload for NavAI: validate and convert in the browser so the request stays small.
// Images are resized, Excel/CSV become CSV text, Word becomes plain text, PDFs go as they are.
// Nothing here stores or logs a file; the converted data lives in memory for one request.

export const LIMITS = {
  maxFiles: 3,
  maxFileBytes: 10 * 1024 * 1024,      // before conversion
  maxPdfBytes: 4 * 1024 * 1024,        // a bigger PDF must be split
  maxRows: 5000,                       // data rows kept per Excel/CSV file (header + first 5,000)
  imageLongSide: 1600,
  imageQuality: 0.85,
  maxRequestBytes: 4_000_000,          // Vercel's body limit is 4.5 MB; keep clear of it
}
export const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.xlsx,.xls,.csv,.docx'
export const UNSUPPORTED = 'File type not supported'

const EXT = name => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''
export function kindOf(file) {
  const ext = EXT(file.name), mime = file.type || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) || /^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) return 'image'
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet'
  if (ext === 'docx') return 'docx'
  return null
}
export const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)

// Checks that need no file contents. Returns an error message or ''.
export function precheck(file, alreadyHave) {
  if (alreadyHave >= LIMITS.maxFiles) return `You can add up to ${LIMITS.maxFiles} files per message.`
  const kind = kindOf(file)
  if (!kind) return `${UNSUPPORTED}: ${file.name}`
  if (file.size > LIMITS.maxFileBytes) return `${file.name} is ${fmtSize(file.size)}; the limit is 10 MB per file.`
  if (kind === 'pdf' && file.size > LIMITS.maxPdfBytes) return `${file.name} is over 4 MB; please split the PDF into smaller parts.`
  return ''
}

const toBase64 = buf => {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function decodeImage(file) {
  try { return await createImageBitmap(file) } catch { /* fall through to <img> (Safari reads HEIC this way) */ }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`This browser can't read ${file.name}. Use a JPG or PNG, or take a screenshot.`))
      img.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
async function convertImage(file) {
  const bmp = await decodeImage(file)
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight
  const scale = Math.min(1, LIMITS.imageLongSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) // PNG transparency -> white, not black
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  const url = canvas.toDataURL('image/jpeg', LIMITS.imageQuality)
  return { type: 'image', name: file.name, media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) }
}

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
// Sheets -> CSV text, "## Sheet: name" before each. At most maxRows data rows per file in total (each sheet keeps its header).
export function sheetsToText(sheets, maxRows = LIMITS.maxRows) {
  const total = sheets.reduce((a, s) => a + Math.max(0, s.rows.length - 1), 0)
  let budget = maxRows
  const parts = sheets.map(s => {
    const [head, ...data] = s.rows
    const keep = data.slice(0, Math.max(0, budget)); budget -= keep.length
    const lines = [head, ...keep].filter(Boolean).map(r => r.map(csvCell).join(','))
    return `## Sheet: ${s.name}\n${lines.join('\n')}`
  })
  const note = total > maxRows ? `Note: first ${maxRows.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows were sent (limit per file).\n` : ''
  return { text: note + parts.join('\n\n'), total, truncated: total > maxRows }
}
async function convertSheet(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = EXT(file.name) === 'csv'
    ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', raw: true })
    : XLSX.read(buf, { type: 'array' })
  const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: '' }) }))
  const { text, truncated, total } = sheetsToText(sheets)
  return { type: 'text', name: file.name, media_type: 'text/plain', data: text, note: truncated ? `first ${LIMITS.maxRows.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows` : '' }
}
async function convertDocx(file) {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return { type: 'text', name: file.name, media_type: 'text/plain', data: value }
}
async function convertPdf(file) {
  return { type: 'pdf', name: file.name, media_type: 'application/pdf', data: toBase64(await file.arrayBuffer()) }
}

export async function convertFile(file) {
  const kind = kindOf(file)
  if (kind === 'image') return convertImage(file)
  if (kind === 'pdf') return convertPdf(file)
  if (kind === 'sheet') return convertSheet(file)
  if (kind === 'docx') return convertDocx(file)
  throw new Error(`${UNSUPPORTED}: ${file.name}`)
}

// Total size of what will be sent. Returns an error naming the biggest file when it won't fit, else ''.
export function checkRequestSize(converted, otherBytes = 0) {
  const sizes = converted.map(c => ({ name: c.name, n: c.data.length }))
  const total = sizes.reduce((a, s) => a + s.n, otherBytes)
  if (total <= LIMITS.maxRequestBytes) return ''
  const big = sizes.sort((a, b) => b.n - a.n)[0]
  return `${big?.name || 'The files'} is too big to send with this message (all files together must stay under about 4 MB after conversion). Try a smaller file or fewer rows.`
}
