import { PERMISSION_TREE, getAllLeafKeys } from '../permissionTree.js'
import { PULSE_WHITELIST } from './profileShared.js'

function PermChip({ node, tabs, setTabs }) {
  const sel = tabs.includes(node.key)
  return (
    <button type="button" onClick={() => setTabs(prev => sel ? prev.filter(k => k !== node.key) : [...prev, node.key])}
      aria-pressed={sel}
      style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 100, border: '1px solid',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', whiteSpace: 'nowrap',
        // One style in every section (PROFILE_MOBILE_PROMPT.md): granted = soft green with ✓ and a soft
        // glow, not granted = grey outline (granted chips used to be solid black)
        borderColor: sel ? 'rgba(31,90,61,.35)' : '#D5D0C4', background: sel ? 'rgba(31,90,61,.10)' : 'transparent',
        boxShadow: sel ? '0 0 8px 0 rgba(31,90,61,.18)' : 'none',
        color: sel ? '#1f5a3d' : '#4B534F' }}>
      {sel ? '✓ ' : ''}{node.label}
    </button>
  )
}

function PermGroup({ node, tabs, setTabs, isNested = false }) {
  const allLeaves = getAllLeafKeys(node)
  const allSel = allLeaves.every(k => tabs.includes(k))
  const someSel = !allSel && allLeaves.some(k => tabs.includes(k))
  const toggle = () => {
    if (allSel) setTabs(prev => prev.filter(k => !allLeaves.includes(k)))
    else setTabs(prev => [...prev.filter(k => !allLeaves.includes(k)), ...allLeaves])
  }
  return (
    <div style={{ background: isNested ? 'transparent' : '#F7F5EF', border: isNested ? 'none' : '1px solid #E7E3D8', borderRadius: isNested ? 0 : 10, padding: isNested ? '6px 0 0 0' : '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
          color: someSel ? '#4B7C5E' : allSel ? '#1E2321' : '#9BA5A1' }}>
          {node.label}
        </span>
        <button type="button" onClick={toggle}
          style={{ fontSize: 10, fontWeight: 600, color: allSel ? '#E24B4A' : '#4B7C5E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
          {allSel ? 'Remove all' : 'Select all'}
        </button>
      </div>
      {(() => {
        // Collect consecutive leaves into chip rows, preserving original child order
        const rows = []
        let leafBatch = []
        const flushLeaves = () => {
          if (leafBatch.length > 0) {
            const batch = leafBatch.splice(0)
            rows.push(
              <div key={`leaves-${batch[0].key}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {batch.map(child => <PermChip key={child.key} node={child} tabs={tabs} setTabs={setTabs} />)}
              </div>
            )
          }
        }
        for (const child of node.children) {
          if (child.isGroup) {
            flushLeaves()
            rows.push(<PermGroup key={child.key} node={child} tabs={tabs} setTabs={setTabs} isNested={true} />)
          } else {
            leafBatch.push(child)
          }
        }
        flushLeaves()
        return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{rows}</div>
      })()}
    </div>
  )
}

// Renders children of a group as a horizontal row of chips (for flat groups like Inventory)
function PermGroupFlat({ node, tabs, setTabs }) {
  const allLeaves = getAllLeafKeys(node)
  const allSel = allLeaves.every(k => tabs.includes(k))
  const someSel = !allSel && allLeaves.some(k => tabs.includes(k))
  return (
    <div style={{ background: '#F7F5EF', border: '1px solid #E7E3D8', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
          color: someSel ? '#4B7C5E' : allSel ? '#1E2321' : '#9BA5A1' }}>
          {node.label}
        </span>
        <button type="button" onClick={() => {
          if (allSel) setTabs(prev => prev.filter(k => !allLeaves.includes(k)))
          else setTabs(prev => [...prev.filter(k => !allLeaves.includes(k)), ...allLeaves])
        }} style={{ fontSize: 10, fontWeight: 600, color: allSel ? '#E24B4A' : '#4B7C5E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
          {allSel ? 'Remove all' : 'Select all'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {node.children.map(child => <PermChip key={child.key} node={child} tabs={tabs} setTabs={setTabs} />)}
      </div>
    </div>
  )
}

// Frido Pulse for an admin: being admin gives every tab except Pulse, so it's granted on its own.
// Shown only to the two people who may grant Pulse; renders nothing for anyone else.
export function AdminPulseCard({ callerEmail, tabs, setTabs, note }) {
  if (!PULSE_WHITELIST.includes((callerEmail || '').toLowerCase())) return null
  return (
    <div style={{ background: '#F7F5EF', border: '1px solid #E7E3D8', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: tabs.includes('ask') ? '#1E2321' : '#9BA5A1', marginBottom: 4 }}>Frido Pulse</div>
      <div style={{ fontSize: 12, color: '#4B534F', marginBottom: 8 }}>{note || 'Admins don’t get Pulse automatically. Tap to give or remove it.'}</div>
      <PermChip node={{ key: 'ask', label: 'Frido Pulse' }} tabs={tabs} setTabs={setTabs} />
    </div>
  )
}

export default function PermissionPanel({ tabs, setTabs, callerEmail, hidePulse = false }) {
  const canGrantPulse = PULSE_WHITELIST.includes((callerEmail || '').toLowerCase());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PERMISSION_TREE.map(node => {
        // Hide Frido Pulse chip from anyone not on the whitelist (and where Pulse has its own card)
        if (node.key === 'ask' && (!canGrantPulse || hidePulse)) return null;
        if (!node.isGroup) {
          // Standalone tab — wrap in a card like the groups
          const sel = tabs.includes(node.key)
          return (
            <div key={node.key} style={{ background: '#F7F5EF', border: '1px solid #E7E3D8', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: sel ? '#1E2321' : '#9BA5A1' }}>{node.label}</span>
              </div>
              <PermChip node={node} tabs={tabs} setTabs={setTabs} />
            </div>
          )
        }
        const hasNestedGroup = node.children.some(c => c.isGroup)
        if (hasNestedGroup) return <PermGroup key={node.key} node={node} tabs={tabs} setTabs={setTabs} />
        return <PermGroupFlat key={node.key} node={node} tabs={tabs} setTabs={setTabs} />
      })}
    </div>
  )
}
