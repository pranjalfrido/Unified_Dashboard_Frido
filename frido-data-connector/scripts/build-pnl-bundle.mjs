// TEMPORARY COPY of the P&L page logic for the Pulse `pnl` tool (replace with a shared module — see docs/BACKLOG.md).
// Bundles the dashboard's own src/pnl/PnLPage.jsx (from origin/main, byte-for-byte, plus ONE line that also reports
// the page's kpiSummary through its existing summaryOnly/onSummary hook) into vendor/pnl/pnl-bundle.mjs.
// The P&L formulas are therefore the page's own code, not a re-implementation.
//   node scripts/build-pnl-bundle.mjs [gitRef]      (default origin/main)
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { createHash as hash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const ref = process.argv[2] || 'origin/main';
const work = path.join(here, '..', '.pnl-src');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const workPosix = work.split(path.sep).join('/');
execSync(`git archive ${ref} src | tar --force-local -x -C "${workPosix}"`, { cwd: repo, stdio: 'inherit', shell: 'bash' });

// the one patch: expose kpiSummary (CM1 %, COGS %, marketing % …) through the page's own onSummary callback
const pagePath = path.join(work, 'src', 'pnl', 'PnLPage.jsx');
let page = readFileSync(pagePath, 'utf8');
const marker = 'onSummary({\n      gross: activeData.gross,';
const marker2 = 'onSummary({\r\n      gross: activeData.gross,';
if (page.includes(marker)) page = page.replace(marker, 'onSummary({\n      kpi: kpiSummary,\n      gross: activeData.gross,');
else if (page.includes(marker2)) page = page.replace(marker2, 'onSummary({\r\n      kpi: kpiSummary,\r\n      gross: activeData.gross,');
else throw new Error('PnLPage.jsx onSummary call changed — update scripts/build-pnl-bundle.mjs');
writeFileSync(pagePath, page);
writeFileSync(path.join(work, 'entry.jsx'), "export { default } from './src/pnl/PnLPage.jsx';\n");

await build({
  entryPoints: [path.join(work, 'entry.jsx')],
  outfile: path.join(here, '..', 'vendor', 'pnl', 'pnl-bundle.mjs'),
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', target: 'node22', logLevel: 'warning',
  nodePaths: [path.join(repo, 'node_modules')],
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.woff2': 'empty', '.woff': 'empty' },
  define: {
    'import.meta.env': JSON.stringify({ VITE_API_URL: 'https://frido-navigator.vercel.app', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'x', DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }),
  },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
const sha = hash('sha256').update(readFileSync(path.join(here, '..', 'vendor', 'pnl', 'pnl-bundle.mjs'))).digest('hex');
const srcSha = execSync(`git rev-parse ${ref}`, { cwd: repo }).toString().trim();
writeFileSync(path.join(here, '..', 'vendor', 'pnl', 'SOURCE.txt'), `source: ${ref} @ ${srcSha}\nbundle sha256: ${sha}\nTEMPORARY copy of PnLPage logic — replace with a shared module (docs/BACKLOG.md)\n`);
rmSync(work, { recursive: true, force: true });
console.log('built vendor/pnl/pnl-bundle.mjs', ref, srcSha.slice(0, 8));
