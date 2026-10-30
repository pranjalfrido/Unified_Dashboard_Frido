// NavAI mark: a magnifier with two sparkles. Drop-in for the phosphor icons (accepts size, ignores weight);
// everything is drawn in currentColor so it follows the theme and the selected-tab colour.
export default function NavAIIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style} className={className}>
      <circle cx="10.5" cy="10.5" r="6.8" />
      <path d="M15.5 15.5 20.5 20.5" />
      <path fill="currentColor" d="M10.5 6.9C11.4 9.6 11.4 9.6 14.1 10.5C11.4 11.4 11.4 11.4 10.5 14.1C9.6 11.4 9.6 11.4 6.9 10.5C9.6 9.6 9.6 9.6 10.5 6.9z" />
      <path fill="currentColor" d="M19.6 2.1C20.05 3.45 20.05 3.45 21.4 3.9C20.05 4.35 20.05 4.35 19.6 5.7C19.15 4.35 19.15 4.35 17.8 3.9C19.15 3.45 19.15 3.45 19.6 2.1z" />
    </svg>
  )
}
