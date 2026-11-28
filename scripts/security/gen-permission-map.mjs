// Run: node scripts/security/gen-permission-map.mjs   -> writes docs/PERMISSION_MAP.md from api/_permissionMap.js
import { writeFileSync } from 'node:fs'
import { API_RULES, ACTION_RULES, FILE_RULES } from '../../api/_permissionMap.js'

const specs = a => a.map(s => '`' + s + '`').join(', ')
const out = []
out.push('# Page permissions on the server', '',
  'Generated from `api/_permissionMap.js` by `node scripts/security/gen-permission-map.mjs`. Edit the map, then regenerate. `middleware.js` applies it after the token and active-user checks.', '',
  '- A person passes with **any one** listed key. **Admins pass everything.** `sales*` means the key `sales` or any `sales:...` key.',
  '- `any` = any permission at all (data every screen loads, filtered per person in the browser). `self` = the route checks the caller itself. `admin` = admins only.',
  '- A route or file that is not in this table is **admin only** (new things start closed).',
  '- Unchanged and checked before this map: cron / scheduler secret, `x-navai-secret` (NavAI applies the asking person\'s own access), GitHub Actions precompute (cron secret), `auth-admin`, `pulse`.',
  '- `PERMISSION_ENFORCE`: `log` (default) never blocks and records would-be denials (Vercel log line + `/api/permission-denials`, admin only); `enforce` answers 403 `{"error":"No access to this data"}`.', '',
  '## API routes', '', '| Route | Allowed keys | Used by |', '|---|---|---|')
for (const [r, k, n] of API_RULES) out.push(`| \`/api/${r}\` | ${specs(k)} | ${n} |`)
out.push('', '### Actions decided by the request body', '', '| Route | Action | Allowed keys |', '|---|---|---|')
for (const [r, acts] of Object.entries(ACTION_RULES)) for (const [a, k] of Object.entries(acts)) out.push(`| \`/api/${r}\` | \`${a}\` | ${specs(k)} |`)
out.push('', 'There is no separate "manage" key in the permission tree for Cost Analytics, and the app never calls these three actions from the browser, so they are admin only.', '',
  '## Files in public/', '', '| File | Allowed keys | Used by |', '|---|---|---|')
for (const [f, k, n] of FILE_RULES) out.push(`| \`${typeof f === 'string' ? f : f.source.replace(/\\\//g, '/')}\` | ${specs(k)} | ${n} |`)
out.push('', 'Any other file that needs a login (`.json`, `.bak`, `.csv`, ... see `middleware.js` `needsLogin`) is admin only.', '')
writeFileSync(new URL('../../docs/PERMISSION_MAP.md', import.meta.url), out.join('\n'))
console.log('wrote docs/PERMISSION_MAP.md')
