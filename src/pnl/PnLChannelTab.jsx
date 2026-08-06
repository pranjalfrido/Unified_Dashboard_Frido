import { useState, useCallback } from 'react'
import { fmt, fmtN, fmtBig, pct } from '../utils.js'
import { KPICard, TrendAnalysisCard } from '../components.jsx'
import PnLFinancialTable from './PnLFinancialTable.jsx'

const dash = '—'
const fmtPct = v => v != null ? `${v.toFixed(1)}%` : dash

export default function PnLChannelTab({ title, note, gross, excRev, net, units, orders, returnRev, subCatData, skuData, adSpendMap, skuCosts, daily, grossColor = '#FFD600', gradId = 'pnlGrossGrad', includeUnmatched = false, mobilityNetBySubCat = {} }) {
  const returnPct = pct(returnRev, gross)
  const aov = orders > 0 ? gross / orders : 0
  const asp = units > 0 ? gross / units : 0
  const [tableTotals, setTableTotals] = useState(null)
  const handleTotals = useCallback(t => setTableTotals(t), [])

  const t = tableTotals
  const spendVal = t?.spend
  const spendPct = spendVal != null && t?.netCovered > 0 ? spendVal / t.netCovered * 100 : t?.spendPct
  const cm2Val = t?.cm1 != null && spendVal != null ? t.cm1 - spendVal : t?.cm2
  const cm2Pct = cm2Val != null && t?.netCovered > 0 ? cm2Val / t.netCovered * 100 : t?.cm2Pct

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi9">
        <KPICard label="Gross Revenue" value={fmt(gross)} sub={`${fmtBig(units)} units${note ? ` · ${note}` : ''}`} />
        <KPICard label="Net Revenue" value={fmt(net)} sub="" />
        <KPICard label="Returns" value={fmt(returnRev)} sub={`${fmtPct(gross > 0 ? returnRev / gross * 100 : null)} of Gross`} accent={gross > 0 && returnRev / gross > 0.15 ? '#7A1A1A' : undefined} />
        <KPICard label="COGS" value={t?.cogs != null ? fmt(t.cogs) : dash} sub={`${fmtPct(t?.cogsPct)} of Net Rev`} />
        <KPICard label="Gross Margin" value={t?.gm != null ? fmt(t.gm) : dash} sub={`GM% ${fmtPct(t?.gmPct)}`} accent={t?.gmPct != null && t.gmPct < 30 ? '#7A1A1A' : undefined} />
        <KPICard label="SnD Cost" value={t?.snd != null ? fmt(t.snd) : dash} sub={`${fmtPct(t?.sndPct)} of Net Rev`} />
        <KPICard label="CM1" value={t?.cm1 != null ? fmt(t.cm1) : dash} sub={`CM1% ${fmtPct(t?.cm1Pct)}`} accent={t?.cm1Pct != null && t.cm1Pct < 0 ? '#7A1A1A' : undefined} />
        <KPICard label="Mktg Spend" value={spendVal != null ? fmt(spendVal) : dash} sub={`${fmtPct(spendPct)} of Net Rev`} />
        <KPICard label="CM2" value={cm2Val != null ? fmt(cm2Val) : dash} sub={`CM2% ${fmtPct(cm2Pct)}`} accent={cm2Pct != null && cm2Pct < 0 ? '#7A1A1A' : undefined} />
      </div>
      <TrendAnalysisCard title={`${title} — Revenue Trend`} daily={daily} grossColor={grossColor} grossGradId={gradId} boxHeight={410} cogsPct={tableTotals?.cogsPct} sndPct={tableTotals?.sndPct} netRatio={gross > 0 ? net / gross : null} />
      <PnLFinancialTable subCatData={subCatData} skuData={skuData} adSpendMap={adSpendMap} skuCosts={skuCosts} title={`Financial View · ${title}`} onTotals={handleTotals} includeUnmatched={includeUnmatched} mobilityNetBySubCat={mobilityNetBySubCat} />
    </div>
  )
}
