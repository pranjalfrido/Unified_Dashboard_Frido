import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    // Supabase sets a session from the reset link hash automatically
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidSession(true)
    })
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setErr('Passwords do not match.'); return }
    setErr('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setErr(error.message); setLoading(false); return }
    setDone(true)
    setLoading(false)
    setTimeout(() => { window.location.href = '/' }, 2500)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <img src="/frido-logo.png" alt="Frido" style={{ width: 36, height: 36, borderRadius: 8 }} onError={e => e.target.style.display = 'none'} />
          <span style={s.wordmark}>frido</span>
        </div>

        {!validSession ? (
          <div style={s.errBox}>Invalid or expired reset link. Please request a new one from the login page.</div>
        ) : done ? (
          <div style={s.successBox}>
            ✓ Password updated successfully! Redirecting to login…
          </div>
        ) : (
          <>
            <div style={s.eyebrow}>Set new password</div>
            <h2 style={s.h2}>Choose a new password</h2>
            <p style={s.sub}>Must be at least 8 characters.</p>

            {err && <div style={s.errBox}>{err}</div>}

            <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
              <div>
                <label style={s.label}>New password</label>
                <div style={{ position: 'relative' }}>
                  <input style={s.input} type={showPass ? 'text' : 'password'} placeholder="Enter new password"
                    value={password} onChange={e => { setPassword(e.target.value); setErr('') }} />
                  <button type="button" style={s.toggle} onClick={() => setShowPass(v => !v)}>
                    {showPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              <div>
                <label style={s.label}>Confirm password</label>
                <input style={s.input} type={showPass ? 'text' : 'password'} placeholder="Repeat new password"
                  value={confirm} onChange={e => { setConfirm(e.target.value); setErr('') }} />
              </div>

              <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Manrope:wght@400;700;800&family=Baloo+2:wght@700&display=swap');`}</style>
    </div>
  )
}

const s = {
  page: { fontFamily: "'Manrope', sans-serif", background: '#F5F1E8', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 },
  card: { background: '#fff', borderRadius: 20, padding: '44px 40px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px -20px rgba(23,33,28,0.2)' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 },
  wordmark: { fontFamily: "'Baloo 2', sans-serif", fontWeight: 700, fontSize: 21, color: '#17211C' },
  eyebrow: { fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D9612E', marginBottom: 8 },
  h2: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 24, color: '#17211C', marginBottom: 6 },
  sub: { fontSize: 13.5, color: '#7A8079', marginBottom: 24 },
  label: { fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#17211C' },
  input: { width: '100%', padding: '12px 14px', fontSize: 14.5, fontFamily: "'Manrope', sans-serif", border: '1.5px solid #E6E1D2', borderRadius: 9, background: '#F5F1E8', color: '#17211C', outline: 'none', boxSizing: 'border-box' },
  toggle: { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 11.5, fontWeight: 800, color: '#7A8079', cursor: 'pointer' },
  btn: { width: '100%', padding: 13, border: 'none', borderRadius: 9, background: '#2F6A45', color: '#F5F1E8', fontFamily: "'Manrope', sans-serif", fontSize: 14.5, fontWeight: 800, cursor: 'pointer', marginTop: 4 },
  errBox: { background: '#FCF0E8', border: '1.5px solid #D9612E', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#D9612E', fontWeight: 600, marginBottom: 16 },
  successBox: { background: '#EAF4EE', border: '1.5px solid #2F6A45', borderRadius: 8, padding: '14px 16px', fontSize: 14, color: '#2F6A45', fontWeight: 600 },
}
