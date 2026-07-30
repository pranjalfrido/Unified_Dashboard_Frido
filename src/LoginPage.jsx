import { useState } from 'react'
import { supabase } from './supabase.js'

// ── Forgot Password (in-app, no email) ───────────────────────────────────────
function ForgotPassword({ prefillEmail, onBack }) {
  const [step, setStep] = useState(1) // 1=email, 2=verify old pw, 3=set new pw
  const [email, setEmail] = useState(prefillEmail || '')
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (!email.trim()) { setErr('Enter your email.'); return }
    // Check email exists in user_profiles
    const { data } = await supabase.from('user_profiles').select('user_id, is_active').eq('email', email.trim().toLowerCase()).single()
    if (!data) { setErr('No account found with this email.'); return }
    if (!data.is_active) { setErr('Your account has been revoked. Contact your admin.'); return }
    setErr('')
    setStep(2)
  }

  async function handleOldPwSubmit(e) {
    e.preventDefault()
    if (!oldPw) { setErr('Enter your current password.'); return }
    setLoading(true)
    setErr('')
    window._suppressAuth = true
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: oldPw })
    if (error) { window._suppressAuth = false; setErr('Current password is incorrect.'); setLoading(false); return }
    setLoading(false)
    setStep(3)
  }

  async function handleNewPwSubmit(e) {
    e.preventDefault()
    if (newPw.length < 8) { setErr('New password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setErr('Passwords do not match.'); return }
    setLoading(true)
    setErr('')
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setErr(error.message); setLoading(false); return }
    await supabase.auth.signOut()
    window._suppressAuth = false
    setDone(true)
    setLoading(false)
  }

  if (done) return (
    <div>
      <button onClick={onBack} style={s.backBtn}>← Back to sign in</button>
      <div style={s.successBox}>✓ Password updated successfully! You can now sign in with your new password.</div>
    </div>
  )

  return (
    <div>
      <button onClick={onBack} style={s.backBtn}>← Back to sign in</button>
      <div style={s.eyebrow}>Reset password</div>
      <h2 style={s.h2}>{step === 1 ? 'Forgot your password?' : step === 2 ? 'Verify your identity' : 'Set new password'}</h2>
      <p style={s.sub}>
        {step === 1 ? 'Enter your work email to continue.' : step === 2 ? 'Enter your current password to verify it\'s you.' : 'Choose a new password for your account.'}
      </p>

      {err && <div style={s.errorBox}>{err}</div>}

      {step === 1 && (
        <form onSubmit={handleEmailSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Work email</label>
            <input style={s.input} type="email" placeholder="you@myfrido.com" value={email} onChange={e => { setEmail(e.target.value); setErr('') }} autoFocus />
          </div>
          <button type="submit" style={s.btn}>Continue →</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleOldPwSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Current password</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...s.input, paddingRight: 60 }} type={showOld ? 'text' : 'password'} placeholder="Enter current password" value={oldPw} onChange={e => { setOldPw(e.target.value); setErr('') }} autoFocus />
              <button type="button" style={s.toggle} onClick={() => setShowOld(v => !v)}>{showOld ? 'HIDE' : 'SHOW'}</button>
            </div>
          </div>
          <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Verifying…' : 'Verify →'}</button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleNewPwSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>New password</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...s.input, paddingRight: 60 }} type={showNew ? 'text' : 'password'} placeholder="Min 8 characters" value={newPw} onChange={e => { setNewPw(e.target.value); setErr('') }} autoFocus />
              <button type="button" style={s.toggle} onClick={() => setShowNew(v => !v)}>{showNew ? 'HIDE' : 'SHOW'}</button>
            </div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Confirm new password</label>
            <input style={s.input} type={showNew ? 'text' : 'password'} placeholder="Repeat new password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setErr('') }} />
          </div>
          <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Updating…' : 'Update password'}</button>
        </form>
      )}
    </div>
  )
}

// ── Main Login Page ───────────────────────────────────────────────────────────
export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [emailErr, setEmailErr] = useState('')
  const [passErr, setPassErr] = useState('')
  const [globalErr, setGlobalErr] = useState('')
  const [forgotMode, setForgotMode] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    const eOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    const pOk = password.length >= 1
    setEmailErr(eOk ? '' : 'Enter a valid email address.')
    setPassErr(pOk ? '' : 'Enter your password.')
    if (!eOk || !pOk) return

    setLoading(true)
    setGlobalErr('')

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) {
      setGlobalErr('Incorrect email or password.')
      setLoading(false)
      return
    }

    // Check if user is active
    const { data: profile } = await supabase.from('user_profiles').select('is_active').eq('user_id', data.user.id).single()
    if (profile && !profile.is_active) {
      await supabase.auth.signOut()
      setGlobalErr('Your account has been revoked. Contact your admin.')
      setLoading(false)
      return
    }

    // Log login activity
    await supabase.from('login_activity').insert({ user_id: data.user.id, action: 'login' })

    setLoading(false)
    onLogin(data.session)
  }

  return (
    <div style={s.page}>
      <div style={s.shell}>
        {/* Left brand panel */}
        <div style={s.side}>
          <div style={s.grain} />
          <div style={s.brandmark}>
            <img src="/frido-logo.png" alt="Frido" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            <span style={s.wordmark}>frido</span>
          </div>
          <div style={s.copy}>
            <div style={s.kicker}>Freedom To Do More</div>
            <h1 style={s.headline}>Helping people<br /><em style={{ fontStyle: 'italic', color: '#F4D9C6' }}>walk, sit,</em> and<br />sleep better.</h1>
            <p style={s.desc}>Frido brings together innovation, comfort, and science-backed design to help you sit, sleep, work, and travel better — trusted by lakhs of customers across India.</p>
            <div style={s.figureWrap}>
              <svg viewBox="0 0 300 130" width="280" style={{ maxWidth: '100%', height: 'auto' }}>
                <path d="M60 118 C60 100 66 90 78 88 L78 60 C78 48 86 40 98 40 C110 40 118 48 118 60 L118 88 C130 90 138 98 140 112" stroke="rgba(245,241,232,0.35)" strokeWidth="2" fill="none" strokeLinecap="round" />
                <line x1="140" y1="112" x2="140" y2="122" stroke="rgba(245,241,232,0.35)" strokeWidth="2" strokeLinecap="round" />
                <line x1="60" y1="118" x2="60" y2="122" stroke="rgba(245,241,232,0.35)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="98" cy="52" r="5" fill="#D9612E" opacity="0.9" />
                <text x="112" y="56" style={s.zoneLabel}>Neck</text>
                <circle cx="82" cy="90" r="5" fill="#D9612E" opacity="0.9" />
                <text x="40" y="86" style={s.zoneLabel}>Lower back</text>
                <circle cx="70" cy="115" r="5" fill="#D9612E" opacity="0.9" />
                <text x="10" y="111" style={s.zoneLabel}>Tailbone</text>
              </svg>
            </div>
          </div>
          <div style={s.footline}>
            <div style={s.metrics}>
              <div style={s.metric}><b style={s.metricB}>5L+</b><small style={s.metricSm}>Customers served</small></div>
              <div style={s.metric}><b style={s.metricB}>17+</b><small style={s.metricSm}>Experience stores</small></div>
              <div style={s.metric}><b style={s.metricB}>98%</b><small style={s.metricSm}>On-time delivery</small></div>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div style={s.formSide}>
          <div style={{ fontSize: 12.5, color: '#7A8079', marginBottom: 40 }}>Frido Dashboard</div>

          {forgotMode ? (
            <ForgotPassword prefillEmail={email} onBack={() => setForgotMode(false)} />
          ) : (
            <>
              <div style={s.eyebrow}>Welcome back</div>
              <h2 style={s.h2}>Sign in to your workspace</h2>
              <p style={s.sub}>Use your Frido team credentials to continue.</p>

              {globalErr && <div style={s.errorBox}>{globalErr}</div>}

              <form onSubmit={handleLogin} style={s.form} noValidate>
                <div style={s.field}>
                  <label style={s.label}>Work email</label>
                  <input style={{ ...s.input, ...(emailErr ? s.inputErr : {}) }} type="email" placeholder="you@myfrido.com"
                    value={email} onChange={e => { setEmail(e.target.value); setEmailErr('') }} autoComplete="email" />
                  {emailErr && <span style={s.err}>{emailErr}</span>}
                </div>

                <div style={s.field}>
                  <label style={s.label}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...s.input, paddingRight: 60, ...(passErr ? s.inputErr : {}) }}
                      type={showPass ? 'text' : 'password'} placeholder="Enter your password"
                      value={password} onChange={e => { setPassword(e.target.value); setPassErr('') }}
                      autoComplete="current-password" />
                    <button type="button" style={s.toggle} onClick={() => setShowPass(v => !v)}>{showPass ? 'HIDE' : 'SHOW'}</button>
                  </div>
                  {passErr && <span style={s.err}>{passErr}</span>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#7A8079', cursor: 'pointer' }}>
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#2F6A45', cursor: 'pointer' }} />
                    Keep me signed in
                  </label>
                  <button type="button" style={s.forgotLink} onClick={() => { setGlobalErr(''); setForgotMode(true) }}>Forgot password?</button>
                </div>

                <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                  {!loading && <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
              </form>

              <p style={{ marginTop: 28, textAlign: 'center', fontSize: 13, color: '#7A8079' }}>
                Don't have access? <span style={{ color: '#2F6A45', fontWeight: 700 }}>Contact your admin</span>
              </p>
            </>
          )}
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=Baloo+2:wght@600;700&display=swap');`}</style>
    </div>
  )
}

const s = {
  page: { fontFamily: "'Manrope', sans-serif", background: '#F5F1E8', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32 },
  shell: { width: '100%', maxWidth: 1040, minHeight: 640, background: '#FFFFFF', borderRadius: 28, display: 'grid', gridTemplateColumns: '1.05fr 1fr', overflow: 'hidden', boxShadow: '0 30px 80px -30px rgba(23,33,28,0.25)' },
  side: { position: 'relative', background: '#2F6A45', color: '#F5F1E8', padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' },
  grain: { position: 'absolute', inset: 0, background: 'radial-gradient(circle at 78% 8%, rgba(255,255,255,0.06), transparent 40%), radial-gradient(circle at 8% 100%, rgba(217,97,46,0.25), transparent 45%)', pointerEvents: 'none' },
  brandmark: { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 11 },
  wordmark: { fontFamily: "'Baloo 2', sans-serif", fontWeight: 700, fontSize: 23, color: '#F5F1E8', lineHeight: 1 },
  copy: { position: 'relative', zIndex: 2, maxWidth: 380, marginTop: 24 },
  kicker: { fontSize: 11.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F4D9C6', marginBottom: 14 },
  headline: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 'clamp(24px, 2.4vw, 32px)', lineHeight: 1.22, color: '#F5F1E8' },
  desc: { marginTop: 14, fontSize: 14, lineHeight: 1.6, color: 'rgba(245,241,232,0.72)' },
  figureWrap: { position: 'relative', zIndex: 2, marginTop: 34 },
  zoneLabel: { fontFamily: "'Manrope', sans-serif", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fill: 'rgba(245,241,232,0.55)' },
  footline: { position: 'relative', zIndex: 2 },
  metrics: { display: 'flex', gap: 28, paddingTop: 24, borderTop: '1px solid rgba(245,241,232,0.18)' },
  metric: { display: 'flex', flexDirection: 'column' },
  metricB: { fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: '#F5F1E8' },
  metricSm: { fontSize: 11, color: 'rgba(245,241,232,0.55)' },
  formSide: { padding: '48px 46px', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  eyebrow: { fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D9612E', marginBottom: 8 },
  h2: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 27, color: '#17211C', marginBottom: 6 },
  sub: { fontSize: 13.5, color: '#7A8079', marginBottom: 30 },
  form: { display: 'flex', flexDirection: 'column', gap: 17 },
  field: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: '#17211C' },
  input: { width: '100%', padding: '13px 15px', fontSize: 14.5, fontFamily: "'Manrope', sans-serif", border: '1.5px solid #E6E1D2', borderRadius: 9, background: '#F5F1E8', color: '#17211C', outline: 'none', boxSizing: 'border-box' },
  inputErr: { borderColor: '#D9612E', background: '#FCF0E8' },
  err: { fontSize: 11.5, color: '#D9612E', fontWeight: 700, marginTop: 5 },
  toggle: { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 11.5, fontWeight: 800, color: '#7A8079', cursor: 'pointer' },
  forgotLink: { color: '#2F6A45', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 },
  btn: { marginTop: 6, width: '100%', padding: 14, border: 'none', borderRadius: 9, background: '#2F6A45', color: '#F5F1E8', fontFamily: "'Manrope', sans-serif", fontSize: 14.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorBox: { background: '#FCF0E8', border: '1.5px solid #D9612E', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#D9612E', fontWeight: 600, marginBottom: 4 },
  successBox: { background: '#EAF4EE', border: '1.5px solid #2F6A45', borderRadius: 8, padding: '14px 16px', fontSize: 13.5, color: '#2F6A45', fontWeight: 600, marginTop: 16 },
  backBtn: { background: 'none', border: 'none', color: '#7A8079', fontSize: 13, cursor: 'pointer', fontWeight: 700, marginBottom: 24, padding: 0 },
}
