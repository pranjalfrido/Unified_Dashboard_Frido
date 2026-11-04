import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DotsNine, MagnifyingGlass, Check, ChatCircleDots } from '@phosphor-icons/react'
import { C } from '../utils.js'
import { THEMES, ENABLED_THEMES } from '../theme.js'
import BottomSheet from './BottomSheet.jsx'
import { LiveCount } from './LiveUsers.jsx'
import { DEFAULT_DOCK, DOCK_MAX, DOCK_MIN, loadDock, saveDock, loadRecent, pushRecent, searchPages } from './navConfig.js'
import { useNavStats } from './navStats.js'

// Phone navigation (NAV_MOBILE_PROMPT.md, mockups/nav_mockup.html): a standard full-width bottom bar
// of icons (no labels) plus "All pages", which opens the launcher sheet.
//   pages    every page this user may open: [{ id, label, group, desc, Icon }] (the caller applies the
//            same access rules as the laptop sidebar, so nothing else can appear anywhere here)
//   active   current page id · onSelect(id) navigates · userId keys the saved dock / Recent
//   profile  { name, avatar_url } · isAdmin · onProfile() · theme / setTheme · onSignOut()
// Root cause of "the bar vanishes while scrolling": it sat at z-index 50 inside the app, under the
// page's loading veil (.load-veil, z 300, blurred over the whole content area including the bar's
// strip) and other raised layers. It's now portalled to <body> above page layers and below sheets /
// full-screen views (z 450), position: fixed, on every page.
const M = C.m
const Z_BAR = 450
const GROUPS = [['main', 'Main'], ['analytics', 'Analytics'], ['workspace', 'Workspace'], ['tools', 'Tools']]

function DockSlot({ on, onClick, Icon, label }) {
  const [tip, setTip] = useState(false)
  const timer = useRef(null)
  // Long-press shows the page name (the bar has icons only).
  const press = () => { timer.current = setTimeout(() => setTip(true), 500) }
  const release = () => { clearTimeout(timer.current); setTimeout(() => setTip(false), 900) }
  return (
    <button type="button" className="mnav-slot" aria-label={label} aria-current={on ? 'page' : undefined} onClick={onClick}
      onPointerDown={press} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={e => e.preventDefault()}
      style={{ position: 'relative', flex: '1 1 0', minWidth: 44, height: '100%', padding: 2, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', color: on ? M.green : M.nav.icon }}>
      <span aria-hidden="true" className={`mnav-glow${on ? ' on' : ''}`} />
      <span aria-hidden="true" style={{ position: 'relative', display: 'grid', placeItems: 'center' }}><Icon size={20} weight={on ? 'bold' : 'regular'} /></span>
      {tip && <span role="tooltip" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, padding: '4px 8px', borderRadius: 8, background: M.ink, color: '#fff', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{label}</span>}
    </button>
  )
}

function IconTile({ Icon, on }) {
  return <span aria-hidden="true" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', background: on ? '#fff' : M.glowTile, color: M.green }}><Icon size={18} /></span>
}

export default function MobileBottomNav({ pages, active, onSelect, userId, profile, isAdmin, onProfile, theme, setTheme, onSignOut, onFeedback }) {
  const stats = useNavStats()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('pages') // 'pages' | 'edit' | 'theme'
  const [q, setQ] = useState('')
  const allowed = useMemo(() => new Set(pages.map(p => p.id)), [pages])
  const byId = useMemo(() => Object.fromEntries(pages.map(p => [p.id, p])), [pages])
  const defaultDock = () => { const d = DEFAULT_DOCK.filter(id => allowed.has(id)); return d.length ? d : pages.slice(0, DOCK_MAX).map(p => p.id) }
  const [dock, setDock] = useState(() => loadDock(userId) || DEFAULT_DOCK)
  const [draft, setDraft] = useState(null)
  // A saved page the user can no longer open drops out silently; fewer pages = a shorter bar.
  const dockPages = dock.filter(id => allowed.has(id)).map(id => byId[id])
  const shownDock = dockPages.length ? dockPages : defaultDock().map(id => byId[id])

  // Recent: the last 4 pages opened (this user, this device).
  useEffect(() => { if (active && allowed.has(active)) pushRecent(userId, active) }, [active, userId]) // eslint-disable-line react-hooks/exhaustive-deps -- record each visit once
  const recent = open ? loadRecent(userId) : []
  const close = () => { setOpen(false); setMode('pages'); setQ(''); setDraft(null) }
  const go = id => { close(); onSelect(id) }
  const launcherPage = !shownDock.some(p => p.id === active) && byId[active] ? byId[active] : null

  const row = (p, { right, on, onClick, check } = {}) => (
    <button key={p.id} type="button" onClick={onClick || (() => go(p.id))} aria-current={on ? 'page' : undefined} className="mnav-row"
      style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '6px 8px 6px 9px', border: 'none',
        borderLeft: `3px solid ${on ? M.green : 'transparent'}`, borderRadius: 10, background: on ? M.glowTile : 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <IconTile Icon={p.Icon} on={on} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{p.label}</span>
        <span style={{ display: 'block', fontSize: 12, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.desc}</span>
      </span>
      {check != null
        ? <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', border: `1.5px solid ${check ? M.green : M.g4}`, background: check ? M.green : '#fff', color: '#fff' }}>{check && <Check size={14} weight="bold" />}</span>
        : right}
    </button>
  )
  // Live number: only what a page has already computed and posted (navStats); otherwise ›.
  const statOf = id => (stats[id]
    ? <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><b style={{ display: 'block', fontSize: 13 }}>{stats[id].value}</b><span style={{ fontSize: 12, color: M.muted }}>{stats[id].label}</span></span>
    : <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>›</span>)
  const groupLabel = t => <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: M.muted, margin: '12px 0 4px 2px' }}>{t}</div>

  const results = searchPages(q, pages)
  const launcherGroups = [
    ['Analytics', pages.filter(p => p.group === 'analytics' || (p.group === 'main' && !shownDock.some(d => d.id === p.id)))],
    ['Workspace', pages.filter(p => p.group === 'workspace')],
    ['Tools', pages.filter(p => p.group === 'tools')],
  ].filter(([, list]) => list.length)

  const draftIds = draft || shownDock.map(p => p.id)
  const toggleDraft = id => setDraft(d => {
    const cur = d || shownDock.map(p => p.id)
    if (cur.includes(id)) return cur.length > DOCK_MIN ? cur.filter(x => x !== id) : cur
    return cur.length < DOCK_MAX ? [...cur, id] : cur
  })

  const bar = (
    <nav className="mnav bottom-nav" aria-label="Main"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: Z_BAR, height: 'calc(var(--bot) + var(--safe-bottom))', padding: '0 var(--safe-right) var(--safe-bottom) var(--safe-left)',
        background: M.nav.bg, boxShadow: M.nav.shadow }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: 'var(--bot)' }}>
        {shownDock.map(p => <DockSlot key={p.id} label={p.label} Icon={p.Icon} on={p.id === active} onClick={() => onSelect(p.id)} />)}
        <DockSlot label={launcherPage ? `${launcherPage.label} (All pages)` : 'All pages'} Icon={launcherPage ? launcherPage.Icon : DotsNine} on={!!launcherPage} onClick={() => setOpen(true)} />
      </div>
    </nav>
  )

  return (
    <>
      {createPortal(bar, document.body)}
      <BottomSheet open={open} onClose={close} title={mode === 'edit' ? 'Edit bar' : mode === 'theme' ? 'Theme' : 'All pages'}
        subtitle={mode === 'edit' ? `Pick ${DOCK_MIN}–${DOCK_MAX} pages · All pages stays last · ${draftIds.length} picked` : undefined}>
        <div className="mnav-sheet">
          {mode === 'pages' && <>
            <button type="button" onClick={() => { close(); onProfile() }} className="mnav-row"
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '4px 2px', border: 'none', background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', background: 'rgba(31,90,61,.12)', color: M.green, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (profile?.name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 14 }}>{profile?.name || 'You'}</b>
                <span style={{ display: 'block', fontSize: 12, color: M.muted }}>{isAdmin ? <>Admin · Profile & team access<LiveCount isAdmin={isAdmin} prefix /></> : 'Profile'}</span>
              </span>
              <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>›</span>
            </button>
            <label style={{ position: 'relative', display: 'block', marginTop: 8 }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: 13, color: M.muted, display: 'flex' }}><MagnifyingGlass size={18} /></span>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search pages… try 'rto' or 'roas'" aria-label="Search pages"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px 10px 38px', fontSize: 16, fontFamily: 'var(--font)', color: M.ink, background: M.soft, border: `1px solid ${M.line}`, borderRadius: 12, outline: 'none' }} />
            </label>
            {q.trim() ? (
              <div style={{ marginTop: 8 }} className="mnav-results">
                {results.length ? results.map(p => row(p, { on: p.id === active, right: statOf(p.id) })) : <div style={{ fontSize: 13, color: M.muted, padding: '12px 4px' }}>No page matches “{q}”.</div>}
              </div>
            ) : <>
              {recent.filter(id => allowed.has(id)).length > 0 && <>
                {groupLabel('Recent')}
                <div className="mnav-recent" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {recent.filter(id => allowed.has(id)).map(id => (
                    <button key={id} type="button" onClick={() => go(id)}
                      style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: `1px solid ${id === active ? M.green : M.line}`, background: id === active ? M.glowTile : '#fff', color: M.ink, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{byId[id].label}</button>
                  ))}
                </div>
              </>}
              {launcherGroups.map(([title, list]) => (
                <div key={title}>{groupLabel(title)}{list.map(p => row(p, { on: p.id === active, right: statOf(p.id) }))}</div>
              ))}
            </>}
            {onFeedback && !q.trim() && (
              <button type="button" onClick={() => { close(); onFeedback() }} className="mnav-row" data-testid="launcher-send-feedback"
                style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, marginTop: 12, padding: '6px 8px 6px 9px', border: `1px dashed ${M.g4}`, borderRadius: 10, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
                <IconTile Icon={ChatCircleDots} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Send feedback</span>
                  <span style={{ display: 'block', fontSize: 12, color: M.muted }}>Report a bug, a wrong number or an idea</span>
                </span>
                <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>›</span>
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14, paddingTop: 10, borderTop: `1px solid ${M.line}` }}>
              <button type="button" onClick={() => setMode('theme')} className="mnav-link" style={{ color: M.muted }}>Theme</button>
              <button type="button" onClick={() => setMode('edit')} className="mnav-link" style={{ color: M.green }}>Edit bar</button>
              <button type="button" onClick={() => { close(); onSignOut() }} className="mnav-link" style={{ color: M.down }}>Sign out</button>
            </div>
          </>}

          {mode === 'edit' && <>
            {GROUPS.map(([g, title]) => {
              const list = pages.filter(p => p.group === g)
              if (!list.length) return null
              return <div key={g}>{groupLabel(title)}{list.map(p => row(p, { check: draftIds.includes(p.id), onClick: () => toggleDraft(p.id) }))}</div>
            })}
            {draftIds.length >= DOCK_MAX && <div style={{ fontSize: 12, color: M.muted, margin: '8px 2px' }}>The bar is full ({DOCK_MAX}). Remove one to add another.</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => { setDraft(null); setMode('pages') }} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={() => { const ids = draftIds.filter(id => allowed.has(id)); setDock(ids); saveDock(userId, ids); setDraft(null); setMode('pages') }}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer' }}>Done</button>
            </div>
          </>}

          {mode === 'theme' && THEMES.map(t => {
            const enabled = ENABLED_THEMES.includes(t.id)
            return (
              <button key={t.id} type="button" disabled={!enabled} onClick={() => { setTheme?.(t.id); setMode('pages') }}
                style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 48, padding: '0 2px', border: 'none', borderTop: `1px solid ${M.line}`, background: 'none', fontFamily: 'var(--font)', textAlign: 'left', color: enabled ? M.ink : M.muted, cursor: enabled ? 'pointer' : 'default' }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: theme === t.id ? 700 : 500 }}>{t.label}</span>
                <span style={{ fontSize: 12, color: M.muted }}>{theme === t.id ? '✓ In use' : enabled ? '' : 'Coming soon'}</span>
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </>
  )
}
