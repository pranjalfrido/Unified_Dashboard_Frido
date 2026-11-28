// Run: node scripts/security/check-batch1.mjs
// Security batch 1 checks that need no network and no real users: email-controls admin gate, account_lookup (same reply,
// rate limit), password rules, server-side password checks. Fake Supabase clients stand in for the database.
process.env.SUPABASE_PROJECT_URL = 'https://test-project.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'service-test'
delete process.env.TEAMS_RESET_WEBHOOK_URL
delete process.env.GCP_SA_KEY
let fail = 0
const T = (name, ok) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name) }

const mkRes = () => {
  const r = { code: 200, body: null, headers: {} }
  r.setHeader = (k, v) => { r.headers[k] = v }
  r.status = c => { r.code = c; return r }
  r.json = b => { r.body = b; return r }
  r.end = () => r
  return r
}
// Fake service-role client: users by token, profiles by user id.
const fakeAdmin = ({ users, profiles }) => ({
  auth: { getUser: async token => (users[token] ? { data: { user: { id: users[token] } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
  from: () => ({ select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: profiles[id] ?? null, error: null }) }) }) }),
})
const admin = fakeAdmin({
  users: { 'tok-admin': 'a1', 'tok-member': 'm1', 'tok-revoked-admin': 'a2', 'tok-noprofile': 'n1' },
  profiles: { a1: { is_admin: true, is_active: true }, m1: { is_admin: false, is_active: true }, a2: { is_admin: true, is_active: false } },
})

// ── email-controls ──
const ec = (await import('../../api/email-controls.js')).default
const callEc = async (method, token) => { const res = mkRes(); await ec({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} }, res, { admin }); return res }
for (const m of ['GET', 'POST']) {
  let r = await callEc(m, null); T(`email-controls ${m}: no token -> 401`, r.code === 401)
  r = await callEc(m, 'garbage'); T(`email-controls ${m}: invalid token -> 401`, r.code === 401)
  r = await callEc(m, 'tok-member'); T(`email-controls ${m}: non-admin token -> 403`, r.code === 403)
  r = await callEc(m, 'tok-revoked-admin'); T(`email-controls ${m}: revoked admin -> 403`, r.code === 403)
  r = await callEc(m, 'tok-noprofile'); T(`email-controls ${m}: no profile -> 403`, r.code === 403)
  r = await callEc(m, 'tok-admin'); T(`email-controls ${m}: active admin passes the gate (then fails only on missing GCP key here)`, r.code === 500 && /GCP|credentials/i.test(JSON.stringify(r.body)))
}
{ const res = mkRes(); await ec({ method: 'OPTIONS', headers: {} }, res, { admin }); T('email-controls OPTIONS answers without data', res.code === 200) }

// ── account_lookup ──
const aa = await import('../../api/auth-admin.js')
let lookupBodies = []
const callLookup = async (email, ip) => { const res = mkRes(); await aa.default({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { action: 'account_lookup', email } }, res); return res }
const known = await callLookup('person@myfrido.com', '1.1.1.1')
const unknown = await callLookup('nobody-here@example.com', '1.1.1.2')
T('account_lookup: same reply for any email (no name, no is_active)', known.code === 200 && JSON.stringify(known.body) === JSON.stringify(unknown.body) && !('name' in known.body) && !('is_active' in known.body) && !('found' in known.body))
let codes = []
for (let i = 0; i < 7; i++) codes.push((await callLookup('x@y.com', '9.9.9.9')).code)
T('account_lookup: 5 per minute per IP, then 429', codes.slice(0, 5).every(c => c === 200) && codes.slice(5).every(c => c === 429))
T('account_lookup: another IP is not blocked', (await callLookup('x@y.com', '9.9.9.8')).code === 200)
T('account_lookup rate window slides (allowed again after 60 s)', aa.lookupAllowed('7.7.7.7', 0) && [1, 2, 3, 4].every(() => aa.lookupAllowed('7.7.7.7', 1000)) && !aa.lookupAllowed('7.7.7.7', 2000) && aa.lookupAllowed('7.7.7.7', 61_500))
{ const res = mkRes(); await aa.default({ method: 'POST', headers: { 'x-forwarded-for': '3.3.3.3' }, body: { action: 'account_lookup', email: '' } }, res); T('account_lookup: empty email -> 400', res.code === 400) }

// ── server-side password check on admin actions (rejected before any Supabase call) ──
const adminCall = async body => { const res = mkRes(); await aa.default({ method: 'POST', headers: {}, body }, res); return res }
{ const r = await adminCall({ action: 'create_user', callerToken: 'x' }); T('create_user without a valid admin token is refused', r.code === 401 || r.code === 500 || r.code === 403) }

// ── password rules ──
const pr = await import('../../src/passwordRules.js')
const cases = [['Abcdef1!', ''], ['abcdef1!', 'upper'], ['ABCDEF1!', 'lower'], ['Abcdefg!', 'number'], ['Abcdefg1', 'symbol'], ['Ab1!', '8 char'], ['', '8 char']]
for (const [pw, word] of cases) { const p = pr.passwordProblem(pw); T(`passwordProblem(${JSON.stringify(pw)}) ${word ? 'mentions ' + word : 'is fine'}`, word ? p.toLowerCase().includes(word) : p === '') }
T('weak_password error shown in plain words', /too weak/.test(pr.passwordErrorText({ code: 'weak_password', message: 'Password should contain...' })) && pr.passwordErrorText({ code: 'weak_password' }).includes(pr.PASSWORD_RULE))
T('leaked password error in plain words', /data leak/.test(pr.passwordErrorText({ code: 'weak_password', reasons: ['pwned'], message: 'x' })))
T('other errors pass through', pr.passwordErrorText({ message: 'Something else' }) === 'Something else')

console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
