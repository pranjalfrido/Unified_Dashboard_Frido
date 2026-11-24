// Server-side checks for files attached to a NavAI question (api/pulse.js). The browser already converted and limited
// the files; everything is re-checked here and nothing the browser says is trusted. Files are never stored or logged:
// this module only validates and returns the clean message list that goes to the connector.

export const FILE_LIMITS = {
  maxFiles: 3,                 // per message
  maxTotalChars: 4_000_000,    // Vercel's request limit is 4.5 MB; the converted files together must stay under this
  maxNameLen: 120,
}
export const FILES_TAB = 'ask:files'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

const err = (status, error) => ({ ok: false, status, error })

// The magic bytes decide what a file really is, whatever its name or declared type says.
function bytesStart(b64, n = 12) {
  try { return Buffer.from(b64.slice(0, 24), 'base64').subarray(0, n) } catch { return Buffer.alloc(0) }
}
function looksLike(media, b64) {
  const b = bytesStart(b64)
  if (media === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8
  if (media === 'image/png') return b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG'
  if (media === 'image/webp') return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
  if (media === 'image/gif') return b.subarray(0, 3).toString() === 'GIF'
  if (media === 'application/pdf') return b.subarray(0, 5).toString() === '%PDF-'
  return false
}

export const cleanName = n => String(n || 'file').replace(/[\u0000-\u001f\u007f<>"]/g, '').trim().slice(0, FILE_LIMITS.maxNameLen) || 'file'

// access: { isAdmin, tabs } as read from the database by pulse.js. Returns { ok, messages } or { ok:false, status, error }.
export function validateMessages(messages, access) {
  if (!Array.isArray(messages) || !messages.length) return err(400, 'messages array required')
  const canFiles = access?.isAdmin === true || (access?.tabs || []).includes(FILES_TAB)
  const last = messages.length - 1
  const clean = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (!m || typeof m !== 'object') return err(400, 'Invalid message.')
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const out = { role, content: m.content }
    const atts = m.attachments
    if (atts !== undefined && !(Array.isArray(atts) && atts.length === 0)) {
      if (!Array.isArray(atts)) return err(400, 'Invalid attachments.')
      if (!canFiles) return err(403, "File upload isn't enabled for your account; ask an admin.")
      if (i !== last || role !== 'user') return err(400, 'Files can only be attached to the question being sent.')
      if (atts.length > FILE_LIMITS.maxFiles) return err(400, `You can attach up to ${FILE_LIMITS.maxFiles} files per message.`)
      let total = 0
      const list = []
      for (const a of atts) {
        if (!a || typeof a !== 'object' || typeof a.data !== 'string' || !a.data.length) return err(400, 'Invalid attachment.')
        const name = cleanName(a.name)
        total += a.data.length
        if (a.type === 'image') {
          if (!IMAGE_TYPES.has(a.media_type)) return err(400, `File type not supported: ${name}`)
          if (!B64.test(a.data) || !looksLike(a.media_type, a.data)) return err(400, `${name} is not a valid image.`)
        } else if (a.type === 'pdf') {
          if (a.media_type !== 'application/pdf') return err(400, `File type not supported: ${name}`)
          if (!B64.test(a.data) || !looksLike('application/pdf', a.data)) return err(400, `${name} is not a valid PDF.`)
        } else if (a.type === 'text') {
          if (a.media_type !== 'text/plain') return err(400, `File type not supported: ${name}`)
        } else {
          return err(400, `File type not supported: ${name}`)
        }
        list.push({ type: a.type, name, media_type: a.media_type, data: a.data })
      }
      if (total > FILE_LIMITS.maxTotalChars) return err(413, 'The files are too big to send together (limit about 4 MB after conversion). Try a smaller file or fewer rows.')
      out.attachments = list
    }
    clean.push(out)
  }
  return { ok: true, messages: clean, hasFiles: clean.some(m => m.attachments?.length) }
}
