import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase.js'

const ALL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales & Ads' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'customer', label: 'Customer' },
  { key: 'documents', label: 'Documents' },
]

const API = import.meta.env.VITE_API_URL || ''

async function adminCall(action, session, payload) {
  const res = await fetch(`${API}/api/auth-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, callerToken: session.access_token, ...payload }),
  })
  return res.json()
}

function Avatar({ url, name, size = 48 }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '3px solid #2F6A45' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#FFF9E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: '2px solid #E8C832' }}>
      <img src="/frido-logo.png" alt="Frido" style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
    </div>
  )
}

function StatusBadge({ active }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: active ? '#EAF4EE' : '#FFF0EA', color: active ? '#2F6A45' : '#D9612E' }}>
      {active ? 'Active' : 'Revoked'}
    </span>
  )
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
    setSaveMsg('Saved!')
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
    <div style={s.section}>
      <div style={s.sectionTitle}>My Profile</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Avatar url={avatarUrl} name={name} size={80} />
          <button style={s.outlineBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadAvatar(e.target.files[0])} />
        </div>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={s.label}>Full name</label>
            <input style={s.input} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Email</label>
            <input style={{ ...s.input, background: '#F0EEE9', color: '#7A8079' }} value={session.user.email} disabled />
          </div>
          <div>
            <label style={s.label}>Role</label>
            <input style={{ ...s.input, background: '#F0EEE9', color: '#7A8079' }} value={profile?.is_admin ? 'Admin' : 'Member'} disabled />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={s.primaryBtn} onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            {saveMsg && <span style={{ fontSize: 13, color: '#2F6A45', fontWeight: 700 }}>{saveMsg}</span>}
          </div>
        </div>
      </div>

      {pwMsg && <div style={{ ...s.successBox, marginTop: 16 }}>{pwMsg}</div>}

      <div style={{ marginTop: 24, borderTop: '1px solid #E6E1D2', paddingTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Password</div>
            <div style={{ fontSize: 12.5, color: '#7A8079', marginTop: 2 }}>Update your account password</div>
          </div>
          <button style={s.outlineBtn} onClick={() => setShowChangePw(v => !v)}>{showChangePw ? 'Cancel' : 'Change password'}</button>
        </div>
        {showChangePw && (
          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 18, maxWidth: 360 }}>
            {pwErr && <div style={s.errBox}>{pwErr}</div>}
            <div>
              <label style={s.label}>Current password</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...s.input, paddingRight: 60 }} type={showCur ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="Enter current password" />
                <button type="button" style={s.toggle} onClick={() => setShowCur(v => !v)}>{showCur ? 'HIDE' : 'SHOW'}</button>
              </div>
            </div>
            <div>
              <label style={s.label}>New password</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...s.input, paddingRight: 60 }} type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
                <button type="button" style={s.toggle} onClick={() => setShowNew(v => !v)}>{showNew ? 'HIDE' : 'SHOW'}</button>
              </div>
            </div>
            <div>
              <label style={s.label}>Confirm new password</label>
              <input style={s.input} type={showNew ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
            </div>
            <button type="submit" style={{ ...s.primaryBtn, width: 'fit-content' }} disabled={pwLoading}>{pwLoading ? 'Updating…' : 'Update password'}</button>
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
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tabs, setTabs] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

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

    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600 }}>Add team member</div>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        {err && <div style={{ ...s.errBox, marginBottom: 16 }}>{err}</div>}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={s.label}>Full name</label>
            <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={s.label}>Work email</label>
            <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@myfrido.com" />
          </div>
          <div>
            <label style={s.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...s.input, paddingRight: 60 }} type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
              <button type="button" style={s.toggle} onClick={() => setShowPw(v => !v)}>{showPw ? 'HIDE' : 'SHOW'}</button>
            </div>
            <div style={{ fontSize: 12, color: '#7A8079', marginTop: 5 }}>Share this password with the user via Teams or email.</div>
          </div>
          <div>
            <label style={{ ...s.label, marginBottom: 10 }}>Role</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...s.roleBtn, ...(isAdmin ? s.roleBtnActive : {}) }} onClick={() => setIsAdmin(true)}>Admin</button>
              <button type="button" style={{ ...s.roleBtn, ...(!isAdmin ? s.roleBtnActive : {}) }} onClick={() => setIsAdmin(false)}>Member</button>
            </div>
            {isAdmin && <p style={{ fontSize: 12, color: '#7A8079', marginTop: 6 }}>Admins can see all tabs and manage team members.</p>}
          </div>
          {!isAdmin && (
            <div>
              <label style={{ ...s.label, marginBottom: 10 }}>Tab permissions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_TABS.map(t => (
                  <button key={t.key} type="button" style={{ ...s.chip, ...(tabs.includes(t.key) ? s.chipActive : {}) }} onClick={() => toggleTab(t.key)}>{t.label}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={s.outlineBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...s.primaryBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Creating…' : 'Create user'}</button>
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
    setLoading(false)
    onDone()
    onClose()
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Reset password</div>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: '#7A8079', marginBottom: 20 }}>Setting new password for <strong>{user.name}</strong></div>
        {err && <div style={{ ...s.errBox, marginBottom: 16 }}>{err}</div>}
        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={s.label}>New password</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...s.input, paddingRight: 60 }} type={showPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" autoFocus />
              <button type="button" style={s.toggle} onClick={() => setShowPw(v => !v)}>{showPw ? 'HIDE' : 'SHOW'}</button>
            </div>
          </div>
          <div>
            <label style={s.label}>Confirm password</label>
            <input style={s.input} type={showPw ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" />
          </div>
          <div style={{ fontSize: 12, color: '#7A8079' }}>Share the new password with {user.name} via Teams or email.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" style={s.outlineBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...s.primaryBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
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
  }, [userId])

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Login activity</div>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        {loading ? <div style={{ color: '#7A8079', fontSize: 13 }}>Loading…</div> : logs.length === 0 ? (
          <div style={{ color: '#7A8079', fontSize: 13 }}>No activity recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
            {logs.map(log => (
              <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F5F1E8', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: log.action === 'login' ? '#2F6A45' : '#D9612E' }}>
                  {log.action === 'login' ? '→ Logged in' : '← Logged out'}
                </span>
                <span style={{ fontSize: 12, color: '#7A8079' }}>{fmtDate(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── User Row ──────────────────────────────────────────────────────────────────
function UserRow({ user, permissions, session, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [localTabs, setLocalTabs] = useState(permissions)
  const [saving, setSaving] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => { setLocalTabs(permissions) }, [permissions])

  async function savePermissions() {
    setSaving(true)
    await supabase.from('user_permissions').delete().eq('user_id', user.user_id)
    if (localTabs.length > 0) await supabase.from('user_permissions').insert(localTabs.map(tab => ({ user_id: user.user_id, tab })))
    setSaving(false); setExpanded(false); onUpdate()
  }

  async function revokeUser() {
    setRevoking(true)
    await adminCall('revoke_user', session, { user_id: user.user_id })
    setRevoking(false); setConfirmRevoke(false); onUpdate()
  }

  async function deleteUser() {
    setDeleting(true)
    await adminCall('delete_user', session, { user_id: user.user_id })
    setDeleting(false); setConfirmDelete(false); onUpdate()
  }

  const tabsChanged = JSON.stringify([...localTabs].sort()) !== JSON.stringify([...permissions].sort())

  return (
    <>
      <div style={{ borderBottom: '1px solid #E6E1D2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
          <Avatar url={user.avatar_url} name={user.name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{user.name}</div>
            <div style={{ fontSize: 12.5, color: '#7A8079' }}>{user.email}</div>
            <div style={{ fontSize: 11.5, color: '#7A8079', marginTop: 2 }}>Last login: {fmtDate(user.last_login_at)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <StatusBadge active={user.is_active} />
            <div style={{ fontSize: 12, color: '#7A8079', minWidth: 50 }}>
              {user.is_admin ? 'Admin' : `${permissions.length} tab${permissions.length !== 1 ? 's' : ''}`}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
              <button style={s.smBtn} onClick={() => setShowActivity(true)}>Activity</button>
              {!user.is_admin && <button style={s.smBtn} onClick={() => setExpanded(v => !v)}>{expanded ? 'Close' : 'Permissions'}</button>}
              <button style={s.smBtn} onClick={() => setShowReset(true)}>Reset pw</button>
              {user.is_active && (
                confirmRevoke ? (
                  <>
                    <button style={{ ...s.smBtn, background: '#D9612E', color: '#fff', border: 'none' }} onClick={revokeUser} disabled={revoking}>{revoking ? '…' : 'Confirm'}</button>
                    <button style={s.smBtn} onClick={() => setConfirmRevoke(false)}>Cancel</button>
                  </>
                ) : (
                  <button style={{ ...s.smBtn, color: '#D9612E' }} onClick={() => setConfirmRevoke(true)}>Revoke</button>
                )
              )}
              {confirmDelete ? (
                <>
                  <button style={{ ...s.smBtn, background: '#D9612E', color: '#fff', border: 'none' }} onClick={deleteUser} disabled={deleting}>{deleting ? '…' : 'Confirm'}</button>
                  <button style={s.smBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
                </>
              ) : (
                <button style={{ ...s.smBtn, color: '#7A8079' }} onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
            </div>
          </div>
        </div>

        {resetDone && <div style={{ ...s.successBox, marginBottom: 10, marginLeft: 54 }}>✓ Password reset. Share new credentials with {user.name}.</div>}

        {expanded && !user.is_admin && (
          <div style={{ paddingBottom: 14, paddingLeft: 54 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#7A8079', marginBottom: 8 }}>Tab access</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {ALL_TABS.map(t => (
                <button key={t.key} type="button" style={{ ...s.chip, ...(localTabs.includes(t.key) ? s.chipActive : {}) }} onClick={() => setLocalTabs(prev => prev.includes(t.key) ? prev.filter(x => x !== t.key) : [...prev, t.key])}>
                  {t.label}
                </button>
              ))}
            </div>
            {tabsChanged && <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={savePermissions} disabled={saving}>{saving ? 'Saving…' : 'Save permissions'}</button>}
          </div>
        )}
      </div>

      {showReset && <ResetPasswordModal session={session} user={user} onClose={() => setShowReset(false)} onDone={() => setResetDone(true)} />}
      {showActivity && <ActivityLog userId={user.user_id} onClose={() => setShowActivity(false)} />}
    </>
  )
}

// ── Team Members ──────────────────────────────────────────────────────────────
function TeamMembers({ session }) {
  const [users, setUsers] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

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

  return (
    <div style={s.section}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={s.sectionTitle}>Team Members</div>
        <button style={s.primaryBtn} onClick={() => setShowCreate(true)}>+ Add member</button>
      </div>
      {loading ? <div style={{ color: '#7A8079', fontSize: 14 }}>Loading…</div>
        : users.length === 0 ? <div style={{ color: '#7A8079', fontSize: 14 }}>No team members yet.</div>
        : users.map(u => <UserRow key={u.user_id} user={u} permissions={permissions[u.user_id] || []} session={session} onUpdate={loadUsers} />)
      }
      {showCreate && <CreateUserModal session={session} onClose={() => setShowCreate(false)} onCreated={loadUsers} />}
    </div>
  )
}

// ── Main ProfilePage ──────────────────────────────────────────────────────────
export default function ProfilePage({ session, profile, onSignOut, onProfileUpdated }) {
  async function handleSignOut() {
    await supabase.from('login_activity').insert({ user_id: session.user.id, action: 'logout' })
    await supabase.auth.signOut()
    onSignOut()
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600 }}>Profile & Settings</div>
        <button style={{ ...s.outlineBtn, color: '#D9612E', borderColor: '#D9612E' }} onClick={handleSignOut}>Sign out</button>
      </div>
      <MyProfile session={session} onProfileUpdated={onProfileUpdated} />
      {profile?.is_admin && <TeamMembers session={session} />}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Manrope:wght@400;500;600;700;800&display=swap');`}</style>
    </div>
  )
}

const s = {
  page: { fontFamily: "'Manrope', sans-serif", padding: '28px 32px', maxWidth: 860, margin: '0 auto', color: '#17211C' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  section: { background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 12px rgba(23,33,28,0.06)' },
  sectionTitle: { fontSize: 15, fontWeight: 800, marginBottom: 20 },
  label: { fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 },
  input: { width: '100%', padding: '11px 13px', fontSize: 14, fontFamily: "'Manrope', sans-serif", border: '1.5px solid #E6E1D2', borderRadius: 9, background: '#F5F1E8', color: '#17211C', outline: 'none', boxSizing: 'border-box' },
  toggle: { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 11.5, fontWeight: 800, color: '#7A8079', cursor: 'pointer' },
  primaryBtn: { padding: '9px 18px', border: 'none', borderRadius: 8, background: '#2F6A45', color: '#F5F1E8', fontFamily: "'Manrope', sans-serif", fontSize: 13.5, fontWeight: 800, cursor: 'pointer' },
  outlineBtn: { padding: '8px 16px', border: '1.5px solid #E6E1D2', borderRadius: 8, background: 'transparent', color: '#17211C', fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  smBtn: { padding: '6px 12px', border: '1.5px solid #E6E1D2', borderRadius: 7, background: '#fff', color: '#17211C', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  iconBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#7A8079', padding: 4 },
  roleBtn: { padding: '8px 20px', border: '1.5px solid #E6E1D2', borderRadius: 8, background: '#fff', color: '#7A8079', fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  roleBtnActive: { border: '1.5px solid #2F6A45', background: '#EAF4EE', color: '#2F6A45' },
  chip: { padding: '6px 14px', border: '1.5px solid #E6E1D2', borderRadius: 20, background: '#fff', color: '#7A8079', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  chipActive: { border: '1.5px solid #2F6A45', background: '#EAF4EE', color: '#2F6A45' },
  errBox: { background: '#FCF0E8', border: '1.5px solid #D9612E', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#D9612E', fontWeight: 600 },
  successBox: { background: '#EAF4EE', border: '1.5px solid #2F6A45', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#2F6A45', fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(23,33,28,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 },
  modal: { background: '#fff', borderRadius: 20, padding: '32px 36px', width: '100%', maxWidth: 480, boxShadow: '0 30px 80px rgba(23,33,28,0.25)', maxHeight: '90vh', overflowY: 'auto' },
}
