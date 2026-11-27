// Which model answers: Sonnet for every question. Opus only for (a) planning questions ("Plan 40 days for a SKU"),
// (b) a question with an attached PDF / Excel / text file that needs reasoning (comparing, reconciling, checking),
// and (c) the one retry when the Sonnet answer fails the number check twice (decided in server.js). A photo alone is not Opus.
export const SONNET = 'claude-sonnet-4-6';
export const OPUS = 'claude-opus-4-7';
export function chooseModel(question, attachments = []) {
  const q = String(question || '');
  const plan = /\bplan(s|ning)?\b/i.test(q);
  const file = (attachments || []).some(a => a?.type === 'pdf' || a?.type === 'text')
    && /compar|reconcil|differ|variance|match|mismatch|analy|why|explain|verify|check|audit|cross.?check|vs\b|versus/i.test(q);
  return { model: plan || file ? OPUS : SONNET, why: plan ? 'plan' : file ? 'file' : null };
}
