import { useState } from 'react'
import { C } from '../utils.js'

// Slim, neutral one-line note (data availability, snapshot time, partial period). Tap to expand
// `detail` when there is one. Neutral on purpose: colour is reserved for good/bad and status.
export default function InfoStrip({ text, detail, icon = 'ⓘ', style }) {
  const M = C.m
  const [open, setOpen] = useState(false)
  const Tag = detail ? 'button' : 'div'
  return (
    <Tag type={detail ? 'button' : undefined} onClick={detail ? () => setOpen(o => !o) : undefined} aria-expanded={detail ? open : undefined}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%', textAlign: 'left', border: `1px solid ${M.line}`, background: M.soft, borderRadius: 10, padding: '6px 10px',
        fontSize: 12, lineHeight: '17px', color: M.muted, fontFamily: 'var(--font)', cursor: detail ? 'pointer' : 'default', ...style }}>
      <span aria-hidden="true" style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{text}{open && detail && <span style={{ display: 'block', marginTop: 4, color: M.ink }}>{detail}</span>}</span>
    </Tag>
  )
}
