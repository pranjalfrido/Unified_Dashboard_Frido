import { C } from '../utils.js'
import InfoPopover from '../responsive/InfoPopover.jsx'

// Phone intro for a P&L tool (PNL_REVIEW_FIXES.md §2): the title is in the header, so here only one
// short muted line (max 2 lines) with the long explanation behind an ⓘ. Laptop keeps each tool's
// own title block.
export default function ToolIntro({ title, short, long }) {
  const M = C.m
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, margin: '2px 0 4px' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: '17px', color: M.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{short}</span>
      {long && <InfoPopover title={title} text={long} style={{ width: 22, height: 22, flexShrink: 0, marginTop: -2 }} />}
    </div>
  )
}
