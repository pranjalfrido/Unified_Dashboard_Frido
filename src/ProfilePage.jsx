import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase.js'
import PermissionPanel, { AdminPulseCard } from './profile/PermissionPanel.jsx'
import { CreateUserModal } from './profile/CreateUser.jsx'
import Avatar from './profile/Avatar.jsx'
import { adminCall, fmtDate, useMyProfile, PULSE_WHITELIST } from './profile/profileShared.js'
import { S } from './profile/profileStyles.js'
import ProfileMobile from './profile/ProfileMobile.jsx'
import { useBreakpoint } from './responsive/useBreakpoint.js'



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
  const { profile, name, setName, avatarUrl, uploading, uploadAvatar, saving, saveMsg, saveProfile,
    showChangePw, setShowChangePw, curPw, setCurPw, newPw, setNewPw, confirmPw, setConfirmPw,
    showCur, setShowCur, showNew, setShowNew, pwErr, pwMsg, pwLoading, changePassword } = useMyProfile(session, onProfileUpdated)
  const fileRef = useRef()

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

// ── Member Detail Pane (right side of two-pane layout) ───────────────────────
function MemberDetailPane({ user, permissions, session, onUpdate, showToast }) {
  const [localTabs, setLocalTabs] = useState(permissions)
  const [saving, setSaving] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRole, setConfirmRole] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { setLocalTabs(permissions) }, [user.user_id, user.is_admin]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only when another member (or role) is shown

  // Tabs are saved by the admin API in one step. For an admin, saving makes them a member with the
  // tabs picked here (Make member).
  async function savePermissions() {
    setSaving(true)
    const result = await adminCall(user.is_admin ? 'demote_user' : 'set_permissions', session, { user_id: user.user_id, tabs: [...localTabs] })
    setSaving(false); setConfirmRole(false)
    if (result.error) { showToast(`Not saved: ${result.error}`); return }
    onUpdate()
    showToast(user.is_admin ? `${user.name} is now a member` : 'Permissions saved')
  }

  // Frido Pulse for an admin is saved straight away (admins have no other tab rows to save).
  async function setAdminPulse(next) {
    const on = next.includes('ask')
    setSaving(true)
    const result = await adminCall('set_pulse', session, { user_id: user.user_id, on })
    setSaving(false)
    if (result.error) { showToast(`Not saved: ${result.error}`); return }
    setLocalTabs(prev => on ? [...new Set([...prev, 'ask'])] : prev.filter(k => k !== 'ask'))
    onUpdate()
    showToast(on ? `${user.name} can now use Frido Pulse` : `Frido Pulse removed for ${user.name}`)
  }

  async function promoteUser() {
    setSaving(true)
    const result = await adminCall('promote_user', session, { user_id: user.user_id })
    setSaving(false); setConfirmRole(false)
    if (result.error) { showToast(`Not changed: ${result.error}`); return }
    onUpdate()
    showToast(`${user.name} is now an admin`)
  }

  async function revokeUser() {
    setRevoking(true)
    const result = await adminCall(user.is_active ? 'revoke_user' : 'restore_user', session, { user_id: user.user_id })
    setRevoking(false); setConfirmRevoke(false)
    if (result.error) { showToast(`Not changed: ${result.error}`); return }
    onUpdate()
    showToast(user.is_active ? `${user.name} revoked` : `${user.name} restored`)
  }

  async function deleteUser() {
    setDeleting(true)
    const result = await adminCall('delete_user', session, { user_id: user.user_id })
    setDeleting(false); setConfirmDelete(false)
    if (result.error) { showToast(`Not deleted: ${result.error}`); return }
    onUpdate()
    showToast(`${user.name} deleted`)
  }

  const tabsChanged = JSON.stringify([...localTabs].sort()) !== JSON.stringify([...permissions].sort())

  return (
    <div style={{ minWidth: 0, paddingLeft: 20 }}>
      {/* Member header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Avatar url={user.avatar_url} name={user.name} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1E2321', marginBottom: 3 }}>{user.name}</div>
            <div style={{ fontSize: 12.5, color: '#4B534F', marginBottom: 4 }}>{user.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <StatusPill active={user.is_active} />
              {user.is_admin && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 100, background: '#F7F5EF', color: '#4B534F', border: '1px solid #E7E3D8' }}>Admin</span>
              )}
              <span style={{ fontSize: 11.5, color: '#9BA5A1' }}>Last login: {fmtDate(user.last_login_at)}</span>
            </div>
          </div>
        </div>
        {/* Action links */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          <button style={S.textBtn} onClick={() => setShowActivity(true)}>Activity</button>
          <button style={S.textBtn} onClick={() => setShowReset(true)}>Reset pw</button>
          {!user.is_admin && user.is_active && <button style={S.textBtn} onClick={() => setConfirmRole(true)}>Make admin</button>}
          {user.is_active
            ? <button style={{ ...S.textBtn, color: '#B4472B' }} onClick={() => setConfirmRevoke(true)}>Revoke</button>
            : <button style={{ ...S.textBtn, color: '#3E6B4F' }} onClick={() => setConfirmRevoke(true)}>Restore</button>
          }
          <button style={{ ...S.textBtn, color: '#B4472B' }} onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E7E3D8', marginBottom: 14 }} />

      {/* Permission panel */}
      <>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9BA5A1', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
          {user.is_admin ? 'Admin — sees every tab. To make them a member, pick the tabs they keep, then Make member' : 'Click chips to grant or remove access'}
        </div>
        {user.is_admin && !PULSE_WHITELIST.includes((user.email || '').toLowerCase()) && (
          <div style={{ marginBottom: 8 }}>
            <AdminPulseCard callerEmail={session?.user?.email} tabs={localTabs} setTabs={upd => { if (!saving) setAdminPulse(upd(localTabs)) }} />
          </div>
        )}
        <PermissionPanel tabs={localTabs} setTabs={setLocalTabs} callerEmail={session?.user?.email} hidePulse={user.is_admin} />
        {(user.is_admin || tabsChanged) && (
          <button style={{ ...(user.is_admin ? S.outlineBtn : S.primaryBtn), fontSize: 12.5, padding: '8px 16px', marginTop: 14, opacity: saving ? 0.7 : 1 }} onClick={() => (user.is_admin ? setConfirmRole(true) : savePermissions())} disabled={saving}>
            {saving ? 'Saving…' : user.is_admin ? `Make member (${localTabs.length} tab${localTabs.length === 1 ? '' : 's'})` : 'Save permissions'}
          </button>
        )}
      </>

      {showReset && (
        <ResetPasswordModal session={session} user={user} onClose={() => setShowReset(false)}
          onDone={() => showToast(`Password reset for ${user.name}`)} />
      )}
      {showActivity && <ActivityLog userId={user.user_id} onClose={() => setShowActivity(false)} />}
      {confirmRevoke && (
        <ConfirmDialog
          message={user.is_active
            ? `Revoke access for ${user.name}? They can't log in until you restore it.`
            : `Restore access for ${user.name}?`}
          confirmLabel={user.is_active ? 'Revoke' : 'Restore'}
          danger={user.is_active}
          onConfirm={revokeUser}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
      {confirmRole && (
        <ConfirmDialog
          message={user.is_admin
            ? `Make ${user.name} a member? They lose admin and keep only the ${localTabs.length} tab${localTabs.length === 1 ? '' : 's'} selected.`
            : `Make ${user.name} an admin? Admins see every tab and can manage the team.`}
          confirmLabel={user.is_admin ? 'Make member' : 'Make admin'}
          danger={false}
          onConfirm={user.is_admin ? savePermissions : promoteUser}
          onCancel={() => setConfirmRole(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete ${user.name}? This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteUser}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

// ── Team Members ──────────────────────────────────────────────────────────────
function TeamMembers({ session, showToast }) {
  const [users, setUsers] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

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

  // Auto-select first member on load
  useEffect(() => {
    if (!loading && users.length > 0 && !selectedId) {
      setSelectedId(users[0].user_id)
    }
  }, [loading, users])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  const selectedUser = users.find(u => u.user_id === selectedId)

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

      {loading ? (
        <div style={{ color: '#4B534F', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', alignItems: 'start' }}>
          {/* Left pane — member list: scrolls on its own and stays in view; the panel never sits under it */}
          <div style={{ position: 'sticky', top: 0, borderRight: '1px solid #E7E3D8', paddingRight: 16, maxHeight: 'calc(var(--app-h) - 220px)', overflowY: 'auto', boxSizing: 'border-box' }}>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9BA5A1', pointerEvents: 'none' }}>⌕</span>
              <input
                style={{ ...S.input, paddingLeft: 30, fontSize: 12.5, padding: '8px 10px 8px 30px', background: '#F7F5EF' }}
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {filtered.length === 0 ? (
              <div style={{ color: '#9BA5A1', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                {search ? `No match for "${search}"` : 'No team members yet.'}
              </div>
            ) : (
              filtered.map(u => {
                const isSelected = u.user_id === selectedId
                const tabCount = (permissions[u.user_id] || []).length
                return (
                  <div key={u.user_id} onClick={() => setSelectedId(u.user_id)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                      background: isSelected ? '#E4EFE6' : 'transparent',
                      borderLeft: isSelected ? '3px solid #3E6B4F' : '3px solid transparent',
                      transition: 'background .12s',
                      opacity: u.is_active ? 1 : 0.55,
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F7F5EF' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1E2321', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    <div style={{ fontSize: 11.5, color: '#9BA5A1', marginTop: 2 }}>
                      {u.is_admin ? `Admin · all tabs${(permissions[u.user_id] || []).includes('ask') ? ' + Pulse' : ''}` : `${tabCount} tab${tabCount !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Right pane — selected member detail */}
          {selectedUser ? (
            <MemberDetailPane
              key={selectedUser.user_id}
              user={selectedUser}
              permissions={permissions[selectedUser.user_id] || []}
              session={session}
              onUpdate={loadUsers}
              showToast={showToast}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9BA5A1', fontSize: 13, minHeight: 200 }}>
              Select a member to view details
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateUserModal session={session} onClose={() => setShowCreate(false)} onCreated={() => { loadUsers(); showToast('Member added') }} existingUsers={users} existingPermissions={permissions} />
      )}
    </div>
  )
}

// ── Main ProfilePage ──────────────────────────────────────────────────────────
// Below 1024px the phone layout (profile/ProfileMobile.jsx); the phone header's ⋯ (App.jsx Topnav)
// sends 'profile:menu' with 'theme' or 'signout'.
export default function ProfilePage({ session, profile, onSignOut, onProfileUpdated, theme, setTheme }) {
  const [toastEl, showToast] = useToast()
  const phone = useBreakpoint().width < 1024
  const [themeOpen, setThemeOpen] = useState(false)

  async function handleSignOut() {
    await supabase.from('login_activity').insert({ user_id: session.user.id, action: 'logout' })
    await supabase.auth.signOut()
    onSignOut()
  }
  const signOutRef = useRef(handleSignOut)
  useEffect(() => { signOutRef.current = handleSignOut })
  useEffect(() => {
    // The ⋯ sheet's own Back-history clean-up would close a sheet opened in the same moment, so the
    // Theme sheet opens once the menu sheet has gone.
    const onMenu = e => { if (e.detail === 'theme') setTimeout(() => setThemeOpen(true), 350); else if (e.detail === 'signout') signOutRef.current() }
    window.addEventListener('profile:menu', onMenu)
    return () => window.removeEventListener('profile:menu', onMenu)
  }, [])

  if (phone) {
    return <ProfileMobile session={session} profile={profile} onProfileUpdated={onProfileUpdated} theme={theme} setTheme={setTheme} themeOpen={themeOpen} setThemeOpen={setThemeOpen} />
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
        .profile-page-input:focus { outline: none; border-color: var(--acc) !important; box-shadow: 0 0 0 3px rgba(var(--acc-rgb),.15) !important; }
      `}</style>
    </div>
  )
}
