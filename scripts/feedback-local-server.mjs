/* global process */
// Local stand-in API for the Feedback feature (localhost testing only): serves just /api/feedback, with
// storage in ./.feedback-local (gitignored) and e-mails logged instead of sent. Never talks to Supabase.
//   node scripts/feedback-local-server.mjs         (port 3017, or PORT=…)
process.env.FEEDBACK_LOCAL = '1'
const { createServer } = await import('http')
const { default: handler } = await import('../api/feedback.js')

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/api/feedback') { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"not found"}') }
  let raw = ''
  req.on('data', c => { raw += c })
  req.on('end', async () => {
    let body = {}
    try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
    let code = 200
    const out = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: c => { code = c; return out },
      json: b => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)) },
      end: () => { res.writeHead(code); res.end() },
    }
    try { await handler({ method: req.method, body, query: Object.fromEntries(url.searchParams), headers: req.headers }, out) }
    catch (e) { console.error(e); res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
  })
})
const port = Number(process.env.PORT || 3017)
server.listen(port, '127.0.0.1', () => console.log(`Feedback local API (LOCAL mode) on http://localhost:${port}`))
