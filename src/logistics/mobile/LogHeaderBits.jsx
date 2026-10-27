import HeaderFilterButton from '../../responsive/HeaderFilterButton.jsx'

// Small controls for the Logistics phone header (Ivory, index.css .mph-*): filter icon with a count,
// and the Cost month pill ("Apr – Jul 26", mint like the date pill) that opens the MonthRangePicker sheet.
export function HeaderFilterIcon({ count = 0, onClick, label = 'Filters' }) {
  return (
    <HeaderFilterButton className="log-filter-btn" count={count} onClick={onClick} label={label} />
  )
}

export function HeaderMonthPill({ label, onClick }) {
  return (
    <button type="button" className="mrp-pill mph-pill" aria-haspopup="dialog" aria-label={`Billing months: ${label}`} onClick={onClick}>
      {label}
      <svg className="drp-chev" width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
    </button>
  )
}
