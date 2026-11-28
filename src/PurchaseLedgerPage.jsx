import { useState, useEffect } from 'react'
import { authFetch } from './authFetch.js'
import { ArrowLeft } from 'lucide-react'
import { C } from './utils.js'

const TABS = [
  { id: 'domestic',  label: 'Domestic',  src: '/purchase-parser-domestic.html' },
  { id: 'import',    label: 'Import',     src: '/purchase-parser-import.html' },
  { id: 'packaging', label: 'Packaging',  src: '/purchase-parser-packaging.html' },
]

// The parser pages are login-only files, and an iframe's own request carries no login token. So each page is fetched
// with the user's token (authFetch) and handed to the iframe as its content.
function useParserPage(src) {
  const [html, setHtml] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    authFetch(src).then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then(t => { if (live) setHtml(t) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [src])
  return { html, failed }
}

function ParserFrame({ t, visible }) {
  const { html, failed } = useParserPage(t.src)
  if (failed) return <div style={{ display: visible ? 'block' : 'none', padding: 24, color: C.t2 }}>Could not load {t.label}. Reload the page and try again.</div>
  return (
    <iframe title={t.label} srcDoc={html || ''}
      style={{ width: '100%', height: '100%', border: 'none', display: visible ? 'block' : 'none', background: 'white' }} />
  )
}

export default function PurchaseLedgerPage({ onBack }) {
  const [tab, setTab] = useState('domestic')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 32px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.card, border: `1.5px solid ${C.acc}`, color: C.acc, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 20, marginBottom: 10 }}>
            <ArrowLeft size={14} /> Back to Documents
          </button>
        )}
        <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          Documents
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.t1 }}>Purchase Ledger</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: `1.5px solid ${tab === t.id ? C.acc : C.border}`,
              background: tab === t.id ? C.acc : C.card,
              color: tab === t.id ? '#fff' : C.t2,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Parser iframe — fills remaining height */}
      <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {TABS.map(t => <ParserFrame key={t.id} t={t} visible={t.id === tab} />)}
      </div>
    </div>
  )
}
