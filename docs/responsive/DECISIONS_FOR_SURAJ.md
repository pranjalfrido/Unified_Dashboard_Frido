# Decisions for Suraj

Things found during the unattended runs that change a number, a definition or a rule. Nothing here is in the code; each one waits for your answer. (This branch's copy holds the Customer section; the P&L section is on `feature/responsive-pnl`, Ads on `fix/ads-data` / `feature/responsive-ads`.)

## Customer data (fix/customer-data)

### C1. Inactive 90+ counts customers whose last order is after the end date
Q8 (customer.js:316-327) has no `<= end` bound, so for a past range, customers who ordered after the end date get a negative gap and land in "Active". Option a: add the bound (the count becomes "as of the end date"; it changes for any range not ending yesterday). Option b: keep and label "as of today". Recommendation: a.

### C2. One payback definition
Acquisition shows orders to pay back (CAC ÷ (AOV × 35%), now labelled "1.1 orders"); Spend & Discounts shows months on revenue without margin (CAC ÷ monthly revenue per customer = 3.7 mo). Option a: both in months at 35% margin (Spend & Discounts would go from 3.7 mo to ~10.6 mo for the same data). Option b: keep both, renamed (orders vs months on revenue). Recommendation: a, with the margin from P&L D2C CM1 % instead of a fixed 35% once you agree.

### C3. Additional spend and CAC
Customer counts all D2C additional spend (prorated by days) and puts it in CAC; Ads counts only product-tagged additional spend (prorated by revenue) and leaves it out of CAC; new customers come from different tables (1–25 Oct: Customer 90,342, Ads 94,191). Option a: Customer's definition everywhere (one CAC). Option b: keep both, labelled. Recommendation: a (see Ads D4).

### C4. LTV on revenue
LTV = revenue per customer over 12 months, and LTV:CAC "Healthy" uses a 3x bar meant for margin LTV. Option a: show LTV:CAC on CM1 (P&L D2C CM1 % × LTV) next to it. Option b: keep, labelled "on revenue" (done). Recommendation: a once C3 is decided.

### C5. Cross-sell lift includes the same-category diagonal
The diagonal is now greyed and out of the colour scale (display), but it is still in the row / column totals that the lift is computed from. Option a: exclude it from the lift maths too (lift values for other pairs change). Option b: keep. Recommendation: a. Also: the query is all-time with LIMIT 500 (totals truncated).

### C6. RFM mapping
"Others" = last order 90+ days ago, 1 order in 12 months, ≥ ₹5,000 spent; the ELSE branch also puts customers who bought 61–90 days ago with low frequency into "Hibernating". Option a: map those to "About To Sleep" (a segment the UI already defines but the SQL never produces). Option b: keep. Recommendation: a.

### C7. Support's default day before 11:00 IST
The default view is yesterday, but `cs_dashboard_unified` rebuilds at 11:00 IST, so before 11:00 yesterday is nearly empty (26 Oct at 02:30: 100 interactions vs ~3,500) and every card shows a ▼95%+ drop. Option a: before 11:00 IST default to the day before yesterday. Option b: keep yesterday and show "data loads at 11:00" when the day is still loading. Recommendation: b (an InfoStrip, no number change).
