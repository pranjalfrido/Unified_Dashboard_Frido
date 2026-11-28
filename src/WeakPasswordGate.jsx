import { useState } from 'react'
import { PASSWORD_RULE, passwordProblem } from './passwordRules.js'
import { changeOwnPassword } from './profile/profileShared.js'
import { supabase } from './supabase.js'
import { weakFlag } from './weakFlag.js'

export const WEAK_MAX_SKIPS = 3

// Shown after login when Supabase said the password no longer meets the rules (profile.weak_password).
// "Remind me later" works for WEAK_MAX_SKIPS logins, then the person has to set a new password to continue.
export default function WeakPasswordGate({ session, profile, onFixed, onLater }) {
  const skips = Number(profile?.weak_skips) || 0
  const left = WEAK_MAX_SKIPS - skips
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!cur) return setErr('Enter your current password.')
    const bad = passwordProblem(pw)
    if (bad) return setErr(bad)
    if (pw !== pw2) return setErr('Passwords do not match.')
    if (pw === cur) return setErr('The new password must be different from the current one.')
    setBusy(true); setErr('')
    const { error } = await changeOwnPassword(session.user.email, cur, pw)
    setBusy(false)
    if (error) return setErr(error.message)
    onFixed()
  }

  async function later() {
    // Counted in the profile so it holds across devices; ignored if the column is not there yet.
    await weakFlag('skip')
    onLater(skips + 1)
  }

  const input = { width: '100%', padding: '12px 14px', fontSize: 14.5, border: '1.5px solid #E6E1D2', borderRadius: 9, background: '#F5F1E8', color: '#17211C', boxSizing: 'border-box' }
  const label = { fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#17211C' }
  return (
    <div style={{ minHeight: 'var(--app-h, 100vh)', background: '#F5F1E8', display: 'grid', placeItems: 'center', padding: 24, fontFamily: "'Manrope', sans-serif" }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px -20px rgba(23,33,28,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D9612E' }}>Security</div>
        <h2 style={{ margin: 0, fontSize: 22, color: '#17211C' }}>Please set a stronger password</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: '#4B534F' }}>Your current password no longer meets our rules. {PASSWORD_RULE}</p>
        {err && <div role="alert" style={{ background: '#FCF0E8', border: '1.5px solid #D9612E', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#D9612E', fontWeight: 600 }}>{err}</div>}
        <label><span style={label}>Current password</span><input style={input} type={show ? 'text' : 'password'} value={cur} onChange={e => { setCur(e.target.value); setErr('') }} autoComplete="current-password" autoFocus /></label>
        <label><span style={label}>New password</span><input style={input} type={show ? 'text' : 'password'} value={pw} onChange={e => { setPw(e.target.value); setErr('') }} autoComplete="new-password" /></label>
        <label><span style={label}>Confirm new password</span><input style={input} type={show ? 'text' : 'password'} value={pw2} onChange={e => { setPw2(e.target.value); setErr('') }} autoComplete="new-password" /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4B534F' }}><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords</label>
        <button type="submit" disabled={busy} style={{ padding: 13, border: 'none', borderRadius: 9, background: '#2F6A45', color: '#F5F1E8', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Updating…' : 'Set new password'}</button>
        {left > 0
          ? <button type="button" onClick={later} disabled={busy} style={{ background: 'none', border: 'none', color: '#6E6858', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Remind me later ({left} {left === 1 ? 'time' : 'times'} left)</button>
          : <div style={{ fontSize: 12.5, color: '#6E6858', textAlign: 'center' }}>You have used all reminders. Set a new password to continue.</div>}
        <button type="button" onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#6E6858', fontSize: 12.5, cursor: 'pointer' }}>Sign out</button>
      </form>
    </div>
  )
}
