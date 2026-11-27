// Which model answers: Sonnet for every normal question. Opus only for
//   (a) planning questions ("Plan 40 days for a SKU"),
//   (b) analysis requests (liquidate / push for sale / slow-moving / high-DOI, "ask me questions before starting", several criteria at once),
//   (c) a question with an attached PDF / Excel / text file that needs reasoning (comparing, reconciling, checking),
//   (d) the one retry when the Sonnet answer fails the number check twice (decided in server.js).
// A photo alone is not Opus. Planning and analysis questions also get a longer tool loop (12 steps instead of 6).
export const SONNET = 'claude-sonnet-4-6';
export const OPUS = 'claude-opus-4-7';
export const NORMAL_STEPS = 6;
export const ANALYSIS_STEPS = 12;
const ANALYSIS = /liquidat|push (it |them )?for sale|clear(ing)? (the )?(excess |slow |old )?stock|excess stock|slow.?moving|high.?doi|dead stock|multi.?factor|ask me (some |a few )?questions|questions before (you )?start|before (you )?start(ing)?/i;
export function chooseModel(question, attachments = []) {
  const q = String(question || '');
  const plan = /\bplan(s|ning)?\b/i.test(q);
  const analysis = ANALYSIS.test(q);
  const file = (attachments || []).some(a => a?.type === 'pdf' || a?.type === 'text')
    && /compar|reconcil|differ|variance|match|mismatch|analy|why|explain|verify|check|audit|cross.?check|vs\b|versus/i.test(q);
  const opus = plan || file; // analysis questions stay on Sonnet: the connector computes every number
  return { model: opus ? OPUS : SONNET, why: plan ? 'plan' : file ? 'file' : analysis ? 'analysis' : null, steps: plan || analysis ? ANALYSIS_STEPS : NORMAL_STEPS };
}
