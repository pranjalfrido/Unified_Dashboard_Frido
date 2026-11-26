// The P&L page's authFetch passes headers as a Headers object; the headless fetch must keep Content-Type (and add the secret).
//   node scripts/test-pnl-headers.mjs
process.env.NAVAI_API_SECRET = 'x'.repeat(40);
const { mergeHeaders } = await import('../lib/pnlHeadless.js');
let failed = 0;
const check = (n, ok) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}`); };
const a = mergeHeaders(new Headers({ 'Content-Type': 'application/json' }));
check('Headers object keeps Content-Type', a.get('content-type') === 'application/json');
check('adds x-navai-secret', a.get('x-navai-secret') === 'x'.repeat(40));
check('plain object keeps Content-Type', mergeHeaders({ 'Content-Type': 'application/json' }).get('content-type') === 'application/json');
check('undefined headers still gets the secret', mergeHeaders(undefined).get('x-navai-secret') === 'x'.repeat(40));
check('Authorization from the caller is kept', mergeHeaders(new Headers({ Authorization: 'Bearer t' })).get('authorization') === 'Bearer t');
process.exit(failed ? 1 : 0);
