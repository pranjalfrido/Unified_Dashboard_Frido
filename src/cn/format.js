// The one number format of the CN Received page. Amounts here are never negative (the
// database refuses negative CN amounts), so anything that isn't a finite amount ≥ 0 — a
// missing invoice value, a stray negative — renders as "—" rather than as a misleading number.

const valid = (v) => v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

// Compact INR: ≥1 Cr → "₹x.xx Cr", ≥1 L → "₹x.xx L", ≥1 K → "₹x.xx K", else "₹x". Real zero is "₹0".
export function formatInr(v) {
  if (!valid(v)) return "—";
  const n = Number(v);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(2)} K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// Exact INR to the rupee, with Indian digit grouping: the line under each card and the
// tooltip on every compact amount.
export function formatInrFull(v) {
  if (!valid(v)) return "—";
  return `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
}

// A ratio (0.074) as "7.4%"; "—" when there is nothing to divide by.
export function formatPct(ratio) {
  return ratio == null || !Number.isFinite(ratio) ? "—" : `${(ratio * 100).toFixed(1)}%`;
}

// Received CN as a share of invoice value. NULL when the invoice value is missing or 0, so the
// page shows "—" instead of Infinity or NaN.
export function receivedShareOfInvoice(received, invoice) {
  if (!valid(received) || !valid(invoice) || Number(invoice) === 0) return null;
  return Number(received) / Number(invoice);
}
