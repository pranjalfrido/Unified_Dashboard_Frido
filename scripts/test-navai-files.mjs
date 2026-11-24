// NavAI file upload: server-side checks (api/pulse.js + api/_pulseFiles.js) and the browser-side conversions that can run
// in Node (Excel/CSV row cap, Word). Image resizing and the UI are covered by scripts/navai-files-voice-browser-check.mjs.
//   node scripts/test-navai-files.mjs      (throwaway keys/secrets in memory; prints none; file contents never printed)
import { randomBytes } from 'crypto'

process.env.SUPABASE_PROJECT_URL = 'https://example.invalid'
process.env.SUPABASE_SECRET_KEY = randomBytes(16).toString('hex')
process.env.CONNECTOR_URL = 'https://connector.invalid'
process.env.CONNECTOR_API_KEY = randomBytes(16).toString('hex')

let failed = 0
const check = (name, got, want = true) => { const ok = got === want; if (!ok) failed++; process.stdout.write(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ' -> ' + got}
`) }

// ── everything the handler prints or fetches is recorded, to prove file contents are never logged or stored ──
const NEEDLE = 'ZX-SECRET-FILE-CONTENT-' + randomBytes(6).toString('hex')
const out = []
for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => out.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
const say = (...a) => process.stdout.write(a.join(' ') + '\n')
const requests = []
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
let profile = { is_active: true, is_admin: false }, tabs = [{ tab: 'ask' }]
let forwarded = null
globalThis.fetch = async (url, o = {}) => {
  const u = String(url); requests.push({ url: u, method: o.method || 'GET' })
  if (u.includes('/auth/v1/user')) return reply({ id: 'user-1', email: 'someone@example.test', aud: 'authenticated' })
  if (u.includes('/rest/v1/user_profiles')) return reply(profile)
  if (u.includes('/rest/v1/user_permissions')) return reply(tabs)
  if (u.startsWith('https://connector.invalid/chat')) { forwarded = JSON.parse(o.body); return reply({ text: 'ok' }) }
  return reply({}, 404)
}
const pulse = (await import(new URL('../api/pulse.js', import.meta.url))).default
const run = async body => {
  const r = { code: 200, body: null, setHeader() {}, status(c) { r.code = c; return r }, json(b) { r.body = b; return r }, end() { return r } }
  forwarded = null
  await pulse({ method: 'POST', headers: {}, body: { callerToken: 'x', ...body } }, r)
  return r
}

// tiny valid files
const b64 = b => Buffer.from(b).toString('base64')
const PNG = b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]))
const JPG = b64(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]))
const PDF = b64('%PDF-1.4\n' + 'x'.repeat(40))
const att = { png: { type: 'image', name: 'screenshot.png', media_type: 'image/png', data: PNG }, jpg: { type: 'image', name: 'photo.jpg', media_type: 'image/jpeg', data: JPG }, pdf: { type: 'pdf', name: 'invoice.pdf', media_type: 'application/pdf', data: PDF }, txt: { type: 'text', name: 'sheet.xlsx', media_type: 'text/plain', data: `## Sheet: One\na,b\n1,${NEEDLE}\n` } }
const ask = (attachments, extra = {}) => run({ messages: [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'an answer' }, { role: 'user', content: 'analyse this', ...(attachments ? { attachments } : {}) }], ...extra })

// ── 1. permission: without ask:files the API refuses attachments (403); without attachments nothing changes ──
tabs = [{ tab: 'ask' }]; profile = { is_active: true, is_admin: false }
let r = await ask()
check('member without ask:files, no attachments: allowed', r.code === 200)
r = await ask([att.png])
check('member without ask:files + attachment: 403', r.code === 403)
check('...and the refusal says why, politely', /isn't enabled for your account; ask an admin/.test(r.body?.error || ''))
check('...and nothing was sent to the connector', forwarded === null)
r = await ask([att.png], { access: { isAdmin: true, tabs: ['ask:files'] } })
check('forged access in the request body does not grant files', r.code === 403)
tabs = [{ tab: 'ask' }, { tab: 'ask:files' }]
r = await ask([att.png, att.pdf, att.txt])
check('member with ask:files: image + PDF + text file accepted', r.code === 200 && forwarded?.messages?.at(-1)?.attachments?.length === 3)
profile = { is_active: true, is_admin: true }; tabs = [{ tab: 'ask' }]  // an admin still needs NavAI itself ('ask')
r = await ask([att.jpg])
check('admin: allowed without a grant', r.code === 200)

// ── 2. validation (admin so permission is not the reason) ──
r = await ask([att.png, att.jpg, att.pdf, att.txt])
check('4 files: refused (400)', r.code === 400 && /up to 3 files/.test(r.body?.error))
r = await ask([{ type: 'file', name: 'macro.docm', media_type: 'application/vnd.ms-word', data: 'AAAA' }])
check('unsupported type: refused', r.code === 400 && /File type not supported/.test(r.body?.error))
r = await ask([{ type: 'image', name: 'logo.svg', media_type: 'image/svg+xml', data: PNG }])
check('SVG image: refused', r.code === 400)
r = await ask([{ type: 'image', name: 'fake.png', media_type: 'image/png', data: b64('<html>not an image</html>') }])
check('a file that is not what it says (bad magic bytes): refused', r.code === 400 && /not a valid image/.test(r.body?.error))
r = await ask([{ type: 'pdf', name: 'fake.pdf', media_type: 'application/pdf', data: b64('hello') }])
check('fake PDF: refused', r.code === 400)
r = await ask([{ type: 'text', name: 'big.csv', media_type: 'text/plain', data: 'a,b\n' + '1,2\n'.repeat(1_200_000) }])
check('too big (over ~4 MB converted): refused 413', r.code === 413)
r = await run({ messages: [{ role: 'user', content: 'q', attachments: [att.png] }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'next' }] })
check('files on an earlier message (not the one being sent): refused', r.code === 400)
r = await ask('not-an-array')
check('malformed attachments: refused', r.code === 400)
r = await ask([{ type: 'text', name: 'x.csv', media_type: 'text/plain', data: '' }])
check('empty attachment: refused', r.code === 400)
r = await ask([{ type: 'text', name: '../../etc/pa"<ss>wd\n.csv', media_type: 'text/plain', data: 'a' }])
check('odd file name is cleaned, not rejected', r.code === 200 && !/[<>"\n]/.test(forwarded.messages.at(-1).attachments[0].name))

// ── 3. nothing logged, nothing stored ──
await ask([att.txt])
check('no file content in anything the handler printed', out.every(l => !l.includes(NEEDLE)))
check('no write request of any kind to the database or storage', requests.every(q => !/\/storage\//.test(q.url) && (q.method === 'GET' || q.url.startsWith('https://connector.invalid'))))
check('the connector call is the only POST', requests.filter(q => q.method === 'POST').every(q => q.url.startsWith('https://connector.invalid/chat')))

// ── 4. browser-side conversion (Node can run these two) ──
globalThis.fetch = async () => reply({}, 404)
const { convertFile, precheck, sheetsToText, LIMITS } = await import(new URL('../src/ask/attachments.js', import.meta.url))
const XLSX = await import('xlsx')
const rows = n => [['id', 'name', 'qty'], ...Array.from({ length: n }, (_, i) => [i + 1, 'item ' + (i + 1), (i * 7) % 90])]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows(5600)), 'Orders')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows(800)), 'Returns')
const xlsxFile = new File([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })], 'two-sheets.xlsx')
let c = await convertFile(xlsxFile)
const dataLines = c.data.split('\n').filter(l => /^\d+,item /.test(l)).length
check('Excel (2 sheets, 6,400 rows): sent as text with sheet names', c.type === 'text' && c.data.includes('## Sheet: Orders') && c.data.includes('## Sheet: Returns'))
check('Excel: capped at 5,000 data rows', dataLines === LIMITS.maxRows)
check('Excel: says "first 5,000 of 6,400 rows"', /first 5,000 of 6,400 rows/.test(c.data) && /first 5,000 of 6,400 rows/.test(c.note))
check('Excel: header row kept for the sheet that was cut', /## Sheet: Returns\nid,name,qty/.test(c.data))
const small = new File(['a,b\n1,"x, y"\n2,z\n'], 'tiny.csv')
c = await convertFile(small)
check('CSV: converted, quoting kept, no truncation note', c.type === 'text' && c.data.includes('1,"x, y"') && !/Note:/.test(c.data))
const st = sheetsToText([{ name: 'S', rows: rows(10) }], 5)
check('sheetsToText cap helper: 5 of 10', st.truncated && st.total === 10 && st.text.split('\n').filter(l => /^\d+,item/.test(l)).length === 5)
const JSZip = (await import('jszip')).default
const zip = new JSZip()
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Courier agreement</w:t></w:r></w:p><w:p><w:r><w:t>Rate per kg is 42 rupees.</w:t></w:r></w:p></w:body></w:document>')
const docx = new File([await zip.generateAsync({ type: 'nodebuffer' })], 'agreement.docx')
c = await convertFile(docx)
check('Word (.docx): converted to plain text', c.type === 'text' && /Courier agreement/.test(c.data) && /Rate per kg is 42 rupees/.test(c.data))
check('unsupported type (.txt) is refused before reading', /File type not supported/.test(precheck(new File(['x'], 'notes.txt'), 0)))
check('unsupported type (.exe) is refused', /File type not supported/.test(precheck(new File(['x'], 'run.exe'), 0)))
check('4th file is refused', /up to 3 files/.test(precheck(new File(['x'], 'a.csv'), 3)))
check('a file over 10 MB is refused', /10 MB/.test(precheck(new File([new Uint8Array(11 * 1024 * 1024)], 'huge.csv'), 0)))
check('a PDF over 4 MB asks to split it', /split/.test(precheck(new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf'), 0)))
check('supported types pass precheck', ['a.png', 'a.jpg', 'a.webp', 'a.heic', 'a.pdf', 'a.xlsx', 'a.xls', 'a.csv', 'a.docx'].every(n => precheck(new File(['x'], n), 0) === ''))

say(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
