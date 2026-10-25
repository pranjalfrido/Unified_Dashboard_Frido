// Plain-language names and tap-to-read definitions for the mobile Overview. Definitions describe
// the formulas actually used (api/logistics.js kpis CTE + OverviewPage), not generic textbook ones.
// lowerIsBetter drives ▲/▼ colour: for these, going up is shown red.
export const METRICS = {
  // Sales Trend
  gross: { label: 'Gross Revenue', short: 'Gross Rev', def: 'All order revenue in the period, including GST, before cancellations, returns and RTO.' },
  net: { label: 'Net Revenue', short: 'Net Rev', def: 'Revenue excluding GST, after cancellations, RTO and customer-initiated returns.' },
  orders: { label: 'Orders', def: 'Number of orders placed in the period.' },
  units: { label: 'Units', def: 'Number of items sold in the period.' },
  aov: { label: 'AOV (Inc. GST)', short: 'AOV', def: 'Average order value: gross revenue ÷ orders.' },
  asp: { label: 'ASP (Inc. GST)', short: 'ASP', def: 'Average selling price per item: gross revenue ÷ units.' },
  returnPct: { label: 'Return %', lowerIsBetter: true, def: 'Cancelled + RTO + customer-initiated returns, as a share of gross revenue.' },

  // Logistics & Ops (rates are shares of all shipments in the window unless stated)
  totalShipments: { label: 'Total shipments', def: 'All shipments created in the window shown.' },
  delPct: { label: 'Delivered', def: 'Shipments delivered, as a share of all shipments.' },
  rtoPct: { label: 'RTO', lowerIsBetter: true, def: 'Return to origin: shipments sent back to the warehouse undelivered, as a share of all shipments.' },
  zRtoPct: { label: 'Zero-attempt RTO', lowerIsBetter: true, def: 'Shipments returned to origin without a single delivery attempt, as a share of all shipments.' },
  ndrPct: { label: 'NDR', lowerIsBetter: true, def: 'Non-delivery: shipments that needed a second delivery attempt or more, as a share of shipments that had at least one attempt.' },
  ndrResolvedPct: { label: 'NDR resolved', def: 'Of the shipments that needed a re-attempt, the share that was eventually delivered.' },
  fasr: { label: 'First attempt', def: 'First-attempt success (FASR): shipments delivered on the first attempt, as a share of shipments that had at least one attempt.' },
  rasr: { label: 'Reattempt', def: 'Reattempt success (RASR): shipments delivered after two or more attempts, as a share of shipments that had at least one attempt.' },
  slaBreachPct: { label: 'SLA breach', lowerIsBetter: true, def: 'Shipments delivered after their expected delivery date, as a share of all shipments.' },

  // Customers (D2C / Shopify only)
  customers: { label: 'Customers', def: 'Distinct D2C customers who ordered in the period.' },
  repeatRate: { label: 'Repeat rate', def: 'Share of this period\'s D2C customers who had ordered before.' },
  ltv: { label: 'LTV', def: 'Average revenue per D2C customer over the 12 months up to the end of the period.' },
}

export const SPEED_INFO = 'Average days per stage, and the share of shipments that met each SLA. Stage averages are worked out on different groups of shipments (only those that reached that stage), so they don\'t add up to the end-to-end total.'
