// Filter icon for the phone page header (HEADER_MOBILE_PROMPT.md §3): 34 × 34, borderless, 16px
// icon; the number of active filters in a 14px green circle. Styles: index.css .mph-ib / .mph-count.
export default function HeaderFilterButton({ count = 0, onClick, label = 'Filters', disabled = false, className = '' }) {
  return (
    <button type="button" className={`mph-ib ${className}`} data-ctl="filter" onClick={onClick} disabled={disabled}
      aria-label={count ? `${label} (${count} active)` : label}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
      {count > 0 && <span className="mph-count">{count}</span>}
    </button>
  )
}
