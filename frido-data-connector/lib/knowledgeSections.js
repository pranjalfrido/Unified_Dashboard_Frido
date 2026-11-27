// Knowledge on demand. The knowledge files are split into sections; a short "always" part goes with every question and the topic
// sections (revenue SQL, logistics SQL, inventory, OOS, planning, returns, P&L ...) only when the question (or the chat so far) is about
// that topic. A question that matches no topic gets everything, as before. The model can ask for a topic it is missing with the
// `load_knowledge` tool, and the prompt lists which sections were left out.
// Pure functions; the files are read by server.js.

export const TOPICS = ['sales', 'returns', 'logistics', 'inventory', 'oos', 'plan', 'pnl'];

// Words in the chat that switch a topic on (broad on purpose: leaving a section out is worse than adding one).
const KEYWORDS = {
  sales: /revenue|sales|sold|selling|gross|net\b|gmv|aov|asp\b|orders?\b|cancel|discount|channel|d2c|amazon|flipkart|blinkit|zepto|instamart|myntra|firstcry|cred\b|ebo\b|offline|marketplace|category|categories|product|sku|brand|growth|vs\b|compare|top \d+|best|worst/i,
  returns: /return|rto|refund|cir\b|exchange|rvp|reverse/i,
  logistics: /logistic|courier|delhivery|blue ?dart|ekart|shadowfax|xpress|shipment|shipping|awb|delivery|delivered|tat\b|edd\b|pickup|pick-up|stuck|ndr|zone|clickpost|\bcn\b|credit note|freight|weight|dispute|lost|damage|sla\b|ageing|aging|ftl|ptl|3pl|invoice/i,
  inventory: /inventor|liquidat|slow.?moving|high.?doi|push for sale|excess|cover days|days of cover|stock|doi\b|warehouse|facility|inward|grn\b|dead|excess|critical|cogs|value at cost|units|allocation|transfer|dark store|dc\b|fulfil/i,
  oos: /\boos\b|out.of.stock|stock.?out|avg.?daily|average daily|daily sale|run.?rate|loss of sales|days out/i,
  plan: /\bplan|reorder|replenish|how much to (order|transfer)|forecast|days of cover|cover for/i,
  pnl: /p&l|pnl|profit|margin|cm1|cm2|snd\b|s&d|marketing|roas|\bads?\b|ad spend|spend|cac\b|customers?\b|ltv|retention|repeat|support|ticket|breakeven|cogs/i,
};

// CLAUDE.md section titles -> the topics that need them. A title that matches nothing here is ALWAYS sent.
const CLAUDE_RULES = [
  [/EXACT formula for Gross Revenue/i, ['sales']],
  [/EXACT formula for Net Revenue/i, ['sales', 'returns']],
  [/EXACT formula for CIR/i, ['sales', 'returns']],
  [/EXACT SQL for Logistics Performance/i, ['logistics', 'returns']],
  [/EXACT SQL for Stuck Shipments/i, ['logistics']],
  [/EXACT SQL template for SKU-level revenue/i, ['sales']],
  [/EXACT SQL template for revenue by channel/i, ['sales']],
  [/EXACT query for total inventory/i, ['inventory']],
  [/EXACT SQL for Returns/i, ['returns', 'sales']],
  [/Inventory critical \/ planning questions/i, ['inventory', 'plan']],
  [/COGS and P&L answers/i, ['pnl']],
  [/EXACT SQL for SKU return/i, ['returns']],
  [/RTO % — there is no revenue-based RTO/i, ['returns', 'logistics']],
  [/EXACT formula for Avg Daily Sale/i, ['oos', 'plan', 'inventory']],
  [/Planning avg daily sale/i, ['plan', 'oos']],
];
// ENDPOINT_MAP.md "## Group ..." titles -> topics (the header text and any other title is always sent)
const MAP_RULES = [
  [/^## Group 1 /, ['logistics']],
  [/^## Group 2b /, ['logistics']],
  [/^## Group 2 /, ['logistics']],
  [/^## Group 3[bcd]? /, ['inventory', 'oos', 'plan']],
  [/^## Group 4 /, ['sales', 'returns']],
  [/^## Group 5 /, ['pnl']],
];

const split = md => String(md || '').split(/\n(?=## )/);
const title = s => s.split('\n')[0].trim();
function classify(sections, rules) {
  return sections.map((text, i) => {
    const t = title(text);
    if (i === 0 || !t.startsWith('## ')) return { text, topics: null };
    const hit = rules.find(([re]) => re.test(t));
    return { text, topics: hit ? hit[1] : null, title: t };
  });
}

// Topics the conversation is about: the user's messages (all of them, so a follow-up like "and for Bluedart?" keeps the topic).
export function topicsFor(userTexts) {
  const text = (Array.isArray(userTexts) ? userTexts : [userTexts]).map(String).join('\n');
  const hit = TOPICS.filter(t => KEYWORDS[t].test(text));
  if (hit.length === 0 || hit.length > 4) return [...TOPICS]; // nothing recognised (or nearly everything): send everything
  return hit;
}

// { always, selected, left } text for one conversation. `files` = { claude, map }; the playbook and metrics files go in `always` as they are.
export function buildKnowledge(files, userTexts) { return buildForTopics(files, topicsFor(userTexts)); }
export function buildForTopics({ claude, map, playbook, metrics }, topics) {
  const pieces = [...classify(split(claude), CLAUDE_RULES).map(x => ({ ...x, src: 'claude' })), ...classify(split(map), MAP_RULES).map(x => ({ ...x, src: 'map' }))];
  const always = [], chosen = [], left = [];
  for (const p of pieces) {
    if (!p.topics) always.push(p);
    else if (p.topics.some(t => topics.includes(t))) chosen.push(p);
    else left.push(p);
  }
  const join = xs => xs.map(x => x.text).join('\n\n');
  const alwaysText = [join(always.filter(x => x.src === 'claude')), playbook, metrics, join(always.filter(x => x.src === 'map'))].filter(Boolean).join('\n\n---\n\n');
  const selectedText = join(chosen);
  const index = left.length
    ? `## Knowledge not loaded for this question\nThese sections exist but were left out because the question is not about them: ${left.map(x => x.title.replace(/^## /, '').replace(/ — use this.*$/, '')).join('; ')}. If you need one, call the load_knowledge tool with its topic (${TOPICS.join(', ')}).`
    : '';
  return { topics, always: alwaysText, selected: [selectedText, index].filter(Boolean).join('\n\n'), leftCount: left.length, pieces };
}

// Text of the sections for given topics (the load_knowledge tool).
export function sectionsForTopics(files, topics) {
  const want = (topics || []).filter(t => TOPICS.includes(t));
  if (!want.length) return `Unknown topic. Topics: ${TOPICS.join(', ')}.`;
  const k = buildForTopics(files, want);
  return k.selected.split('\n\n## Knowledge not loaded')[0] || 'No sections for that topic.';
}
