import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { PERMISSION_TREE, getAllLeafKeys } from '../permissionTree.js'

// Shared by the laptop Profile page (ProfilePage.jsx) and the phone one (ProfileMobile.jsx): same
// data, same API calls; only the layout differs (PROFILE_MOBILE_PROMPT.md).

const API = import.meta.env.VITE_API_URL || ''

// Team member actions go through the admin API (service role); the result always carries `error` when
// anything failed (network, a refused change such as the last admin, a database error), so callers can
// show it instead of a success message.
export async function adminCall(action, session, payload) {
  try {
    const res = await fetch(`${API}/api/auth-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, callerToken: session.access_token, ...payload }),
    })
    const body = await res.json().catch(() => ({}))
    return res.ok ? body : { ...body, error: body.error || `Request failed (${res.status})` }
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." }
  }
}

export function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// Login activity of one user (the same query the laptop modal always used).
export function useActivity(userId) {
  const [state, setState] = useState({ loading: true, logs: [] })
  useEffect(() => {
    let live = true
    supabase.from('login_activity').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (live) setState({ loading: false, logs: data || [] }) })
    return () => { live = false }
  }, [userId])
  return state
}

// NavAI can only be granted by these two (unchanged rule).
export const PULSE_WHITELIST = ['pranjal.t@myfrido.com', 'suraj.s@myfrido.com']

// Access sections for the phone member page / "My access": one per section of the app, built from
// PERMISSION_TREE. A top-level group whose children are all groups (Sales & Ads) splits into one
// section per child (Sales, Ads, P&L Analytics); standalone tabs (Overview, Documents, Pulse) become
// their own small sections. Each section: { key, label, groups: [{ key, label, leaves: [{key,label}] }] }.
export function accessSections(callerEmail) {
  const canPulse = PULSE_WHITELIST.includes((callerEmail || '').toLowerCase())
  const leavesOf = node => (node.isGroup ? node.children.flatMap(leavesOf) : [{ key: node.key, label: node.label }])
  const groupsOf = node => {
    const out = []
    let loose = []
    for (const ch of node.children) {
      if (ch.isGroup) {
        if (loose.length) { out.push({ key: `${node.key}:loose${out.length}`, label: null, leaves: loose }); loose = [] }
        out.push({ key: `${ch.key}#g`, label: ch.label, leaves: leavesOf(ch) })
      } else loose.push({ key: ch.key, label: ch.label })
    }
    if (loose.length) out.push({ key: `${node.key}:loose${out.length}`, label: null, leaves: loose })
    return out
  }
  const sections = []
  for (const node of PERMISSION_TREE) {
    if (node.key === 'ask' && !canPulse) continue
    if (!node.isGroup) { sections.push({ key: node.key, label: node.label, groups: [{ key: `${node.key}#g`, label: null, leaves: [{ key: node.key, label: node.label }] }] }); continue }
    if (node.children.every(c => c.isGroup)) {
      for (const ch of node.children) sections.push({ key: ch.key, label: ch.label, groups: groupsOf(ch).length && ch.children.some(c => c.isGroup) ? groupsOf(ch) : [{ key: `${ch.key}#g`, label: null, leaves: leavesOf(ch) }] })
    } else {
      sections.push({ key: node.key, label: node.label, groups: groupsOf(node) })
    }
  }
  return sections
}

export const sectionKeys = section => [...new Set(section.groups.flatMap(g => g.leaves.map(l => l.key)))]

// Every grantable tab key (the "N" in "x of N tabs").
export function allTabKeys(callerEmail) {
  const canPulse = PULSE_WHITELIST.includes((callerEmail || '').toLowerCase())
  return [...new Set(PERMISSION_TREE.filter(n => n.key !== 'ask' || canPulse).flatMap(getAllLeafKeys))]
}

// The signed-in user's own profile: load, photo upload, name save, password change (the same
// Supabase calls the laptop page always made; shared by laptop and phone).
export function useMyProfile(session, onProfileUpdated) {
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

  return { profile, name, setName, avatarUrl, uploading, uploadAvatar, saving, saveMsg, saveProfile,
    showChangePw, setShowChangePw, curPw, setCurPw, newPw, setNewPw, confirmPw, setConfirmPw,
    showCur, setShowCur, showNew, setShowNew, pwErr, setPwErr, pwMsg, pwLoading, changePassword }
}
