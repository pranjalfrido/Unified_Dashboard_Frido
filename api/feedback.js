// Feedback: users report bugs, wrong numbers and suggestions; admins manage them in an inbox.
// One endpoint, POST { action, callerToken, ... }. Every write happens here with the service key
// (the browser has no write access to the table); the user is always taken from the verified session,
// never from the request. Storage is Supabase, or a local file when FEEDBACK_LOCAL=1 (see _feedbackStore.js).
import { getStore, authenticate, newId, alertRecipients, cronOk, LOCAL } from './_feedbackStore.js'

const TYPES = ['bug', 'wrong_number', 'suggestion', 'new_feature']
const TYPE_LABEL = { bug: 'Bug', wrong_number: 'Wrong number', suggestion: 'Suggestion', new_feature: 'New feature/page' }
const STATUSES = ['new', 'in_progress', 'done', 'wont_do']
const MAX_MESSAGE = 1000
const MAX_REPLY = 1000
const DAILY_LIMIT = 20
const MAX_SHOT_BYTES = 1500000
const DAY = 24 * 60 * 60 * 1000

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// Text only: control characters out, length capped. HTML is never interpreted anywhere (React renders text; e-mail uses esc()).
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)

// context is whatever the page knew when the form opened. Keep it small and flat-ish: strings capped, depth limited.
function cleanContext(v, depth = 0) {
  if (v == null) return null
  if (typeof v === 'string') return clean(v, 300)
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (depth >= 3) return null
  if (Array.isArray(v)) return v.slice(0, 30).map(x => cleanContext(x, depth + 1)).filter(x => x !== null)
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).slice(0, 40)) { const c = cleanContext(v[k], depth + 1); if (c !== null && c !== '') out[clean(k, 40)] = c }
    return out
  }
  return null
}

function parseShot(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > MAX_SHOT_BYTES) return { tooBig: true }
  const hex = buf.subarray(0, 4).toString('hex')
  const ok = (m[1] === 'jpeg' && hex.startsWith('ffd8ff')) || (m[1] === 'png' && hex === '89504e47') || (m[1] === 'webp' && buf.subarray(0, 4).toString() === 'RIFF')
  if (!ok) return null
  return { ext: m[1] === 'jpeg' ? 'jpg' : m[1], buf }
}

// What the user sees about their own row (never the alert bookkeeping).
const mineView = r => ({ id: r.id, type: r.type, message: r.message, context: r.context, urgent: r.urgent, status: r.status, admin_reply: r.admin_reply, created_at: r.created_at, resolved_at: r.resolved_at, notify: ['done', 'wont_do'].includes(r.status) && !!r.admin_reply && !r.user_seen_at, has_screenshot: !!r.screenshot_path })
const adminView = (r, people) => ({ id: r.id, user_id: r.user_id, user_name: people[r.user_id]?.name || '', user_email: people[r.user_id]?.email || '', type: r.type, message: r.message, context: r.context, urgent: r.urgent, status: r.status, admin_reply: r.admin_reply, show_in_whats_new: r.show_in_whats_new, has_screenshot: !!r.screenshot_path, created_at: r.created_at, updated_at: r.updated_at, resolved_at: r.resolved_at })

async function sendAlert(store, subject, lines) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px"><div style="background:#1f5a3d;color:#fff;padding:12px 20px;border-radius:4px 4px 0 0"><strong>Frido dashboard · Feedback</strong></div><div style="border:1px solid #ddd;border-top:none;padding:20px;border-radius:0 0 4px 4px">${lines.map(l => `<p style="margin:6px 0">${l}</p>`).join('')}</div></div>`
  await store.mail(subject, html, alertRecipients())
}

const ctxLine = c => [c?.page, c?.channel && `channel ${c.channel}`, c?.subChannel && `sub-channel ${c.subChannel}`, c?.dateRange && `dates ${c.dateRange}`].filter(Boolean).join(' · ')

async function notifyAdmins(store, row, who) {
  const label = TYPE_LABEL[row.type]
  const subject = row.urgent ? `[Feedback · URGENT] ${label} from ${who.name || who.email}` : `[Feedback] ${label} from ${who.name || who.email}`
  await sendAlert(store, subject, [
    `<strong>${esc(label)}</strong>${row.urgent ? ' · <span style="color:#b91c1c"><strong>URGENT</strong></span>' : ''} from <strong>${esc(who.name || who.email)}</strong> (${esc(who.email)})`,
    `<div style="white-space:pre-wrap;background:#f6f5f0;padding:10px 12px;border-radius:6px">${esc(row.message)}</div>`,
    `<span style="color:#666">${esc(ctxLine(row.context))}</span>`,
    row.context?.ai ? `<span style="color:#666">NavAI question: ${esc(row.context.ai.question)}</span>` : '',
    row.screenshot_path ? 'A screenshot is attached to the item in the inbox.' : '',
    'Open the dashboard → Feedback to reply.',
  ].filter(Boolean))
  await store.markAlerted([row.id])
}

// Everything not e-mailed straight away (urgent and wrong-number items already were) in one summary.
async function sendDigest(store) {
  const pending = (await store.pendingAlert()).filter(r => r.status === 'new')
  if (!pending.length) return { sent: false, count: 0 }
  const people = await store.people([...new Set(pending.map(r => r.user_id))])
  const lines = [`<strong>${pending.length}</strong> new feedback item${pending.length === 1 ? '' : 's'} since the last summary:`]
  for (const r of pending) {
    const p = people[r.user_id]
    lines.push(`• <strong>${esc(TYPE_LABEL[r.type])}</strong> · ${esc(p?.name || p?.email || 'someone')} · ${esc(r.context?.page || '')}<br>${esc(r.message.slice(0, 200))}${r.message.length > 200 ? '…' : ''}`)
  }
  lines.push('Open the dashboard → Feedback to reply.')
  await sendAlert(store, `[Feedback] Daily summary: ${pending.length} new item${pending.length === 1 ? '' : 's'}`, lines)
  await store.markAlerted(pending.map(r => r.id))
  return { sent: true, count: pending.length }
}

const fail = (res, status, error) => res.status(status).json({ error })

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const store = getStore()

  try {
    // Vercel cron (7 pm IST) calls GET with "Authorization: Bearer <CRON_SECRET>".
    if (req.method === 'GET') {
      if ((req.query || {}).action !== 'digest') return fail(res, 405, 'Method not allowed')
      if (!cronOk(req.headers?.authorization)) return fail(res, 401, 'Not allowed.')
      return res.status(200).json(await sendDigest(store))
    }
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

    const body = req.body || {}
    const token = body.callerToken || String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
    const auth = await authenticate(token)
    if (auth.error) return fail(res, auth.status, auth.error)
    const user = auth.user
    const action = String(body.action || '')
    const denyNonAdmin = () => { if (user.isAdmin) return false; fail(res, 403, 'Admins only.'); return true }

    // ── anyone signed in ──────────────────────────────────────────────
    if (action === 'submit') {
      const type = String(body.type || '')
      if (!TYPES.includes(type)) return fail(res, 400, 'Choose what you are reporting.')
      const message = clean(body.message, MAX_MESSAGE)
      if (!message) return fail(res, 400, 'Please write a short message.')
      if (String(body.message || '').trim().length > MAX_MESSAGE) return fail(res, 400, `Please keep it under ${MAX_MESSAGE} characters.`)
      if (await store.countSince(user.id, DAY) >= DAILY_LIMIT) return fail(res, 429, `You've sent ${DAILY_LIMIT} items today. Please try again tomorrow.`)
      const context = cleanContext(body.context) || {}
      let shot = null
      if (body.screenshot) {
        shot = parseShot(body.screenshot)
        if (!shot) return fail(res, 400, 'That screenshot could not be read. Please try another.')
        if (shot.tooBig) return fail(res, 413, 'The screenshot is too large.')
      }
      const id = newId()
      let path = null
      if (shot) path = await store.saveShot(user.id, id, shot.ext, shot.buf)
      let row
      try {
        row = await store.insert({ id, user_id: user.id, type, message, context, screenshot_path: path, urgent: body.urgent === true, status: 'new', admin_reply: null, show_in_whats_new: false })
      } catch (e) {
        if (path) await store.removeShot(path)
        throw e
      }
      // E-mail now for urgent items and every wrong number; the rest go in the daily summary.
      // A mail failure never fails the submission.
      if (row.urgent || row.type === 'wrong_number') { try { await notifyAdmins(store, row, user) } catch (e) { console.error('[feedback] alert e-mail failed:', e.message) } }
      return res.status(200).json({ ok: true, id: row.id })
    }

    if (action === 'mine') return res.status(200).json({ items: (await store.listForUser(user.id)).map(mineView) })

    // Light poll (every couple of minutes): the badge numbers for this person.
    if (action === 'badge') {
      const [unseen, newCount] = await Promise.all([store.countUnseen(user.id), user.isAdmin ? store.countNew() : Promise.resolve(0)])
      return res.status(200).json({ unseen, newCount, isAdmin: user.isAdmin })
    }

    // The user dismissed their "closed" notifications.
    if (action === 'ack') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 100) : []
      await store.ack(user.id, ids)
      return res.status(200).json({ ok: true })
    }

    // Done items an admin chose to show: only the type, the admin's reply and the date (never who asked or what they wrote).
    if (action === 'whatsnew') {
      const rows = await store.whatsNew()
      return res.status(200).json({ items: rows.map(r => ({ id: r.id, type: r.type, text: r.admin_reply, resolved_at: r.resolved_at })) })
    }

    // ── admins only ───────────────────────────────────────────────────
    if (action === 'list' || action === 'get' || action === 'update' || action === 'digest') {
      if (denyNonAdmin()) return

      if (action === 'list') {
        const f = body.filters || {}
        const pick = (v, ok) => (ok(v) ? v : undefined)
        const rows = await store.listAll({ status: pick(f.status, v => STATUSES.includes(v)), type: pick(f.type, v => TYPES.includes(v)), page: f.page ? clean(f.page, 100) : undefined, user: f.user ? clean(f.user, 60) : undefined })
        const [people, pages, newCount, all] = await Promise.all([store.people([...new Set(rows.map(r => r.user_id))]), store.pages(), store.countNew(), store.listAll({})])
        const allPeople = await store.people([...new Set(all.map(r => r.user_id))])
        const users = Object.entries(allPeople).map(([id, p]) => ({ id, name: p.name || p.email }))
        return res.status(200).json({ items: rows.map(r => adminView(r, people)), pages, users, newCount })
      }

      if (action === 'get') {
        const row = await store.get(String(body.id || ''))
        if (!row) return fail(res, 404, 'Not found.')
        const people = await store.people([row.user_id])
        return res.status(200).json({ item: { ...adminView(row, people), screenshot_url: row.screenshot_path ? await store.shotUrl(row.screenshot_path) : null } })
      }

      if (action === 'update') {
        const row = await store.get(String(body.id || ''))
        if (!row) return fail(res, 404, 'Not found.')
        const status = body.status === undefined ? row.status : String(body.status)
        if (!STATUSES.includes(status)) return fail(res, 400, 'Unknown status.')
        const reply = body.admin_reply === undefined ? (row.admin_reply || '') : clean(body.admin_reply, MAX_REPLY)
        if (['done', 'wont_do'].includes(status) && reply.length < 3) return fail(res, 400, 'Add a short reply before closing this item.')
        const show = status === 'done' && body.show_in_whats_new === true
        const patch = { status, admin_reply: reply || null, show_in_whats_new: show }
        // A newly closed item, or a changed reply on a closed item, notifies the user again.
        if (['done', 'wont_do'].includes(status) && (status !== row.status || reply !== (row.admin_reply || ''))) patch.user_seen_at = null
        const updated = await store.update(row.id, patch)
        const people = await store.people([updated.user_id])
        return res.status(200).json({ item: adminView(updated, people) })
      }

      if (action === 'digest') return res.status(200).json(await sendDigest(store))
    }

    return fail(res, 400, 'Unknown action.')
  } catch (e) {
    console.error('[feedback] error:', e.message)
    return fail(res, 500, LOCAL ? e.message : 'Something went wrong. Please try again.')
  }
}
