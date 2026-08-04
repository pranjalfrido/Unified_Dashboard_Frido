import { useState, useCallback } from 'react'
import { fmt, fmtN, pct } from '../utils.js'
import { KPICard, TrendAnalysisCard } from '../components.jsx'
import PnLFinancialTable from './PnLFinancialTable.jsx'

const dash = '—'
const fmtPct = v => v != null ? `${v.toFixed(1)}%` : dash

export default function PnLChannelTab({ title, note, gross, excRev, net, units, orders, returnRev, subCatData, skuData, adSpendMap, skuCosts, daily, grossColor = '#FFD600', gradId = 'pnlGrossGrad' }) {
  const returnPct = pct(returnRev, gross)
  const aov = orders > 0 ? gross / orders : 0
  const asp = units > 0 ? gross / units : 0
  const [tableTotals, setTableTotals] = useState(null)
  const handleTotals = useCallback(t => setTableTotals(t), [])

  const t = tableTotals

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi9">
        <KPICard label="Gross Revenue" value={fmt(gross)} sub={`${fmtN(units)} units${note ? ` · ${note}` : ''}`} />
        <KPICard label="Net Revenue" value={fmt(net)} sub="Ex GST & returns" />
        <KPICard label="Returns" value={fmt(returnRev)} sub={`${fmtPct(gross > 0 ? returnRev / gross * 100 : null)} of Gross`} accent={gross > 0 && returnRev / gross > 0.15 ? '#7A1A1A' : undefined} />
        <KPICard label="COGS" value={t?.cogs != null ? fmt(t.cogs) : dash} sub={`${fmtPct(t?.cogsPct)} of Net Rev`} />
        <KPICard label="Gross Margin" value={t?.gm != null ? fmt(t.gm) : dash} sub={`GM% ${fmtPct(t?.gmPct)}`} accent={t?.gmPct != null && t.gmPct < 30 ? '#7A1A1A' : undefined} />
        <KPICard label="SnD Cost" value={t?.snd != null ? fmt(t.snd) : dash} sub={`${fmtPct(t?.sndPct)} of Net Rev`} />
        <KPICard label="CM1" value={t?.cm1 != null ? fmt(t.cm1) : dash} sub={`CM1% ${fmtPct(t?.cm1Pct)}`} accent={t?.cm1Pct != null && t.cm1Pct < 0 ? '#7A1A1A' : undefined} />
        <KPICard label="Mktg Spend" value={t?.spend != null ? fmt(t.spend) : dash} sub={`${fmtPct(t?.spendPct)} of Net Rev`} />
        <KPICard label="CM2" value={t?.cm2 != null ? fmt(t.cm2) : dash} sub={`CM2% ${fmtPct(t?.cm2Pct)}`} accent={t?.cm2Pct != null && t.cm2Pct < 0 ? '#7A1A1A' : undefined} />
      </div>
      <TrendAnalysisCard title={`${title} — Revenue Trend`} daily={daily} grossColor={grossColor} grossGradId={gradId} boxHeight={410} cogsPct={tableTotals?.cogsPct} sndPct={tableTotals?.sndPct} netRatio={excRev > 0 ? net / excRev : null} />
      <PnLFinancialTable subCatData={subCatData} skuData={skuData} adSpendMap={adSpendMap} skuCosts={skuCosts} title={`Financial View · ${title}`} onTotals={handleTotals} />
    </div>
  )
}
