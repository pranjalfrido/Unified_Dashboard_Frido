import { useState, useEffect } from 'react'
import PermissionPanel, { AdminPulseCard } from './PermissionPanel.jsx'
import { adminCall } from './profileShared.js'
import { S } from './profileStyles.js'

// ── Create User Modal ─────────────────────────────────────────────────────────
// The add-member form (same fields, checks and create_user call as before). Used inside the laptop
// modal below and the phone bottom sheet. onCreated(userId) runs after a successful create.
export function CreateUserForm({ session, onCancel, onCreated, existingUsers = [], existingPermissions = {} }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(2, 10) + 'A1!')
  const [showPw, setShowPw] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tabs, setTabs] = useState([])
  const [copyFrom, setCopyFrom] = useState('')
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
    setLoading(false); onCreated(result.user_id)
  }

  return (
    <>
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
          {isAdmin && <AdminPulseCard callerEmail={session?.user?.email} tabs={tabs} setTabs={setTabs} note="Admins don’t get Pulse automatically. Tap to give it now." />}
          {!isAdmin && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...S.label, marginBottom: 0 }}>Tab permissions</label>
                {existingUsers.length > 0 && (
                  <select
                    value={copyFrom}
                    onChange={e => {
                      const uid = e.target.value
                      setCopyFrom(uid)
                      if (uid) setTabs([...(existingPermissions[uid] || [])])
                    }}
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '1px solid #E7E3D8', background: '#F7F5EF', color: copyFrom ? '#1E2321' : '#9BA5A1', fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer', maxWidth: 200 }}
                  >
                    <option value="">Copy from member…</option>
                    {existingUsers.map(u => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <PermissionPanel tabs={tabs} setTabs={setTabs} callerEmail={session?.user?.email} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, borderTop: `1px solid #E7E3D8`, paddingTop: 18 }}>
            <button type="button" style={S.outlineBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" style={{ ...S.primaryBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
    </>
  )
}

// Laptop: the form in the centred modal, as before.
export function CreateUserModal({ session, onClose, onCreated, existingUsers = [], existingPermissions = {} }) {
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
        <CreateUserForm session={session} onCancel={onClose} onCreated={id => { onCreated(id); onClose() }} existingUsers={existingUsers} existingPermissions={existingPermissions} />
      </div>
    </div>
  )
}
