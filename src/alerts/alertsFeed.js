// The alerts bell's inputs, from /api/alerts (filtered on the server to the pages / channels this person can open;
// the raw alerts-*.json files are no longer served to the browser). One request, shared by both loaders:
// loadAlertsCache() in src/utils.js (fixed-window alerts) and loadAlertsPhase2() in ./phase2Rules.js.
import { authFetch } from '../authFetch.js'

let _feed = null
export function loadAlertsFeed() {
  if (!_feed) _feed = authFetch(`${import.meta.env.VITE_API_URL || ''}/api/alerts`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  return _feed
}
