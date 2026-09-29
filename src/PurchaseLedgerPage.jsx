import { useState } from 'react'
import { C } from './utils.js'

const TABS = [
  { id: 'domestic',  label: 'Domestic',  src: '/purchase-parser-domestic.html' },
  { id: 'import',    label: 'Import',     src: '/purchase-parser-import.html' },
  { id: 'packaging', label: 'Packaging',  src: '/purchase-parser-packaging.html' },
]

export default function PurchaseLedgerPage() {
  const [tab, setTab] = useState('domestic')
  const current = TABS.find(t => t.id === tab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 32px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
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
        {TABS.map(t => (
          <iframe
            key={t.id}
            src={t.src}
            title={t.label}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: t.id === tab ? 'block' : 'none',
              background: 'white',
            }}
          />
        ))}
      </div>
    </div>
  )
}
