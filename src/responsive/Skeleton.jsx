// Loading placeholder (docs/responsive/MOBILE_DESIGN_SYSTEM.md §4: "skeletons with fixed height,
// pointer-events:none"). Use it wherever a value is still loading - never a placeholder number
// ("0", "—") that could be read as data. Fixed size, so nothing moves when the value arrives.
// Shimmer style: .m-skeleton in index.css (mobile palette; no shimmer under prefers-reduced-motion).
export default function Skeleton({ width = '60%', height = 14, radius = 6, round = false, label = 'Loading', className = '', style }) {
  return (
    <span className={`m-skeleton ${className}`.trim()} role="status" aria-label={label}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, width, height, borderRadius: round ? '50%' : radius, ...style }} />
  )
}
