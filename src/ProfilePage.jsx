import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase.js'
import { PERMISSION_TREE } from './permissionTree.js'

const API = import.meta.env.VITE_API_URL || ''

async function adminCall(action, session, payload) {
  const res = await fetch(`${API}/api/auth-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, callerToken: session.access_token, ...payload }),
  })
  return res.json()
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: '#1E2321', color: '#F7F5EF', fontSize: 13, fontWeight: 600,
      padding: '10px 22px', borderRadius: 100, zIndex: 10000,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
      fontFamily: 'Inter, system-ui, sans-serif',
      animation: 'fadeInUp .2s ease',
    }}>
      {message}
    </div>
  )
}

function useToast() {
  const [msg, setMsg] = useState('')
  const show = useCallback((m) => { setMsg(m) }, [])
  const el = msg ? <Toast message={msg} onDone={() => setMsg('')} /> : null
  return [el, show]
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'radial-gradient(135deg, #F4B400 0%, #B8830A 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.36, fontWeight: 700,
      fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '-0.02em',
      position: 'relative', overflow: 'hidden',
    }}>
      {initials(name)}
      {url && (
        <img src={url} alt={name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      )}
    </div>
  )
}

// ── StatusPill ────────────────────────────────────────────────────────────────
function StatusPill({ active }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      background: active ? '#E4EFE6' : '#F6E6E1',
      color: active ? '#3E6B4F' : '#B4472B',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {active ? 'Active' : 'Revoked'}
    </span>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel, danger = true }) {
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onCancel])
  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={{ ...S.modal, maxWidth: 360, padding: '28px 28px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, color: '#1E2321', marginBottom: 20, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.outlineBtn} onClick={onCancel}>Cancel</button>
          <button style={danger ? S.destructiveBtn : S.primaryBtn} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── My Profile ────────────────────────────────────────────────────────────────
function MyProfile({ session, onProfileUpdated }) {
  const [profile, setProfile] = useState(null)
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [showChangePw, setShowChangePw] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwErr, setPwErr] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    supabase.from('user_profiles').select('*').eq('user_id', session.user.id).single()
      .then(({ data }) => { if (data) { setProfile(data); setName(data.name || ''); setAvatarUrl(data.avatar_url || '') } })
  }, [])

  async function uploadAvatar(file) {
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${session.user.id}/avatar.${ext}`
    await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()
    setAvatarUrl(url)
    await supabase.from('user_profiles').update({ avatar_url: url }).eq('user_id', session.user.id)
    setUploading(false)
    onProfileUpdated()
  }

  async function saveProfile() {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('user_profiles').update({ name: name.trim() }).eq('user_id', session.user.id)
    setSaveMsg('✓ Saved')
    setTimeout(() => setSaveMsg(''), 2500)
    setSaving(false)
    onProfileUpdated()
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwErr('')
    if (newPw.length < 8) { setPwErr('New password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setPwErr('Passwords do not match.'); return }
    setPwLoading(true)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: session.user.email, password: curPw })
    if (signInErr) { setPwErr('Current password is incorrect.'); setPwLoading(false); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwErr(error.message); setPwLoading(false); return }
    setPwMsg('Password updated successfully!')
    setCurPw(''); setNewPw(''); setConfirmPw('')
    setShowChangePw(false)
    setTimeout(() => setPwMsg(''), 3000)
    setPwLoading(false)
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>My Profile</div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Avatar col */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 80 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
            <Avatar url={avatarUrl} name={name} size={80} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}
            />
          </div>
          <button style={{ ...S.smBtn, fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadAvatar(e.target.files[0])} />
        </div>

        {/* Fields col */}
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>Full name</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Email</label>
            <input style={{ ...S.input, background: '#F0EDE6', color: '#4B534F', cursor: 'not-allowed' }} value={session.user.email} disabled />
          </div>
          <div>
            <label style={S.label}>Role</label>
            <input style={{ ...S.input, background: '#F0EDE6', color: '#4B534F', cursor: 'not-allowed' }} value={profile?.is_admin ? 'Admin' : 'Member'} disabled />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button style={S.primaryBtn} onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            {saveMsg && <span style={{ fontSize: 13, color: '#3E6B4F', fontWeight: 700 }}>{saveMsg}</span>}
          </div>
        </div>
      </div>

      {pwMsg && <div style={{ ...S.successBox, marginTop: 16 }}>{pwMsg}</div>}

      {/* Password row */}
      <div style={{ marginTop: 24, borderTop: `1px solid #E7E3D8`, paddingTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2321' }}>Password</div>
            <div style={{ fontSize: 12.5, color: '#4B534F', marginTop: 2 }}>Update your account password</div>
          </div>
          <button style={S.outlineBtn} onClick={() => setShowChangePw(v => !v)}>{showChangePw ? 'Cancel' : 'Change password'}</button>
        </div>
        {showChangePw && (
          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 18, maxWidth: 360 }}>
            {pwErr && <div style={S.errBox}>{pwErr}</div>}
            <div>
              <label style={S.label}>Current password</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...S.input, paddingRight: 60 }} type={showCur ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="Enter current password" />
                <button type="button" style={S.toggleBtn} onClick={() => setShowCur(v => !v)}>{showCur ? 'HIDE' : 'SHOW'}</button>
              </div>
            </div>
            <div>
              <label style={S.label}>New password</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...S.input, paddingRight: 60 }} type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
                <button type="button" style={S.toggleBtn} onClick={() => setShowNew(v => !v)}>{showNew ? 'HIDE' : 'SHOW'}</button>
              </div>
            </div>
            <div>
              <label style={S.label}>Confirm new password</label>
              <input style={S.input} type={showNew ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
            </div>
            <button type="submit" style={{ ...S.primaryBtn, width: 'fit-content' }} disabled={pwLoading}>{pwLoading ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({ session, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(2, 10) + 'A1!')
  const [showPw, setShowPw] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tabs, setTabs] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function regenPassword() {
    setPassword(Math.random().toString(36).slice(2, 10) + 'A1!')
  }

  function toggleTab(key) {
    setTabs(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key])
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!email.trim()) { setErr('Email is required.'); return }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (!isAdmin && tabs.length === 0) { setErr('Assign at least one tab permission.'); return }
    setErr(''); setLoading(true)
    const result = await adminCall('create_user', session, { name: name.trim(), email: email.trim().toLowerCase(), password, is_admin: isAdmin, tabs })
    if (result.error) { setErr(result.error); setLoading(false); return }
    setLoading(false); onCreated(); onClose()
  }

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#1E2321' }}>Add team member</div>
          <button style={S.iconBtn} onClick={onClose}>✕</button>
        </div>
        {err && <div style={{ ...S.errBox, marginBottom: 16 }}>{err}</div>}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={S.label}>Full name</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" autoFocus />
          </div>
          <div>
            <label style={S.label}>Work email</label>
            <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@myfrido.com" />
          </div>
          <div>
            <label style={S.label}>Temporary password</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input style={{ ...S.input, paddingRight: 60, fontFamily: 'monospace', letterSpacing: '0.04em' }} type="text" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <button type="button" style={{ ...S.smBtn, flexShrink: 0, fontSize: 16, padding: '8px 12px' }} onClick={regenPassword} title="Regenerate password">↻</button>
            </div>
            <div style={{ fontSize: 11.5, color: '#4B534F', marginTop: 5 }}>Share this with the person directly — it won't be shown again.</div>
          </div>
          <div>
            <label style={{ ...S.label, marginBottom: 10 }}>Role</label>
            <div style={{ display: 'flex', gap: 8, background: '#F7F5EF', borderRadius: 10, padding: 4 }}>
              {[{ id: true, label: 'Admin' }, { id: false, label: 'Member' }].map(r => (
                <button key={String(r.id)} type="button"
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: isAdmin === r.id ? 700 : 500, cursor: 'pointer', transition: 'all .15s',
                    background: isAdmin === r.id ? '#fff' : 'transparent',
                    color: isAdmin === r.id ? '#1E2321' : '#4B534F',
                    boxShadow: isAdmin === r.id ? '0 1px 4px rgba(0,0,0,.10)' : 'none',
                  }}
                  onClick={() => setIsAdmin(r.id)}>{r.label}</button>
              ))}
            </div>
            {isAdmin && <p style={{ fontSize: 12, color: '#4B534F', marginTop: 6 }}>Admins can see all tabs and manage team members.</p>}
          </div>
          {!isAdmin && (
            <div>
              <label style={{ ...S.label, marginBottom: 6 }}>Tab permissions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PERMISSION_TREE.map(t => {
                  if (t.isGroup) {
                    const allChildKeys = t.children.map(c => c.key)
                    const allSel = allChildKeys.every(k => tabs.includes(k))
                    return (
                      <div key={t.key}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9BA5A1', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{t.label}</span>
                          <button type="button" onClick={() => {
                            if (allSel) setTabs(prev => prev.filter(k => !allChildKeys.includes(k)))
                            else setTabs(prev => [...prev.filter(k => !allChildKeys.includes(k)), ...allChildKeys])
                          }} style={{ fontSize: 10, fontWeight: 600, color: allSel ? '#E24B4A' : '#4B7C5E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                            {allSel ? 'Remove all' : 'Select all'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 8 }}>
                          {t.children.map(child => {
                            const sel = tabs.includes(child.key)
                            return (
                              <button key={child.key} type="button"
                                style={{ ...S.chip, ...(sel ? S.chipActive : {}) }}
                                onClick={() => setTabs(prev => sel ? prev.filter(k => k !== child.key) : [...prev, child.key])}>
                                {child.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  const sel = tabs.includes(t.key)
                  return (
                    <div key={t.key}>
                      <button type="button"
                        style={{ ...S.chip, ...(sel ? S.chipActive : {}) }}
                        onClick={() => setTabs(prev => sel ? prev.filter(k => k !== t.key) : [...prev, t.key])}>
                        {t.label}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, borderTop: `1px solid #E7E3D8`, paddingTop: 18 }}>
            <button type="button" style={S.outlineBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...S.primaryBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ session, user, onClose, onDone }) {
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleReset(e) {
    e.preventDefault()
    if (newPw.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setErr('Passwords do not match.'); return }
    setErr(''); setLoading(true)
    const result = await adminCall('reset_password', session, { user_id: user.user_id, new_password: newPw })
    if (result.error) { setErr(result.error); setLoading(false); return }
    setLoading(false); onDone(); onClose()
  }

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#1E2321' }}>Reset password</div>
          <button style={S.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: '#4B534F', marginBottom: 20 }}>Setting new password for <strong style={{ color: '#1E2321' }}>{user.name}</strong></div>
        {err && <div style={{ ...S.errBox, marginBottom: 16 }}>{err}</div>}
        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>New password</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...S.input, paddingRight: 60 }} type={showPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" autoFocus />
              <button type="button" style={S.toggleBtn} onClick={() => setShowPw(v => !v)}>{showPw ? 'HIDE' : 'SHOW'}</button>
            </div>
          </div>
          <div>
            <label style={S.label}>Confirm password</label>
            <input style={S.input} type={showPw ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" />
          </div>
          <div style={{ fontSize: 12, color: '#4B534F' }}>Share the new password with {user.name} via Teams or email.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid #E7E3D8`, paddingTop: 16 }}>
            <button type="button" style={S.outlineBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...S.primaryBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Activity Log ──────────────────────────────────────────────────────────────
function ActivityLog({ userId, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('login_activity').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [userId, onClose])

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#1E2321' }}>Login activity</div>
          <button style={S.iconBtn} onClick={onClose}>✕</button>
        </div>
        {loading ? <div style={{ color: '#4B534F', fontSize: 13 }}>Loading…</div> : logs.length === 0 ? (
          <div style={{ color: '#4B534F', fontSize: 13 }}>No activity recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {logs.map(log => (
              <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F7F5EF', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: log.action === 'login' ? '#3E6B4F' : '#B4472B' }}>
                  {log.action === 'login' ? '→ Logged in' : '← Logged out'}
                </span>
                <span style={{ fontSize: 12, color: '#4B534F' }}>{fmtDate(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── User Row ──────────────────────────────────────────────────────────────────
function UserRow({ user, permissions, session, onUpdate, showToast, isLast }) {
  const [expanded, setExpanded] = useState(false)
  const [localTabs, setLocalTabs] = useState(permissions)
  const [saving, setSaving] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { setLocalTabs(permissions) }, [permissions])

  async function savePermissions() {
    setSaving(true)
    await supabase.from('user_permissions').delete().eq('user_id', user.user_id)
    if (localTabs.length > 0) await supabase.from('user_permissions').insert(localTabs.map(tab => ({ user_id: user.user_id, tab })))
    setSaving(false); setExpanded(false); onUpdate()
    showToast('Permissions saved')
  }

  async function revokeUser() {
    setRevoking(true)
    await adminCall('revoke_user', session, { user_id: user.user_id })
    setRevoking(false); setConfirmRevoke(false); onUpdate()
    showToast(user.is_active ? `${user.name} revoked` : `${user.name} restored`)
  }

  async function deleteUser() {
    setDeleting(true)
    await adminCall('delete_user', session, { user_id: user.user_id })
    setDeleting(false); setConfirmDelete(false); onUpdate()
    showToast(`${user.name} deleted`)
  }

  const tabsChanged = JSON.stringify([...localTabs].sort()) !== JSON.stringify([...permissions].sort())
  const isRevoked = !user.is_active

  return (
    <>
      <div style={{
        borderBottom: isLast ? 'none' : `1px solid #E7E3D8`,
        padding: '16px 0',
        opacity: isRevoked ? 0.65 : 1,
        transition: 'opacity .2s',
      }}>
        {/* Main row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <Avatar url={user.avatar_url} name={user.name} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2321' }}>{user.name}</span>
              <StatusPill active={user.is_active} />
              {user.is_admin
                ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 100, background: '#F7F5EF', color: '#4B534F', border: '1px solid #E7E3D8' }}>Admin</span>
                : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 100, background: '#F7F5EF', color: '#4B534F', border: '1px solid #E7E3D8' }}>{permissions.length} tab{permissions.length !== 1 ? 's' : ''}</span>
              }
            </div>
            {/* Email */}
            <div style={{ fontSize: 12.5, color: '#4B534F' }}>{user.email}</div>
            {/* Last login */}
            <div style={{ fontSize: 11.5, color: '#9BA5A1', marginTop: 1 }}>Last login: {fmtDate(user.last_login_at)}</div>
            {/* Tab access toggle link */}
            <button
              style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, fontSize: 12.5, color: '#4B534F', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setExpanded(v => !v)}>
              <span style={{ fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
              {expanded ? 'Hide tab access' : 'Tab access'}
            </button>

            {/* Expanded tab panel — inline below the link */}
            {expanded && (
              <div style={{ marginTop: 10 }}>
                {user.is_admin ? (
                  <div style={{ fontSize: 12.5, color: '#4B534F', fontStyle: 'italic' }}>Admins have access to every tab.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9BA5A1', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Click to grant or remove access</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                      {PERMISSION_TREE.map(t => {
                        if (t.isGroup) {
                          const allChildKeys = t.children.map(c => c.key)
                          const allSel = allChildKeys.every(k => localTabs.includes(k))
                          return (
                            <div key={t.key}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#9BA5A1', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{t.label}</span>
                                <button type="button" onClick={() => {
                                  if (allSel) setLocalTabs(prev => prev.filter(k => !allChildKeys.includes(k)))
                                  else setLocalTabs(prev => [...prev.filter(k => !allChildKeys.includes(k)), ...allChildKeys])
                                }} style={{ fontSize: 10, fontWeight: 600, color: allSel ? '#E24B4A' : '#4B7C5E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                                  {allSel ? 'Remove all' : 'Select all'}
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 8 }}>
                                {t.children.map(child => {
                                  const sel = localTabs.includes(child.key)
                                  return (
                                    <button key={child.key} type="button"
                                      style={{ ...S.chip, ...(sel ? S.chipActive : {}) }}
                                      onClick={() => setLocalTabs(prev => sel ? prev.filter(k => k !== child.key) : [...prev, child.key])}>
                                      {child.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }
                        const sel = localTabs.includes(t.key)
                        return (
                          <div key={t.key}>
                            <button type="button"
                              style={{ ...S.chip, ...(sel ? S.chipActive : {}) }}
                              onClick={() => setLocalTabs(prev => sel ? prev.filter(k => k !== t.key) : [...prev, t.key])}>
                              {t.label}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {tabsChanged && (
                      <button style={{ ...S.primaryBtn, fontSize: 12.5, padding: '8px 16px', opacity: saving ? 0.7 : 1 }} onClick={savePermissions} disabled={saving}>
                        {saving ? 'Saving…' : 'Save permissions'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Text action buttons */}
          <div style={{ display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center', paddingTop: 2 }}>
            <button style={S.textBtn} onClick={() => setShowActivity(true)}>Activity</button>
            <button style={S.textBtn} onClick={() => setShowReset(true)}>Reset pw</button>
            {user.is_active
              ? <button style={{ ...S.textBtn, color: '#B4472B' }} onClick={() => setConfirmRevoke(true)}>Revoke</button>
              : <button style={{ ...S.textBtn, color: '#3E6B4F' }} onClick={() => setConfirmRevoke(true)}>Restore</button>
            }
            <button style={{ ...S.textBtn, color: '#B4472B' }} onClick={() => setConfirmDelete(true)}>Delete</button>
          </div>
        </div>
      </div>

      {showReset && (
        <ResetPasswordModal session={session} user={user} onClose={() => setShowReset(false)}
          onDone={() => showToast(`Password reset for ${user.name}`)} />
      )}
      {showActivity && <ActivityLog userId={user.user_id} onClose={() => setShowActivity(false)} />}
      {confirmRevoke && (
        <ConfirmDialog
          message={user.is_active
            ? `Revoke access for ${user.name}? They won't be able to log in until restored.`
            : `Restore access for ${user.name}?`}
          confirmLabel={user.is_active ? 'Revoke' : 'Restore'}
          danger={user.is_active}
          onConfirm={revokeUser}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Permanently delete ${user.name}'s account? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteUser}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

// ── Team Members ──────────────────────────────────────────────────────────────
function TeamMembers({ session, showToast }) {
  const [users, setUsers] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  async function loadUsers() {
    setLoading(true)
    const { data: profiles } = await supabase.from('user_profiles').select('*').neq('user_id', session.user.id).order('invited_at', { ascending: false })
    const { data: perms } = await supabase.from('user_permissions').select('*')
    const permMap = {}
    for (const p of (perms || [])) { if (!permMap[p.user_id]) permMap[p.user_id] = []; permMap[p.user_id].push(p.tab) }
    setUsers(profiles || [])
    setPermissions(permMap)
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  return (
    <div style={S.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={S.cardTitle}>Team Members</div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: '#F7F5EF', color: '#4B534F', border: '1px solid #E7E3D8' }}>
            {users.length}
          </span>
        </div>
        <button style={S.primaryBtn} onClick={() => setShowCreate(true)}>+ Add member</button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9BA5A1', pointerEvents: 'none' }}>⌕</span>
        <input
          style={{ ...S.input, paddingLeft: 34, background: '#F7F5EF' }}
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: '#4B534F', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9BA5A1', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          {search ? `No members match "${search}"` : 'No team members yet.'}
        </div>
      ) : (
        filtered.map((u, i) => (
          <UserRow key={u.user_id} user={u} permissions={permissions[u.user_id] || []} session={session} onUpdate={loadUsers} showToast={showToast} isLast={i === filtered.length - 1} />
        ))
      )}

      {showCreate && (
        <CreateUserModal session={session} onClose={() => setShowCreate(false)} onCreated={() => { loadUsers(); showToast('Member added') }} />
      )}
    </div>
  )
}

// ── Main ProfilePage ──────────────────────────────────────────────────────────
export default function ProfilePage({ session, profile, onSignOut, onProfileUpdated }) {
  const [toastEl, showToast] = useToast()

  async function handleSignOut() {
    await supabase.from('login_activity').insert({ user_id: session.user.id, action: 'logout' })
    await supabase.auth.signOut()
    onSignOut()
  }

  return (
    <div style={S.page}>
      {/* Page header */}
      <div style={S.pageHeader}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B8830A', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Frido Admin
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700, color: '#1E2321', margin: 0, lineHeight: 1.1 }}>
            Profile &amp; Settings
          </h1>
        </div>
        <button style={{ ...S.outlineBtn, color: '#B4472B', borderColor: '#B4472B' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F6E6E1' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      <MyProfile session={session} onProfileUpdated={onProfileUpdated} />
      {profile?.is_admin && <TeamMembers session={session} showToast={showToast} />}

      {toastEl}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .profile-page-input:focus { outline: none; border-color: #F4B400 !important; box-shadow: 0 0 0 3px rgba(244,180,0,.15) !important; }
      `}</style>
    </div>
  )
}

// ── Style tokens ──────────────────────────────────────────────────────────────
const S = {
  page: {
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: '28px 28px 48px',
    maxWidth: 880,
    margin: '0 auto',
    color: '#1E2321',
    background: '#F7F5EF',
    minHeight: '100%',
  },
  pageHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 28, flexWrap: 'wrap', gap: 14,
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 16,
    border: '1px solid #E7E3D8',
    padding: '24px 24px',
    marginBottom: 20,
    boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.12)',
  },
  cardTitle: {
    fontSize: 15, fontWeight: 800, color: '#1E2321',
    fontFamily: 'Inter, system-ui, sans-serif',
    marginBottom: 0,
  },
  label: {
    fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6,
    color: '#4B534F', textTransform: 'uppercase', letterSpacing: '.05em',
  },
  input: {
    width: '100%', padding: '10px 13px', fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    border: '1px solid #E7E3D8', borderRadius: 9,
    background: '#F7F5EF', color: '#1E2321',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s, box-shadow .15s',
  },
  toggleBtn: {
    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', fontSize: 11, fontWeight: 800,
    color: '#9BA5A1', cursor: 'pointer', letterSpacing: '.05em',
  },
  primaryBtn: {
    padding: '9px 18px', border: 'none', borderRadius: 8,
    background: '#3E6B4F', color: '#F7F5EF',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer', transition: 'background .15s',
  },
  outlineBtn: {
    padding: '8px 16px', border: '1.5px solid #E7E3D8', borderRadius: 8,
    background: 'transparent', color: '#1E2321',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'background .15s',
  },
  destructiveBtn: {
    padding: '9px 18px', border: '1.5px solid #B4472B', borderRadius: 8,
    background: '#B4472B', color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer',
  },
  smBtn: {
    padding: '6px 12px', border: '1px solid #E7E3D8', borderRadius: 8,
    background: '#fff', color: '#1E2321',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', transition: 'background .12s',
    whiteSpace: 'nowrap',
  },
  textBtn: {
    background: 'none', border: 'none', padding: 0,
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 600,
    color: '#1E2321', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  iconBtn: {
    background: '#F7F5EF', border: 'none', borderRadius: 8,
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, cursor: 'pointer', color: '#4B534F',
  },
  chip: {
    padding: '5px 13px', border: '1px solid #E7E3D8', borderRadius: 100,
    background: '#F7F5EF', color: '#4B534F',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', transition: 'all .12s',
  },
  chipActive: {
    border: '1.5px solid #3E6B4F', background: '#E4EFE6', color: '#3E6B4F',
  },
  errBox: {
    background: '#F6E6E1', border: '1px solid #B4472B', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, color: '#B4472B', fontWeight: 600,
  },
  successBox: {
    background: '#E4EFE6', border: '1px solid #3E6B4F', borderRadius: 8,
    padding: '12px 14px', fontSize: 13, color: '#3E6B4F', fontWeight: 600,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(30,35,33,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 24,
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: '28px 32px',
    width: '100%', maxWidth: 480,
    boxShadow: '0 30px 80px rgba(30,35,33,0.22)',
    maxHeight: '90vh', overflowY: 'auto',
  },
}
