path = r'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/frido-dashboard/src/App.jsx'
content = open(path, encoding='utf-8').read()

replacements = [
    # 1. LSectionTitle component
    (
        'function LSectionTitle({ title }) {\n  return (\n    <div style={{ display: \'flex\', alignItems: \'center\', gap: 10, margin: \'6px 0 2px\' }}>\n      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: \'.06em\', textTransform: \'uppercase\', color: C.t1 }}>{title}</span>\n      <div style={{ flex: 1, height: 1, background: C.border }} />\n    </div>\n  )\n}',
        'function LSectionTitle({ title, collapsed, onToggle }) {\n  const clickable = typeof onToggle === \'function\'\n  return (\n    <div onClick={clickable ? onToggle : undefined} style={{ display: \'flex\', alignItems: \'center\', gap: 10, margin: \'6px 0 2px\', cursor: clickable ? \'pointer\' : \'default\', userSelect: \'none\' }}>\n      {clickable && <span style={{ fontSize: 9, color: C.t3, display: \'inline-block\', transform: collapsed ? \'rotate(-90deg)\' : \'rotate(0deg)\', transition: \'transform .2s\' }}>&#9660;</span>}\n      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: \'.06em\', textTransform: \'uppercase\', color: C.t1 }}>{title}</span>\n      <div style={{ flex: 1, height: 1, background: C.border }} />\n    </div>\n  )\n}'
    ),
    # 2. State
    (
        "  const [tatCourierView, setTatCourierView] = useState('courier') // 'courier' | 'month'",
        "  const [tatCourierView, setTatCourierView] = useState('courier') // 'courier' | 'month'\n  const [secCollapsed, setSecCollapsed] = useState({})\n  const toggleSec = key => setSecCollapsed(p => ({ ...p, [key]: !p[key] }))"
    ),
    # 3. Volume
    ('<LSectionTitle title="Volume Overview" />', '<LSectionTitle title="Volume Overview" collapsed={secCollapsed[\'volume\']} onToggle={() => toggleSec(\'volume\')} />'),
    # 4. Quality
    ('<LSectionTitle title="Delivery Quality & SLA" />', '<LSectionTitle title="Delivery Quality & SLA" collapsed={secCollapsed[\'quality\']} onToggle={() => toggleSec(\'quality\')} />'),
    # 5. TAT
    ('<LSectionTitle title="Turnaround Time" />', '<LSectionTitle title="Turnaround Time" collapsed={secCollapsed[\'tat\']} onToggle={() => toggleSec(\'tat\')} />'),
    # 6. Trend
    ('<LSectionTitle title="Monthly Trend" />', '<LSectionTitle title="Monthly Trend" collapsed={secCollapsed[\'trend\']} onToggle={() => toggleSec(\'trend\')} />'),
    # 7. Courier
    ('<LSectionTitle title="Courier Performance" />', '<LSectionTitle title="Courier Performance" collapsed={secCollapsed[\'courier\']} onToggle={() => toggleSec(\'courier\')} />'),
    # 8. OFD
    ('<LSectionTitle title="OFD Attempt Efficiency" />', '<LSectionTitle title="OFD Attempt Efficiency" collapsed={secCollapsed[\'ofd\']} onToggle={() => toggleSec(\'ofd\')} />'),
    # 9. TAT Bucket
    ('<LSectionTitle title="TAT Bucket Analysis" />', '<LSectionTitle title="TAT Bucket Analysis" collapsed={secCollapsed[\'tatbucket\']} onToggle={() => toggleSec(\'tatbucket\')} />'),
    # 10. Geographic
    ('<LSectionTitle title="Geographic" />', '<LSectionTitle title="Geographic" collapsed={secCollapsed[\'geo\']} onToggle={() => toggleSec(\'geo\')} />'),
    # 11. RTO Reasons
    ('<LSectionTitle title="RTO Reasons" />', '<LSectionTitle title="RTO Reasons" collapsed={secCollapsed[\'rto\']} onToggle={() => toggleSec(\'rto\')} />'),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f'OK: {old[:60]}')
    else:
        print(f'MISS: {old[:60]}')

# CSS display replacements
css_replacements = [
    # Volume grid
    ("display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>\n          <LKpiCard label=\"Total Shipments\"",
     "display: secCollapsed['volume'] ? 'none' : 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>\n          <LKpiCard label=\"Total Shipments\""),
    # Quality grid
    ("display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7 }}>\n          <LKpiCard label=\"On Time Del\"",
     "display: secCollapsed['quality'] ? 'none' : 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7 }}>\n          <LKpiCard label=\"On Time Del\""),
    # TAT grid
    ("display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>\n          <LKpiCard label=\"Avg Processing\"",
     "display: secCollapsed['tat'] ? 'none' : 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>\n          <LKpiCard label=\"Avg Processing\""),
    # Trend grid
    ("display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>\n          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>",
     "display: secCollapsed['trend'] ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>\n          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>"),
    # Courier grid
    ("display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>\n          <div style={cardStyle}>\n          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>",
     "display: secCollapsed['courier'] ? 'none' : 'grid', gridTemplateColumns: '1fr', gap: 14 }}>\n          <div style={cardStyle}>\n          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>"),
    # OFD table card - it uses tCard variable
    ("              <div style={tCard}>\n                <div style={tTitle}>Courier-wise Out-for-Delivery",
     "              <div style={{ ...tCard, display: secCollapsed['ofd'] ? 'none' : undefined }}>\n                <div style={tTitle}>Courier-wise Out-for-Delivery"),
    # TAT Bucket grid
    ("display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>\n                    {(() => {\n                      const view = tatCourierView",
     "display: secCollapsed['tatbucket'] ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>\n                    {(() => {\n                      const view = tatCourierView"),
    # Geographic returned grid
    ("          return (\n            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>",
     "          return (\n            <div style={{ display: secCollapsed['geo'] ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>"),
    # RTO Reasons returned container
    ("          return (\n            <div style={{ ...cardStyle, padding: '16px 18px' }}>",
     "          return (\n            <div style={{ ...cardStyle, padding: '16px 18px', display: secCollapsed['rto'] ? 'none' : undefined }}>"),
]

for old, new in css_replacements:
    if old in content:
        content = content.replace(old, new)
        print(f'CSS OK: {old[:60]}')
    else:
        print(f'CSS MISS: {old[:60]}')

open(path, 'w', encoding='utf-8').write(content)
print('\nDone writing file')
