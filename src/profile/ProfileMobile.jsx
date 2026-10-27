import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase.js'
import { C } from '../utils.js'
import { THEMES, ENABLED_THEMES } from '../theme.js'
import BottomSheet from '../responsive/BottomSheet.jsx'
import UndoToast from '../responsive/UndoToast.jsx'
import MobilePageHeader from '../responsive/MobilePageHeader.jsx'
import { paletteMapCss } from '../responsive/paletteMapCss.js'
import Avatar from './Avatar.jsx'
import { CreateUserForm } from './CreateUser.jsx'
import { adminCall, fmtDate, useActivity, useMyProfile, accessSections, sectionKeys, allTabKeys } from './profileShared.js'

// Profile & Settings below 1024px (PROFILE_MOBILE_PROMPT.md, mockups/profile_mockup.html). Layout only:
// the same data, the same Supabase / /api/auth-admin calls and the same "who sees what" rule as the
// laptop page (Team members only for admins, i.e. Suraj). Screens:
//   Profile      Me card (avatar, name, email, role; edit and password sheets), My activity,
//                Team members row (admin) or a read-only "My access" card (everyone else)
//   Team list    full screen: search, All / Active / Revoked / No access, rows, + Add (sheet)
//   Member page  full screen: header card, access as collapsible sections (tap a chip = saved, with
//                "Saved · Undo"), Activity, Reset password, Revoke / Delete with a confirm sheet.
//                On your own page Revoke / Delete / Reset are hidden and your access isn't editable.
const M = C.m
const PAGE = 30

// The laptop form's colours (profileStyles.js), mapped to the mobile palette inside phone sheets.
const PROFILE_PHONE_CSS = paletteMapCss('.profile-phone', [
  ['#1E2321', M.ink, M.ink, M.ink], ['#F7F5EF', '#ffffff', M.soft, M.line], ['#E7E3D8', M.muted, M.line, M.line],
  ['#4B534F', M.muted, M.muted, M.g4], ['#3E6B4F', M.green, M.green, M.green], ['#B4472B', M.down, M.down, M.down],
  ['#9BA5A1', M.muted, M.g4, M.g4], ['#E4EFE6', M.green, 'rgba(31,90,61,.08)', 'rgba(31,90,61,.25)'], ['#F6E6E1', M.down, 'rgba(192,57,43,.08)', 'rgba(192,57,43,.25)'],
  ['#D5D0C4', M.muted, M.g4, M.g4], ['#4B7C5E', M.green, M.green, M.green], ['#E24B4A', M.down, M.down, M.down], ['#F0EDE6', M.ink, M.soft, M.line],
  ['#B8830A', M.amber, M.amber, M.amber], ['#4B534F', M.muted, M.soft, M.g4],
], { ink: M.ink })

const cardStyle = { background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow }
const inputStyle = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', fontSize: 16, fontFamily: 'var(--font)', color: M.ink, background: M.soft, border: `1px solid ${M.line}`, borderRadius: 10, outline: 'none' }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: M.muted, marginBottom: 6 }
const primaryBtn = { width: '100%', minHeight: 44, border: 'none', borderRadius: 12, background: M.green, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer' }
const outlineBtn = (color = M.ink, border = M.line) => ({ width: '100%', minHeight: 44, border: `1px solid ${border}`, borderRadius: 12, background: '#fff', color, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' })

function Chip({ children, tone = 'muted' }) {
  const tones = { green: ['rgba(31,90,61,.10)', M.green], red: ['rgba(192,57,43,.10)', M.down], muted: [M.soft, M.muted] }
  const [bg, fg] = tones[tone]
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>
}

function Row({ title, sub, onClick, last = false, className }) {
  return (
    <button type="button" onClick={onClick} className={className}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 14px', alignItems: 'center', gap: 8, width: '100%', minHeight: 56, padding: '8px 0', border: 'none', borderBottom: last ? 'none' : `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: M.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>›</span>
    </button>
  )
}

// A full-screen sub-page over the profile (‹ back + title), like FullScreenList: opening pushes a
// history entry, so the phone's Back closes it. depth: 1 = team list, 2 = member page.
function FullScreen({ title, onBack, right, depth = 1, children }) {
  const backRef = useRef(onBack)
  useEffect(() => { backRef.current = onBack })
  useEffect(() => {
    let popped = false
    window.history.pushState({ profileScreen: depth }, '')
    const onPop = () => { if ((window.history.state?.profileScreen || 0) >= depth) return; popped = true; backRef.current() }
    window.addEventListener('popstate', onPop)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
      if (!popped && window.history.state?.profileScreen === depth) window.history.back()
    }
  }, [depth])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="profile-screen ov-mobile"
      style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: M.bg, display: 'flex', flexDirection: 'column', paddingTop: 'var(--safe-top)', color: M.ink }}>
      <MobilePageHeader onBack={onBack} backLabel={depth > 1 ? 'Team members' : 'Profile'} title={title} right={right} />
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: `12px 12px calc(24px + var(--safe-bottom))`, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>,
    document.body,
  )
}

function ActivitySheet({ open, onClose, userId, name }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Login activity" subtitle={name}>
      {open && <ActivityList userId={userId} />}
    </BottomSheet>
  )
}
function ActivityList({ userId }) {
  const { loading, logs } = useActivity(userId)
  if (loading) return <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>Loading…</div>
  if (!logs.length) return <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No activity recorded yet.</div>
  return logs.map(log => (
    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: `1px solid ${M.line}`, fontSize: 13 }}>
      <b style={{ color: log.action === 'login' ? M.green : M.ink, fontWeight: 600 }}>{log.action === 'login' ? 'Logged in' : 'Logged out'}</b>
      <span style={{ color: M.muted }}>{fmtDate(log.created_at)}</span>
    </div>
  ))
}

// Team data: the same two queries as the laptop list (profiles + permissions); here your own row is
// included so it can be shown as "You · Admin".
async function fetchTeam() {
  const { data: profiles } = await supabase.from('user_profiles').select('*').order('invited_at', { ascending: false })
  const { data: rows } = await supabase.from('user_permissions').select('*')
  const perms = {}
  for (const p of rows || []) (perms[p.user_id] ||= []).push(p.tab)
  return { loading: false, users: profiles || [], perms }
}
function useTeam(session, enabled) {
  const [state, setState] = useState({ loading: true, users: [], perms: {} })
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetchTeam().then(st => { if (live) setState(st) })
    return () => { live = false }
  }, [enabled])
  const reload = async () => setState(await fetchTeam())
  return { ...state, reload, selfId: session.user.id }
}

export default function ProfileMobile({ session, profile, onProfileUpdated, theme, setTheme, themeOpen, setThemeOpen }) {
  const me = useMyProfile(session, onProfileUpdated)
  const isAdmin = !!profile?.is_admin
  const fileRef = useRef(null)
  const [editOpen, setEditOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [memberId, setMemberId] = useState(null)
  const [toast, setToast] = useState(null)
  const team = useTeam(session, isAdmin)
  const callerEmail = session?.user?.email
  const total = allTabKeys(callerEmail).length
  const people = team.users.length
  const active = team.users.filter(u => u.is_active).length

  const roleChip = <Chip tone={isAdmin ? 'green' : 'muted'}>{isAdmin ? 'Admin' : 'Team member'}</Chip>
  return (
    <div className="profile-phone ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 12px 24px', color: M.ink }}>
      <style>{PROFILE_PHONE_CSS}</style>
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change photo" disabled={me.uploading}
            style={{ position: 'relative', padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%' }}>
            <Avatar url={me.avatarUrl} name={me.name || profile?.name} size={64} />
            <span aria-hidden="true" style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.15)', display: 'grid', placeItems: 'center', fontSize: 12, color: M.green }}>✎</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => me.uploadAvatar(e.target.files[0])} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, overflowWrap: 'anywhere' }}>{me.name || profile?.name || '—'}</div>
            <div style={{ fontSize: 13, color: M.muted, overflowWrap: 'anywhere' }}>{session.user.email}</div>
            <div style={{ marginTop: 6 }}>{roleChip}{me.uploading && <span style={{ fontSize: 12, color: M.muted, marginLeft: 8 }}>Uploading photo…</span>}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Row title="Edit name & photo" sub={me.name || profile?.name} onClick={() => setEditOpen(true)} />
          <Row title="Password" sub={me.pwMsg || 'Change your password'} onClick={() => me.setShowChangePw(true)} last />
        </div>
      </section>

      {isAdmin && (
        <section style={{ ...cardStyle, paddingTop: 4, paddingBottom: 4 }}>
          <Row title="Team members" sub={team.loading ? 'Loading…' : `${people} people · ${active} active · ${people - active} revoked`} onClick={() => setTeamOpen(true)} last />
        </section>
      )}
      <section style={{ ...cardStyle, paddingTop: 4, paddingBottom: 4 }}>
        <Row title="My activity" sub={profile?.last_login_at ? `Last login ${fmtDate(profile.last_login_at)}` : 'Your logins'} onClick={() => setActivityOpen(true)} last />
      </section>
      {!isAdmin && <MyAccess session={session} />}

      {/* Edit name & photo */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit name & photo">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar url={me.avatarUrl} name={me.name} size={48} />
            <button type="button" onClick={() => fileRef.current?.click()} style={{ ...outlineBtn(), width: 'auto', padding: '0 14px' }} disabled={me.uploading}>{me.uploading ? 'Uploading…' : 'Change photo'}</button>
          </div>
          <label><span style={labelStyle}>Full name</span><input style={inputStyle} value={me.name} onChange={e => me.setName(e.target.value)} autoComplete="name" /></label>
          <label><span style={labelStyle}>Email</span><input style={{ ...inputStyle, color: M.muted }} value={session.user.email} disabled /></label>
          <button type="button" style={{ ...primaryBtn, opacity: me.saving ? 0.7 : 1 }} disabled={me.saving}
            onClick={async () => { await me.saveProfile(); setEditOpen(false); setToast({ text: 'Saved' }) }}>{me.saving ? 'Saving…' : 'Save'}</button>
        </div>
      </BottomSheet>

      {/* Password (the same check-current-then-update calls as the laptop) */}
      <BottomSheet open={me.showChangePw} onClose={() => me.setShowChangePw(false)} title="Password">
        <form onSubmit={me.changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {me.pwErr && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: M.down }}>{me.pwErr}</div>}
          <label><span style={labelStyle}>Current password</span><input style={inputStyle} type={me.showCur ? 'text' : 'password'} value={me.curPw} onChange={e => me.setCurPw(e.target.value)} autoComplete="current-password" /></label>
          <label><span style={labelStyle}>New password</span><input style={inputStyle} type={me.showNew ? 'text' : 'password'} value={me.newPw} onChange={e => me.setNewPw(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" /></label>
          <label><span style={labelStyle}>Confirm new password</span><input style={inputStyle} type={me.showNew ? 'text' : 'password'} value={me.confirmPw} onChange={e => me.setConfirmPw(e.target.value)} autoComplete="new-password" /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: M.muted }}>
            <input type="checkbox" checked={me.showNew} onChange={e => { me.setShowNew(e.target.checked); me.setShowCur(e.target.checked) }} /> Show passwords
          </label>
          <button type="submit" style={{ ...primaryBtn, opacity: me.pwLoading ? 0.7 : 1 }} disabled={me.pwLoading}>{me.pwLoading ? 'Updating…' : 'Update password'}</button>
        </form>
      </BottomSheet>

      <ActivitySheet open={activityOpen} onClose={() => setActivityOpen(false)} userId={session.user.id} name={me.name} />

      {/* Theme (header ⋯ → Theme) */}
      <BottomSheet open={!!themeOpen} onClose={() => setThemeOpen(false)} title="Theme">
        {THEMES.map(t => {
          const enabled = ENABLED_THEMES.includes(t.id)
          const on = theme === t.id
          return (
            <button key={t.id} type="button" disabled={!enabled} onClick={() => { setTheme(t.id); setThemeOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '0 2px', border: 'none', borderTop: `1px solid ${M.line}`, background: 'none', fontFamily: 'var(--font)', textAlign: 'left', cursor: enabled ? 'pointer' : 'default', color: enabled ? M.ink : M.muted }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: on ? 700 : 500 }}>{t.label}</span>
              <span style={{ fontSize: 12, color: M.muted }}>{on ? '✓ In use' : enabled ? '' : 'Coming soon'}</span>
            </button>
          )
        })}
      </BottomSheet>

      {isAdmin && teamOpen && (
        <TeamScreen team={team} total={total} session={session} onClose={() => setTeamOpen(false)} onOpen={setMemberId} setToast={setToast} />
      )}
      {isAdmin && teamOpen && memberId && team.users.find(u => u.user_id === memberId) && (
        <MemberScreen key={memberId} user={team.users.find(u => u.user_id === memberId)} perms={team.perms[memberId] || []} isSelf={memberId === team.selfId}
          session={session} callerEmail={callerEmail} onBack={() => setMemberId(null)} onChanged={team.reload} setToast={setToast} />
      )}
      <UndoToast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}

// Everyone else: the tabs they can open (the same permission rows the app reads), read-only.
function MyAccess({ session }) {
  const [tabs, setTabs] = useState(null)
  useEffect(() => {
    supabase.from('user_permissions').select('tab').eq('user_id', session.user.id)
      .then(({ data }) => setTabs((data || []).map(r => r.tab)))
  }, [session.user.id])
  const sections = accessSections(session.user.email)
  const granted = tabs ? sections.map(sec => ({ sec, leaves: sec.groups.flatMap(g => g.leaves).filter(l => tabs.includes(l.key)) })).filter(x => x.leaves.length) : []
  return (
    <section style={cardStyle} aria-label="My access">
      <h2 style={{ margin: 0, fontSize: M.type.cardTitle, fontWeight: 700 }}>My access</h2>
      <div style={{ fontSize: 12, color: M.muted, margin: '2px 0 8px' }}>{tabs ? `${tabs.length} tab${tabs.length === 1 ? '' : 's'}` : 'Loading…'}</div>
      {granted.map(({ sec, leaves }) => (
        <div key={sec.key} style={{ padding: '8px 0', borderTop: `1px solid ${M.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{sec.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{leaves.map(l => <Chip key={l.key} tone="green">✓ {l.label}</Chip>)}</div>
        </div>
      ))}
      {tabs && !granted.length && <div style={{ fontSize: 13, color: M.muted, padding: '6px 0' }}>No tabs yet.</div>}
      <div style={{ fontSize: 13, color: M.muted, marginTop: 8 }}>Need another tab? Ask Suraj (admin).</div>
    </section>
  )
}

function TeamScreen({ team, total, session, onClose, onOpen, setToast }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [shown, setShown] = useState(PAGE)
  const [addOpen, setAddOpen] = useState(false)
  const tabsOf = u => (team.perms[u.user_id] || []).length
  const noAccess = u => u.is_active && !u.is_admin && tabsOf(u) === 0
  const counts = { all: team.users.length, active: team.users.filter(u => u.is_active).length, revoked: team.users.filter(u => !u.is_active).length, none: team.users.filter(noAccess).length }
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return team.users
      .filter(u => filter === 'all' || (filter === 'active' ? u.is_active : filter === 'revoked' ? !u.is_active : noAccess(u)))
      .filter(u => !needle || u.name?.toLowerCase().includes(needle) || u.email?.toLowerCase().includes(needle))
      .sort((a, b) => (a.user_id === team.selfId ? -1 : b.user_id === team.selfId ? 1 : 0))
  }, [team.users, team.perms, filter, q]) // eslint-disable-line react-hooks/exhaustive-deps -- noAccess reads team.perms
  const chip = (id, label) => (
    <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setShown(PAGE) }}
      style={{ flex: '0 0 auto', minHeight: 32, padding: '0 11px', borderRadius: 999, border: `1px solid ${filter === id ? M.green : M.line}`, background: filter === id ? M.green : '#fff', color: filter === id ? '#fff' : M.ink, fontSize: 12.5, fontWeight: filter === id ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label} {counts[id]}</button>
  )
  return (
    <FullScreen title="Team members" onBack={onClose} depth={1}
      right={<button type="button" onClick={() => setAddOpen(true)} style={{ minHeight: 34, padding: '0 10px', borderRadius: 10, border: 'none', background: M.hdr.pill, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>+ Add</button>}>
      <input type="search" value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }} placeholder="Search name or email…" aria-label="Search team members" style={inputStyle} />
      <div role="group" aria-label="Filter" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {chip('all', 'All')}{chip('active', 'Active')}{chip('revoked', 'Revoked')}{chip('none', 'No access')}
      </div>
      <section style={{ ...cardStyle, padding: '4px 14px' }}>
        {team.loading && <div style={{ padding: 16, fontSize: 13, color: M.muted }}>Loading…</div>}
        {!team.loading && !list.length && <div style={{ padding: 16, fontSize: 13, color: M.muted, textAlign: 'center' }}>No one matches.</div>}
        {list.slice(0, shown).map((u, i, arr) => {
          const self = u.user_id === team.selfId
          const meta = self ? 'You · Admin' : u.is_admin ? 'Admin · all tabs' : `${tabsOf(u)} of ${total} tabs`
          return (
            <button key={u.user_id} type="button" className="profile-team-row" onClick={() => onOpen(u.user_id)}
              style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto 14px', alignItems: 'center', gap: 10, width: '100%', minHeight: 60, padding: '8px 0', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${M.line}` : 'none', background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
              <Avatar url={u.avatar_url} name={u.name} size={40} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name || u.email}</span>
                <span style={{ display: 'block', fontSize: 12, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta} · {u.last_login_at ? fmtDate(u.last_login_at) : 'never logged in'}</span>
              </span>
              <span>{!u.is_active && <Chip tone="red">Revoked</Chip>}</span>
              <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>›</span>
            </button>
          )
        })}
        {list.length > shown && (
          <button type="button" onClick={() => setShown(s => s + PAGE)} style={{ ...outlineBtn(M.green), margin: '10px 0' }}>Load {Math.min(PAGE, list.length - shown)} more · {shown} of {list.length}</button>
        )}
      </section>
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add team member">
        {addOpen && (
          <div className="profile-phone">
            <style>{PROFILE_PHONE_CSS}</style>
            <CreateUserForm session={session} existingUsers={team.users.filter(u => u.user_id !== team.selfId)} existingPermissions={team.perms}
              onCancel={() => setAddOpen(false)}
              onCreated={async id => { setAddOpen(false); await team.reload(); setToast({ text: 'Member added' }); if (id) onOpen(id) }} />
          </div>
        )}
      </BottomSheet>
    </FullScreen>
  )
}

function MemberScreen({ user, perms, isSelf, session, callerEmail, onBack, onChanged, setToast }) {
  const [tabs, setTabs] = useState(perms)
  const [openSec, setOpenSec] = useState(null)
  const [sheet, setSheet] = useState(null) // 'activity' | 'reset' | 'revoke' | 'delete' | 'role'
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ a: '', b: '', err: '' })
  const queue = useRef(Promise.resolve())
  const sections = accessSections(callerEmail)
  const readOnly = isSelf || user.is_admin

  // Saved by the admin API in one step, as on the laptop. Saves run one after another; a failed save
  // puts the chips back and offers Retry.
  const save = list => (queue.current = queue.current.then(async () => {
    const result = await adminCall('set_permissions', session, { user_id: user.user_id, tabs: list })
    return result.error || null
  }))
  const apply = async (next, prev, label = 'Saved') => {
    setTabs(next)
    const err = await save(next)
    if (err) {
      setTabs(prev)
      setToast({ text: `Couldn't save: ${err}`, actionLabel: 'Retry', undo: () => apply(next, prev, label) })
      return
    }
    onChanged()
    setToast({ text: label, undo: () => apply(prev, next, 'Undone') })
  }
  const toggle = keys => {
    const prev = tabs
    const allOn = keys.every(k => prev.includes(k))
    const next = allOn ? prev.filter(k => !keys.includes(k)) : [...new Set([...prev, ...keys])]
    apply(next, prev)
  }

  // Revoke / restore / delete / make member / make admin. A refused or failed change keeps the sheet
  // open with the reason (e.g. the last admin) instead of a success toast.
  const [actErr, setActErr] = useState('')
  const act = async action => {
    setBusy(true); setActErr('')
    const result = await adminCall(action, session, { user_id: user.user_id, ...(action === 'demote_user' ? { tabs: [] } : {}) })
    setBusy(false)
    if (result.error) { setActErr(result.error); return }
    setSheet(null)
    if (action === 'demote_user') setTabs(result.tabs || [])
    await onChanged()
    const done = { delete_user: 'deleted', revoke_user: 'revoked', restore_user: 'restored', demote_user: 'is now a member · pick their tabs', promote_user: 'is now an admin' }[action]
    setToast({ text: `${user.name} ${done}` })
    if (action === 'delete_user') onBack()
  }
  const openSheet = s => { setActErr(''); setSheet(s) }
  const errLine = actErr && <div role="alert" style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: M.down }}>{actErr}</div>
  const resetPw = async e => {
    e.preventDefault()
    if (pw.a.length < 8) return setPw(p => ({ ...p, err: 'Password must be at least 8 characters.' }))
    if (pw.a !== pw.b) return setPw(p => ({ ...p, err: 'Passwords do not match.' }))
    setBusy(true)
    const result = await adminCall('reset_password', session, { user_id: user.user_id, new_password: pw.a })
    setBusy(false)
    if (result.error) return setPw(p => ({ ...p, err: result.error }))
    setSheet(null); setPw({ a: '', b: '', err: '' }); setToast({ text: `Password reset for ${user.name}` })
  }

  const chip = (leaf, on) => (
    <button key={leaf.key} type="button" aria-pressed={on} disabled={readOnly} onClick={() => toggle([leaf.key])}
      style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: readOnly ? 'default' : 'pointer',
        border: `1px solid ${on ? 'rgba(31,90,61,.35)' : M.g4}`, background: on ? 'rgba(31,90,61,.10)' : '#fff', color: on ? M.green : M.muted,
        boxShadow: on ? '0 0 8px 0 rgba(31,90,61,.18)' : 'none' }}>{on ? '✓ ' : ''}{leaf.label}</button>
  )

  return (
    <FullScreen title={user.name || user.email} onBack={onBack} depth={2}>
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar url={user.avatar_url} name={user.name} size={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{user.name}</div>
            <div style={{ fontSize: 13, color: M.muted, overflowWrap: 'anywhere' }}>{user.email}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Chip tone={user.is_active ? 'green' : 'red'}>{user.is_active ? 'Active' : 'Revoked'}</Chip>
              {user.is_admin && <Chip>Admin</Chip>}{isSelf && <Chip>You</Chip>}
              <span style={{ fontSize: 12, color: M.muted }}>Last login {fmtDate(user.last_login_at)}</span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: '4px 16px' }} aria-label="Access">
        {readOnly ? (
          <div style={{ padding: '12px 0', fontSize: 13, color: M.muted }}>
            <b style={{ display: 'block', color: M.ink, fontSize: 14, marginBottom: 2 }}>Admin · all tabs</b>
            {isSelf ? 'Your own access and admin role can’t be changed here.' : 'Admins see every tab. Make them a member to choose their tabs.'}
            {!isSelf && <button type="button" onClick={() => openSheet('role')} style={{ ...outlineBtn(M.green), marginTop: 10 }}>Make member</button>}
          </div>
        ) : sections.map((sec, si) => {
          const keys = sectionKeys(sec)
          const n = keys.filter(k => tabs.includes(k)).length
          const open = openSec === sec.key
          return (
            <div key={sec.key} style={{ borderBottom: si < sections.length - 1 ? `1px solid ${M.line}` : 'none' }}>
              <button type="button" aria-expanded={open} onClick={() => setOpenSec(open ? null : sec.key)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto 14px', alignItems: 'center', gap: 8, width: '100%', minHeight: 52, padding: '6px 0', border: 'none', background: 'transparent', fontFamily: 'var(--font)', textAlign: 'left', color: M.ink, cursor: 'pointer' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{sec.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: n ? M.green : M.muted, fontVariantNumeric: 'tabular-nums' }}>{n} of {keys.length}</span>
                <span aria-hidden="true" style={{ color: M.muted, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
              </button>
              {open && (
                <div style={{ paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sec.groups.map(g => {
                    const gk = [...new Set(g.leaves.map(l => l.key))]
                    const all = gk.every(k => tabs.includes(k))
                    return (
                      <div key={g.key}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: M.muted }}>{g.label || sec.label}</span>
                          {gk.length > 1 && <button type="button" onClick={() => toggle(gk)} style={{ border: 'none', background: 'none', padding: '4px 0', color: M.green, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{all ? 'Clear' : 'Select all'}</button>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{g.leaves.map(l => chip(l, tabs.includes(l.key)))}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section style={{ ...cardStyle, padding: '4px 16px' }}>
        <Row title="Activity" sub="Logins and logouts" onClick={() => setSheet('activity')} last={isSelf} />
        {!isSelf && <Row title="Reset password" sub="Set a new password for them" onClick={() => setSheet('reset')} last={user.is_admin || !user.is_active} />}
        {!isSelf && !user.is_admin && user.is_active && <Row title="Make admin" sub="Sees every tab and can manage the team" onClick={() => openSheet('role')} last />}
      </section>
      {!isSelf && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" onClick={() => openSheet('revoke')} style={outlineBtn(M.ink, M.g4)}>{user.is_active ? 'Revoke access' : 'Restore access'}</button>
          <button type="button" onClick={() => openSheet('delete')} style={outlineBtn(M.down, 'rgba(192,57,43,.45)')}>Delete member</button>
        </div>
      )}

      <ActivitySheet open={sheet === 'activity'} onClose={() => setSheet(null)} userId={user.user_id} name={user.name} />
      <BottomSheet open={sheet === 'reset'} onClose={() => setSheet(null)} title="Reset password" subtitle={user.name}>
        <form onSubmit={resetPw} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pw.err && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: M.down }}>{pw.err}</div>}
          <label><span style={labelStyle}>New password</span><input style={inputStyle} type="password" value={pw.a} onChange={e => setPw(p => ({ ...p, a: e.target.value }))} placeholder="Min 8 characters" autoComplete="new-password" /></label>
          <label><span style={labelStyle}>Confirm password</span><input style={inputStyle} type="password" value={pw.b} onChange={e => setPw(p => ({ ...p, b: e.target.value }))} autoComplete="new-password" /></label>
          <div style={{ fontSize: 12, color: M.muted }}>Share the new password with {user.name} via Teams or email.</div>
          <button type="submit" style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
        </form>
      </BottomSheet>
      <BottomSheet open={sheet === 'revoke'} onClose={() => setSheet(null)} title={user.is_active ? 'Revoke access' : 'Restore access'}>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: M.ink }}>{user.is_active ? `Revoke access for ${user.name}? They can't log in until you restore it.` : `Restore access for ${user.name}?`}</p>
        {errLine}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setSheet(null)} style={outlineBtn()}>Cancel</button>
          <button type="button" onClick={() => act(user.is_active ? 'revoke_user' : 'restore_user')} disabled={busy} style={user.is_active ? { ...primaryBtn, background: M.down } : primaryBtn}>{busy ? '…' : user.is_active ? 'Revoke' : 'Restore'}</button>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Delete member">
        <p style={{ margin: '0 0 14px', fontSize: 14, color: M.ink }}>{`Delete ${user.name}? This can't be undone.`}</p>
        {errLine}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setSheet(null)} style={outlineBtn()}>Cancel</button>
          <button type="button" onClick={() => act('delete_user')} disabled={busy} style={{ ...primaryBtn, background: M.down }}>{busy ? '…' : 'Delete'}</button>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'role'} onClose={() => setSheet(null)} title={user.is_admin ? 'Make member' : 'Make admin'}>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: M.ink }}>{user.is_admin
          ? `Make ${user.name} a member? They lose admin and start with no tabs; pick their tabs on this screen right after.`
          : `Make ${user.name} an admin? Admins see every tab and can manage the team.`}</p>
        {errLine}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setSheet(null)} style={outlineBtn()}>Cancel</button>
          <button type="button" onClick={() => act(user.is_admin ? 'demote_user' : 'promote_user')} disabled={busy} style={primaryBtn}>{busy ? '…' : user.is_admin ? 'Make member' : 'Make admin'}</button>
        </div>
      </BottomSheet>
    </FullScreen>
  )
}
