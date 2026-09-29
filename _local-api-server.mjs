import { createServer } from 'http'
import { readdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { join } from 'path'

const apiDir = join(process.cwd(), 'api')
const routeFiles = readdirSync(apiDir).filter(f => f.endsWith('.js') && !f.startsWith('_'))
const handlers = {}
for (const f of routeFiles) {
  const name = f.replace(/\.js$/, '')
  const mod = await import(pathToFileURL(join(apiDir, f)).href)
  handlers[name] = mod.default
}
console.log('Loaded API routes:', Object.keys(handlers).map(k => `/api/${k}`).join(', '))

function makeRes(res) {
  let statusCode = 200
  const wrapper = {
    setHeader: (k, v) => res.setHeader(k, v),
    status: (code) => { statusCode = code; return wrapper },
    json: (body) => { res.writeHead(statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) },
    end: () => { res.writeHead(statusCode); res.end() },
  }
  return wrapper
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const match = url.pathname.match(/^\/api\/([^/]+)/)
  if (!match || !handlers[match[1]]) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'not found' }))
  }
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', async () => {
    let parsed = {}
    try { parsed = body ? JSON.parse(body) : {} } catch { parsed = {} }
    const fakeReq = { method: req.method, body: parsed, query: Object.fromEntries(url.searchParams) }
    try {
      await handlers[match[1]](fakeReq, makeRes(res))
    } catch (e) {
      console.error(`[${match[1]}] handler error:`, e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
  })
})

server.listen(3000, () => console.log('Local API server listening on http://localhost:3000'))
