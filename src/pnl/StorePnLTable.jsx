import { C, fmt, exportCSV } from '../utils.js'
import { useSortableTable } from '../components.jsx'

// EBO store-wise P&L drill-down, nested inside the EBO PnL tab (confirmed 2026-08-20 — a drill-
// down within the existing EBO tab, not a separate top-level tab). One row per unifiedstorename,
// Net Revenue → COGS → GM → SnD → CM1 → Marketing Spend → CM2 → Fixed Costs → EBITDA. Rows are
// pre-aggregated in PnLPage.jsx's storePnLRows memo — this component only renders them.
//
// Fixed costs (rent/employee/CAM/utilities/software/volumetric rent) come from Supabase via
// api/_store_pnl.js and are NOT gated behind a "some data missing → show —" rule the way
// COGS/SnD/Marketing are — a store simply not yet onboarded into a given cost sheet defaults to
// 0 for that line rather than blocking EBITDA (confirmed 2026-08-20: those sheets are still being
// filled in store-by-store, so blocking would leave EBITDA permanently blank for most stores).
const noCostCell = <span style={{ color: C.t3 }}>—</span>
const MIN_REV_FOR_RATIOS = 100
const pctOf = (n, d) => d > MIN_REV_FOR_RATIOS ? (n / d * 100) : null

export default function StorePnLTable({ rows = [] }) {
  const { sort, sortRows, Th } = useSortableTable('gross')

  const getters = {
    storeName: r => r.storeName, gross: r => r.gross, excRev: r => r.excRev, units: r => r.units,
    netRev: r => r.netRev, cogs: r => r.cogs ?? -Infinity, gmPct: r => pctOf(r.gm, r.netRev) ?? -Infinity,
    sndPct: r => pctOf(r.snd, r.netRev) ?? -Infinity, cm1Pct: r => pctOf(r.cm1, r.netRev) ?? -Infinity,
    spendPct: r => pctOf(r.spend, r.netRev) ?? -Infinity, cm2: r => r.cm2 ?? -Infinity, cm2Pct: r => pctOf(r.cm2, r.netRev) ?? -Infinity,
    rent: r => r.fixedCosts.rent, utilities: r => r.fixedCosts.utilities, employeeCost: r => r.fixedCosts.employeeCost,
    cam: r => r.fixedCosts.cam, software: r => r.fixedCosts.software, volumetricRent: r => r.fixedCosts.volumetricRent,
    totalFixedCosts: r => r.totalFixedCosts, ebitda: r => r.ebitda ?? -Infinity,
    ebitdaPct: r => (r.ebitda != null ? pctOf(r.ebitda, r.netRev) : null) ?? -Infinity,
  }
  const sorted = sortRows(rows, getters)

  const tot = rows.reduce((s, r) => ({
    gross: s.gross + r.gross, excRev: s.excRev + r.excRev, netRev: s.netRev + r.netRev, units: s.units + r.units,
    cogs: s.cogs + (r.cogs || 0), anyCogs: s.anyCogs || r.cogs != null,
    gm: s.gm + (r.gm || 0), anyGm: s.anyGm || r.gm != null,
    snd: s.snd + (r.snd || 0), anySnd: s.anySnd || r.snd != null,
    cm1: s.cm1 + (r.cm1 || 0), anyCm1: s.anyCm1 || r.cm1 != null,
    spend: s.spend + r.spend,
    cm2: s.cm2 + (r.cm2 || 0), anyCm2: s.anyCm2 || r.cm2 != null,
    rent: s.rent + (r.fixedCosts.rent || 0), utilities: s.utilities + (r.fixedCosts.utilities || 0),
    employeeCost: s.employeeCost + (r.fixedCosts.employeeCost || 0), cam: s.cam + (r.fixedCosts.cam || 0),
    software: s.software + (r.fixedCosts.software || 0), volumetricRent: s.volumetricRent + (r.fixedCosts.volumetricRent || 0),
    totalFixedCosts: s.totalFixedCosts + r.totalFixedCosts,
    ebitda: s.ebitda + (r.ebitda || 0), anyEbitda: s.anyEbitda || r.ebitda != null,
  }), { gross: 0, excRev: 0, netRev: 0, units: 0, cogs: 0, anyCogs: false, gm: 0, anyGm: false, snd: 0, anySnd: false, cm1: 0, anyCm1: false, spend: 0, cm2: 0, anyCm2: false, rent: 0, utilities: 0, employeeCost: 0, cam: 0, software: 0, volumetricRent: 0, totalFixedCosts: 0, ebitda: 0, anyEbitda: false })

  const handleExport = () => {
    const csvRows = rows.map(r => ({
      Store: r.storeName,
      'Gross Rev (Inc GST)': Math.round(r.gross), 'Gross Rev (Ex GST)': Math.round(r.excRev),
      Units: r.units, 'Net Revenue': Math.round(r.netRev),
      COGS: r.cogs != null ? Math.round(r.cogs) : '', 'GM %': pctOf(r.gm, r.netRev) != null ? +pctOf(r.gm, r.netRev).toFixed(1) : '',
      'SnD Cost': r.snd != null ? Math.round(r.snd) : '', 'SnD %': pctOf(r.snd, r.netRev) != null ? +pctOf(r.snd, r.netRev).toFixed(1) : '',
      CM1: r.cm1 != null ? Math.round(r.cm1) : '', 'CM1 %': pctOf(r.cm1, r.netRev) != null ? +pctOf(r.cm1, r.netRev).toFixed(1) : '',
      'Marketing Spend': Math.round(r.spend), 'Spend %': +(pctOf(r.spend, r.netRev) ?? 0).toFixed(2),
      CM2: r.cm2 != null ? Math.round(r.cm2) : '', 'CM2 %': pctOf(r.cm2, r.netRev) != null ? +pctOf(r.cm2, r.netRev).toFixed(1) : '',
      Rent: Math.round(r.fixedCosts.rent), 'Employee Cost': Math.round(r.fixedCosts.employeeCost),
      CAM: Math.round(r.fixedCosts.cam), Utilities: Math.round(r.fixedCosts.utilities),
      Software: Math.round(r.fixedCosts.software), 'Volumetric Rent': Math.round(r.fixedCosts.volumetricRent),
      'Total Fixed Costs': Math.round(r.totalFixedCosts),
      EBITDA: r.ebitda != null ? Math.round(r.ebitda) : '', 'EBITDA %': r.ebitda != null && r.netRev > MIN_REV_FOR_RATIOS ? +(r.ebitda / r.netRev * 100).toFixed(1) : '',
    }))
    exportCSV(csvRows, 'store_pnl_ebo.csv')
  }

  const thStyle = { fontSize: 9.5, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 7px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 11, padding: '4px 7px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  const totalTdStyle = { ...tdStyle, padding: '6px 7px', fontWeight: 700, color: C.t1, borderBottom: 'none', position: 'sticky', bottom: 0, background: C.bg, borderTop: `1.5px solid ${C.border}`, zIndex: 1 }

  return (
    <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', marginTop: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>Store-wise P&amp;L · EBO</div>
        <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560, maxWidth: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 2280 }}>
          <colgroup>
            <col style={{ width: '10%' }} />
            {Array.from({ length: 23 }).map((_, i) => <col key={i} style={{ width: `${90 / 23}%` }} />)}
          </colgroup>
          <thead className="tbl-head">
            <tr>
              <Th label="Store" sortKey="storeName" style={{ ...thStyleL, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} align="left" />
              <Th label="Gross (Inc GST)" sortKey="gross" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Units" sortKey="units" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Net Rev" sortKey="netRev" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="COGS" sortKey="cogs" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="GM %" sortKey="gmPct" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="SnD %" sortKey="sndPct" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="CM1 %" sortKey="cm1Pct" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Spend %" sortKey="spendPct" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="CM2" sortKey="cm2" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="CM2 %" sortKey="cm2Pct" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Rent" sortKey="rent" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Utilities" sortKey="utilities" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Employee Cost" sortKey="employeeCost" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="CAM" sortKey="cam" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Software" sortKey="software" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Volumetric Rent" sortKey="volumetricRent" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="Fixed Costs" sortKey="totalFixedCosts" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="EBITDA" sortKey="ebitda" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
              <Th label="EBITDA %" sortKey="ebitdaPct" style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const gmPct = pctOf(r.gm, r.netRev)
              const sndPct = pctOf(r.snd, r.netRev)
              const cm1Pct = pctOf(r.cm1, r.netRev)
              const spendPct = pctOf(r.spend, r.netRev)
              const cm2Pct = pctOf(r.cm2, r.netRev)
              const ebitdaPct = r.ebitda != null ? pctOf(r.ebitda, r.netRev) : null
              return (
                <tr key={r.storeName} className="tbl-row" style={{ cursor: 'default' }}>
                  <td style={{ ...tdStyleL, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.storeName}>{r.storeName}</td>
                  <td style={tdStyle}>{fmt(r.gross)}</td>
                  <td style={tdStyle}>{r.units.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{fmt(r.netRev)}</td>
                  <td style={tdStyle}>{r.cogs != null ? fmt(r.cogs) : noCostCell}</td>
                  <td style={tdStyle}>{gmPct != null ? `${gmPct.toFixed(1)}%` : noCostCell}</td>
                  <td style={tdStyle}>{sndPct != null ? `${sndPct.toFixed(1)}%` : noCostCell}</td>
                  <td style={tdStyle}>{cm1Pct != null ? `${cm1Pct.toFixed(1)}%` : noCostCell}</td>
                  <td style={tdStyle}>{spendPct != null ? `${spendPct.toFixed(2)}%` : noCostCell}</td>
                  <td style={tdStyle}>{r.cm2 != null ? fmt(r.cm2) : noCostCell}</td>
                  <td style={tdStyle}>{cm2Pct != null ? `${cm2Pct.toFixed(1)}%` : noCostCell}</td>
                  <td style={tdStyle}>{fmt(r.fixedCosts.rent)}</td>
                  <td style={tdStyle}>{fmt(r.fixedCosts.utilities)}</td>
                  <td style={tdStyle}>{fmt(r.fixedCosts.employeeCost)}</td>
                  <td style={tdStyle}>{fmt(r.fixedCosts.cam)}</td>
                  <td style={tdStyle}>{fmt(r.fixedCosts.software)}</td>
                  <td style={tdStyle}>{fmt(r.fixedCosts.volumetricRent)}</td>
                  <td style={tdStyle}>{fmt(r.totalFixedCosts)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    {r.ebitda != null ? fmt(r.ebitda) : noCostCell}
                  </td>
                  <td style={tdStyle}>{ebitdaPct != null ? `${ebitdaPct.toFixed(1)}%` : noCostCell}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="tbl-foot">
            <tr>
              <td style={{ ...totalTdStyle, textAlign: 'left' }}>Total</td>
              <td style={totalTdStyle}>{fmt(tot.gross)}</td>
              <td style={totalTdStyle}>{tot.units.toLocaleString('en-IN')}</td>
              <td style={totalTdStyle}>{fmt(tot.netRev)}</td>
              <td style={totalTdStyle}>{tot.anyCogs ? fmt(tot.cogs) : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anyGm ? `${pctOf(tot.gm, tot.netRev)?.toFixed(1) ?? '0.0'}%` : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anySnd ? `${pctOf(tot.snd, tot.netRev)?.toFixed(1) ?? '0.0'}%` : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anyCm1 ? `${pctOf(tot.cm1, tot.netRev)?.toFixed(1) ?? '0.0'}%` : noCostCell}</td>
              <td style={totalTdStyle}>{`${pctOf(tot.spend, tot.netRev)?.toFixed(2) ?? '0.00'}%`}</td>
              <td style={totalTdStyle}>{tot.anyCm2 ? fmt(tot.cm2) : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anyCm2 ? `${pctOf(tot.cm2, tot.netRev)?.toFixed(1) ?? '0.0'}%` : noCostCell}</td>
              <td style={totalTdStyle}>{fmt(tot.rent)}</td>
              <td style={totalTdStyle}>{fmt(tot.utilities)}</td>
              <td style={totalTdStyle}>{fmt(tot.employeeCost)}</td>
              <td style={totalTdStyle}>{fmt(tot.cam)}</td>
              <td style={totalTdStyle}>{fmt(tot.software)}</td>
              <td style={totalTdStyle}>{fmt(tot.volumetricRent)}</td>
              <td style={totalTdStyle}>{fmt(tot.totalFixedCosts)}</td>
              <td style={{ ...totalTdStyle, fontWeight: 700 }}>{tot.anyEbitda ? fmt(tot.ebitda) : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anyEbitda ? `${pctOf(tot.ebitda, tot.netRev)?.toFixed(1) ?? '0.0'}%` : noCostCell}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
