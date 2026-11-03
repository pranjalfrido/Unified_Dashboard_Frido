import { LOCAL_PEOPLE } from './localAuth.js'

// LOCAL TEST MODE ONLY: pick a made-up test person (see localAuth.js).
export default function LocalPicker() {
  const go = k => { try { sessionStorage.setItem('fb_local_as', k) } catch { /* ignore */ } window.location.assign('/overview') }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 12, fontFamily: 'var(--font, sans-serif)', padding: 24, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Local test mode</div>
      <div style={{ fontSize: 14, color: '#555', textAlign: 'center', maxWidth: 340 }}>Feedback is running against a local test store. Pick a made-up test person (no real login, no production data).</div>
      {Object.entries(LOCAL_PEOPLE).map(([k, p]) => (
        <button key={k} type="button" onClick={() => go(k)} data-testid={`local-as-${k}`}
          style={{ width: 260, minHeight: 46, borderRadius: 12, border: '1px solid #cdd', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          {p.name}{p.is_admin ? ' (admin)' : ''}
        </button>
      ))}
    </div>
  )
}
