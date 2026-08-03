import { fmt, fmtN, pct } from '../utils.js'
import { KPICard, TrendAnalysisCard } from '../components.jsx'
import PnLFinancialTable from './PnLFinancialTable.jsx'

// One channel's PnL subtab: KPI row → Trend chart → Financial View table. Same layout order
// the user asked for ("firstly the KPIs then trend then financial view table"), same visual
// chrome as the Sales tab (KPICard, TrendAnalysisCard, C palette) so PnL reads as part of the
// same product, not a bolted-on new design.
export default function PnLChannelTab({ title, note, gross, excRev, net, units, orders, returnRev, subCatData, skuData, adSpendMap, sndBySku, daily, grossColor = '#FFD600', gradId = 'pnlGrossGrad' }) {
  const returnPct = pct(returnRev, gross)
  const aov = orders > 0 ? gross / orders : 0
  const asp = units > 0 ? gross / units : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Gross Revenue" value={fmt(gross)} sub={note} />
        <KPICard label="Net Revenue" value={fmt(net)} sub="Ex GST, after returns/cancellations" />
        <KPICard label="Returns" value={fmt(returnRev)} sub={`${returnPct} of gross`} accent={parseFloat(returnPct) > 15 ? '#7A1A1A' : undefined} />
        <KPICard label="Orders" value={fmtN(orders)} sub={`${fmtN(units)} units`} />
        <KPICard label="AOV / ASP" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} sub={`ASP ₹${Math.round(asp).toLocaleString('en-IN')}`} />
      </div>
      <TrendAnalysisCard title={`${title} — Revenue Trend`} daily={daily} grossColor={grossColor} grossGradId={gradId} boxHeight={360} />
      <PnLFinancialTable subCatData={subCatData} skuData={skuData} adSpendMap={adSpendMap} sndBySku={sndBySku} title={`Financial View · ${title}`} />
    </div>
  )
}
