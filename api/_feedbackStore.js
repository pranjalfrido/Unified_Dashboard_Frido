/* global process */
// Storage + auth for api/feedback.js. Two interchangeable back ends with the same methods and the same
// behaviour: Supabase (real) and a local JSON file + folder (FEEDBACK_LOCAL=1, for localhost testing only).
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'

// Local mode is impossible on Vercel: VERCEL is always set there, so a stray FEEDBACK_LOCAL=1 changes nothing (the handler also refuses to run, see api/feedback.js).
export const LOCAL = process.env.FEEDBACK_LOCAL === '1' && !process.env.VERCEL
export const LOCAL_FLAG_ON_VERCEL = process.env.FEEDBACK_LOCAL === '1' && !!process.env.VERCEL
const BUCKET = 'feedback-screenshots'

// ── Local stand-in ─────────────────────────────────────────────────────────────
// Test people only: nobody here exists in production. Tokens look like "local:<key>".
export const LOCAL_USERS = {
  admin: { id: '00000000-0000-4000-8000-0000000000a1', email: 'admin@local.test', name: 'Test Admin', is_admin: true },
  asha: { id: '00000000-0000-4000-8000-0000000000b1', email: 'asha@local.test', name: 'Asha Verma', is_admin: false },
  rohan: { id: '00000000-0000-4000-8000-0000000000b2', email: 'rohan@local.test', name: 'Rohan Mehta', is_admin: false },
}
const localDir = () => process.env.FEEDBACK_LOCAL_DIR || join(process.cwd(), '.feedback-local')
const dbFile = () => join(localDir(), 'feedback.json')
const readLocal = () => { try { return JSON.parse(readFileSync(dbFile(), 'utf8')) } catch { return { items: [] } } }
const writeLocal = db => { mkdirSync(localDir(), { recursive: true }); writeFileSync(dbFile(), JSON.stringify(db, null, 1)) }

function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Who is calling. Always derived from the verified session, never from the request body.
// → { user } or { status, error }
export async function authenticate(token) {
  if (!token) return { status: 401, error: 'Not logged in.' }
  if (LOCAL) {
    const u = LOCAL_USERS[String(token).replace(/^local:/, '')]
    if (!u) return { status: 401, error: 'Session expired. Please log in again.' }
    return { user: { id: u.id, email: u.email, name: u.name, isAdmin: u.is_admin } }
  }
  let admin
  try { admin = getAdminClient() } catch { return { status: 503, error: 'Auth service unavailable.' } }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { status: 401, error: 'Session expired. Please log in again.' }
  const { data: p, error: pe } = await admin.from('user_profiles').select('name,email,is_admin,is_active').eq('user_id', data.user.id).single()
  if (pe || !p?.is_active) return { status: 403, error: 'Your account has been deactivated. Contact your admin.' }
  return { user: { id: data.user.id, email: p.email || data.user.email, name: p.name || '', isAdmin: p.is_admin === true } }
}

const COLS = 'id,user_id,type,message,context,screenshot_path,urgent,status,admin_reply,show_in_whats_new,user_seen_at,alert_sent_at,created_at,updated_at,resolved_at'

// Sets resolved_at the same way the SQL trigger does.
function applyPatch(row, patch) {
  const now = new Date().toISOString()
  const next = { ...row, ...patch, updated_at: now }
  if (patch.status && patch.status !== row.status) next.resolved_at = ['done', 'wont_do'].includes(patch.status) ? now : null
  return next
}

function localStore() {
  return {
    mode: 'local',
    async countSince(userId, ms) { const t = Date.now() - ms; return readLocal().items.filter(i => i.user_id === userId && Date.parse(i.created_at) >= t).length },
    async saveShot(userId, id, ext, buf) {
      const dir = join(localDir(), 'shots'); mkdirSync(dir, { recursive: true })
      const name = `${userId}__${id}.${ext}`; writeFileSync(join(dir, name), buf); return name
    },
    async removeShot() {},
    async shotUrl(path) {
      const f = join(localDir(), 'shots', path)
      if (!existsSync(f)) return null
      const ext = path.split('.').pop()
      return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(f).toString('base64')}`
    },
    async insert(row) {
      const db = readLocal(); const now = new Date().toISOString()
      const r = { ...row, created_at: now, updated_at: now, resolved_at: null, user_seen_at: null, alert_sent_at: null }
      db.items.push(r); writeLocal(db); return r
    },
    async get(id) { return readLocal().items.find(i => i.id === id) || null },
    async update(id, patch) {
      const db = readLocal(); const i = db.items.findIndex(x => x.id === id)
      if (i < 0) return null
      db.items[i] = applyPatch(db.items[i], patch); writeLocal(db); return db.items[i]
    },
    async listForUser(userId) { return readLocal().items.filter(i => i.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100) },
    async listAll({ status, type, page, user } = {}) {
      return readLocal().items
        .filter(i => (!status || i.status === status) && (!type || i.type === type) && (!page || i.context?.page === page) && (!user || i.user_id === user))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300)
    },
    async pages() { return [...new Set(readLocal().items.map(i => i.context?.page).filter(Boolean))].sort() },
    async countNew() { return readLocal().items.filter(i => i.status === 'new').length },
    async countUnseen(userId) { return readLocal().items.filter(i => i.user_id === userId && ['done', 'wont_do'].includes(i.status) && i.admin_reply && !i.user_seen_at).length },
    async ack(userId, ids) {
      const db = readLocal(); const now = new Date().toISOString()
      db.items.forEach(i => { if (i.user_id === userId && ids.includes(i.id)) i.user_seen_at = now })
      writeLocal(db)
    },
    async pendingAlert() { return readLocal().items.filter(i => !i.alert_sent_at).sort((a, b) => a.created_at.localeCompare(b.created_at)) },
    async markAlerted(ids) {
      const db = readLocal(); const now = new Date().toISOString()
      db.items.forEach(i => { if (ids.includes(i.id)) i.alert_sent_at = now })
      writeLocal(db)
    },
    async people(ids) {
      const m = {}
      Object.values(LOCAL_USERS).forEach(u => { if (ids.includes(u.id)) m[u.id] = { name: u.name, email: u.email } })
      return m
    },
    async mail(subject, html, to) {
      mkdirSync(localDir(), { recursive: true })
      appendFileSync(join(localDir(), 'emails.log'), `--- ${new Date().toISOString()}\nTO: ${to.join(', ')}\nSUBJECT: ${subject}\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}\n\n`)
      console.log(`[feedback] (local) e-mail logged instead of sent: ${subject}`)
    },
  }
}

function supabaseStore() {
  const db = () => getAdminClient()
  const fail = error => { throw Object.assign(new Error(error.message || '(empty message)'), { code: error.code, hint: error.hint, details: error.details, httpStatus: error.status }) }
  const must = ({ data, error }) => { if (error) fail(error); return data }
  const count = ({ count: n, error }) => { if (error) fail(error); return n || 0 }
  return {
    mode: 'supabase',
    async countSince(userId, ms) {
      return count(await db().from('feedback').select('id', { count: 'exact' }).eq('user_id', userId).gte('created_at', new Date(Date.now() - ms).toISOString()).limit(1))
    },
    async saveShot(userId, id, ext, buf) {
      const path = `${userId}/${id}.${ext}`
      const { error } = await db().storage.from(BUCKET).upload(path, buf, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false })
      if (error) fail(error)
      return path
    },
    async removeShot(path) { try { await db().storage.from(BUCKET).remove([path]) } catch { /* best effort */ } },
    async shotUrl(path) { const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 600); return error ? null : data.signedUrl },
    async insert(row) { return must(await db().from('feedback').insert(row).select(COLS).single()) },
    async get(id) { return must(await db().from('feedback').select(COLS).eq('id', id).maybeSingle()) },
    async update(id, patch) { return must(await db().from('feedback').update(patch).eq('id', id).select(COLS).maybeSingle()) },
    async listForUser(userId) { return must(await db().from('feedback').select(COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(100)) },
    async listAll({ status, type, page, user } = {}) {
      let q = db().from('feedback').select(COLS).order('created_at', { ascending: false }).limit(300)
      if (status) q = q.eq('status', status)
      if (type) q = q.eq('type', type)
      if (user) q = q.eq('user_id', user)
      if (page) q = q.eq('context->>page', page)
      return must(await q)
    },
    async pages() {
      const rows = must(await db().from('feedback').select('context').order('created_at', { ascending: false }).limit(1000))
      return [...new Set(rows.map(r => r.context?.page).filter(Boolean))].sort()
    },
    async countNew() { return count(await db().from('feedback').select('id', { count: 'exact' }).eq('status', 'new').limit(1)) },
    async countUnseen(userId) {
      return count(await db().from('feedback').select('id', { count: 'exact' }).eq('user_id', userId).in('status', ['done', 'wont_do']).not('admin_reply', 'is', null).is('user_seen_at', null).limit(1))
    },
    async ack(userId, ids) { must(await db().from('feedback').update({ user_seen_at: new Date().toISOString() }).eq('user_id', userId).in('id', ids)) },
    async pendingAlert() { return must(await db().from('feedback').select(COLS).is('alert_sent_at', null).order('created_at', { ascending: true }).limit(500)) },
    async markAlerted(ids) { if (ids.length) must(await db().from('feedback').update({ alert_sent_at: new Date().toISOString() }).in('id', ids)) },
    async people(ids) {
      if (!ids.length) return {}
      const rows = must(await db().from('user_profiles').select('user_id,name,email').in('user_id', ids))
      return Object.fromEntries(rows.map(r => [r.user_id, { name: r.name, email: r.email }]))
    },
    async mail(subject, html, to) { await sendGraphMail(subject, html, to) },
  }
}

// Microsoft Graph, like the data connector's alert e-mails and the report e-mails: AZURE_* (or the OTP_FRIDO_* app already in .env.example) and ALERT_SENDER_EMAIL (or REPORT_MAIL_FROM).
let tokenCache = null
async function graphToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30000) return tokenCache.token
  const e = process.env
  const t = e.AZURE_TENANT_ID || e.OTP_FRIDO_TENANT_ID; const c = e.AZURE_CLIENT_ID || e.OTP_FRIDO_CLIENT_ID; const s = e.AZURE_CLIENT_SECRET || e.OTP_FRIDO_CLIENT_SECRET
  if (!t || !c || !s) throw new Error('Missing Azure credentials for mailer')
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    signal: AbortSignal.timeout(8000), method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default' }),
  })
  if (!r.ok) throw new Error(`Token fetch failed: ${await r.text()}`)
  const d = await r.json()
  tokenCache = { token: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 }
  return tokenCache.token
}
async function sendGraphMail(subject, html, to) {
  const sender = process.env.ALERT_SENDER_EMAIL || process.env.REPORT_MAIL_FROM || process.env.ALERT_EMAIL || to[0]
  const token = await graphToken()
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    signal: AbortSignal.timeout(8000), method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: to.map(address => ({ emailAddress: { address } })) }, saveToSentItems: false }),
  })
  if (!r.ok) throw new Error(`sendMail failed: ${await r.text()}`)
}

export const getStore = () => (LOCAL ? localStore() : supabaseStore())
export const newId = () => randomUUID()
export const alertRecipients = () => (process.env.FEEDBACK_ALERT_EMAILS || 'suraj.s@myfrido.com').split(',').map(s => s.trim()).filter(Boolean)
export const cronOk = authHeader => !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
