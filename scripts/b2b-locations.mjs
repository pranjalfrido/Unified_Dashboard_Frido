// B2B location normalisation: satellite towns folded into the metro they belong to.
//
// WHY: the ledger records the exact pickup/drop point, so one real lane is split across
// several rows and counted separately. Measured on 1,742 trips, the three biggest
// "locations" are all satellites, not cities:
//   Vadgaon, Pune  846 trips ₹181.91 L · BHAJGHERA, GURGAON 442 ₹60.22 L · Sudhwadi, Pune 293 ₹28.53 L
// With 84 raw values across 134 "lanes", no lane has enough trips to benchmark a rate, and
// Pune appears as at least nine different origins. This is the same defect that made lane
// analysis unusable on the B2C tab (Mumbai / MUMBAI / mumbai).
//
// SCOPE: only towns inside a metro's own freight catchment are folded. A town that is a
// genuinely separate destination keeps its own identity even when it is nearby — Nashik,
// Vapi, Agra and Ghaziabad are their own markets and are NOT folded into anything, because
// merging them would hide a real rate difference rather than reveal one.

// Satellite -> metro. Keys are matched case-insensitively against the whole string first,
// then as word-ish fragments, so both "Vadgaon, Pune" and a bare "VADGAON" resolve.
const SATELLITE = {
  // ── Pune ── Chakan/Talegaon/Ranjangaon industrial belt, all inside Pune's catchment
  'vadgaon': 'Pune', 'sudhwadi': 'Pune', 'pisoli': 'Pune', 'katraj': 'Pune',
  'chakan': 'Pune', 'talawade': 'Pune', 'talwade': 'Pune', 'shikrapur': 'Pune',
  'kesanad': 'Pune', 'vadki': 'Pune', 'sanaswadi': 'Pune', 'ranjangaon': 'Pune',
  'ambethan': 'Pune', 'mohitewadi': 'Pune', 'digrajwadi': 'Pune', 'khed shiapur': 'Pune',
  'lonavala': 'Pune', 'khopoli': 'Pune',

  // ── Delhi NCR ── Gurgaon/Sonipat/Bahadurgarh ring plus the Delhi-city drop points.
  // Held as ONE market because that is how the freight is quoted: a Gurgaon rate and a
  // Bahadurgarh rate are the same lane commercially.
  'bhajghera': 'Delhi NCR', 'bhajgera': 'Delhi NCR', 'farukh nagar': 'Delhi NCR',
  'farukhnagar': 'Delhi NCR', 'gurgaon': 'Delhi NCR', 'ggn': 'Delhi NCR',
  'manaser': 'Delhi NCR', 'manesar': 'Delhi NCR', 'khandsa': 'Delhi NCR',
  'basai': 'Delhi NCR', 'binola': 'Delhi NCR', 'bahadurgarh': 'Delhi NCR',
  'sonipat': 'Delhi NCR', 'kundli': 'Delhi NCR', 'panipat': 'Delhi NCR',
  'faridabad': 'Delhi NCR', 'ghaziabad': 'Delhi NCR', 'dadri': 'Delhi NCR',
  'bhora kalan': 'Delhi NCR', 'sehsaula': 'Delhi NCR', 'bilaspur': 'Delhi NCR',
  'nangloi': 'Delhi NCR', 'samaypur': 'Delhi NCR', 'mundka': 'Delhi NCR',
  'badli': 'Delhi NCR', 'wazirpur': 'Delhi NCR', 'patparganj': 'Delhi NCR',
  'new delhi': 'Delhi NCR', 'delhi': 'Delhi NCR',

  // ── Mumbai ── Bhiwandi and Taloja are Mumbai's warehousing belt
  'bhiwandi': 'Mumbai', 'taloja': 'Mumbai', 'chembur': 'Mumbai',

  // ── Bangalore ──
  'hoskote': 'Bangalore', 'debaspet': 'Bangalore', 'dabaspet': 'Bangalore',
  'hkr2': 'Bangalore',
}

// Bare spellings of the metros themselves, so casing and stray codes collapse too.
const CANON = {
  'pune': 'Pune', 'mumbai': 'Mumbai', 'bangalore': 'Bangalore', 'bengaluru': 'Bangalore',
  'hyderabad': 'Hyderabad', 'chennai': 'Chennai', 'kolkata': 'Kolkata',
  'ahmedabad': 'Ahmedabad', 'surat': 'Surat', 'nashik': 'Nashik', 'nagpur': 'Nagpur',
  'agra': 'Agra', 'kanpur': 'Kanpur', 'lucknow': 'Lucknow', 'indore': 'Indore',
  'bhopal': 'Bhopal', 'coimbatore': 'Coimbatore', 'pondicherry': 'Pondicherry',
  'vapi': 'Vapi', 'mehsana': 'Mehsana', 'sangli': 'Sangli', 'latur': 'Latur',
  'nanded': 'Nanded',
}

// Noise that carries no location meaning: warehouse codes and booking flags.
// "APPOINTMENT" is a delivery-slot marker, not a place — "HYDERABAD, APPOINTMENT" and
// "HYDERABAD" are the same city and must not be two rows.
const NOISE = /\b(appointment|hbx\d*|ded\d*|del\d*|hnr\d*|hkr\d*|sdeg|ggn\s*\d*|gujrat|gujarat|haryana)\b/gi

// Bare state names and warehouse codes that survive NOISE stripping. Not freight markets,
// so they resolve to null and surface as unmapped instead of inventing a city.
const NOT_A_PLACE = new Set(['gujarat', 'gujrat', 'haryana', 'sdeg', ''])

// Multi-stop trips ("SONIPAT + BASAI"). Both halves usually resolve to the same metro, in
// which case that metro is the answer; when they differ the trip really does span two
// markets, so it is labelled as such rather than silently attributed to one.
const SPLIT = /\s*(?:\+|&)\s*/

function resolveOne(raw) {
  let s = String(raw || '').replace(NOISE, ' ').replace(/[.,]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!s || NOT_A_PLACE.has(s)) return null
  // Longest key first, so "new delhi" wins over "delhi" and "khed shiapur" over nothing.
  const keys = Object.keys(SATELLITE).sort((a, b) => b.length - a.length)
  for (const k of keys) if (s.includes(k)) return SATELLITE[k]
  for (const k of Object.keys(CANON).sort((a, b) => b.length - a.length)) {
    if (s.includes(k)) return CANON[k]
  }
  // Unrecognised: Title Case the cleaned string so it is still readable and groupable,
  // rather than dropped or lumped into an "Other" bucket that hides real spend.
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// Public: raw ledger location -> canonical market name.
export function normalizeLocation(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const parts = String(raw).split(SPLIT).map(resolveOne).filter(Boolean)
  if (!parts.length) return null
  const uniq = [...new Set(parts)]
  return uniq.length === 1 ? uniq[0] : uniq.sort().join(' + ')
}

// SQL equivalent, so the API can group without round-tripping every row through JS.
// Built from the same tables above — one source of truth, so the two cannot drift.
export function locationSql(col) {
  // Postgres word boundary is y, and its regex dialect differs enough that deriving this
  // from NOISE.source silently corrupted d and s. Written out, with scripts/_t2 asserting
  // both paths agree on every value in the ledger.
  const noiseSql = '[[:<:]](appointment|hbx[0-9]*|ded[0-9]*|del[0-9]*|hnr[0-9]*|hkr[0-9]*|sdeg|ggn[ ]*[0-9]*|gujrat|gujarat|haryana)[[:>:]]'
  const clean = `regexp_replace(regexp_replace(lower(${col}), '${noiseSql}', ' ', 'gi'), '[.,]+', ' ', 'g')`
  const entries = [
    ...Object.entries(SATELLITE).map(([k, v]) => [k, v]),
    ...Object.entries(CANON).map(([k, v]) => [k, v]),
  ].sort((a, b) => b[0].length - a[0].length)
  const whens = entries
    .map(([k, v]) => `WHEN ${clean} LIKE '%${k}%' THEN '${v}'`)
    .join('\n           ')
  const notPlaceLit = [...NOT_A_PLACE].filter(Boolean).map(v => `'${v}'`).join(', ')
  return `CASE
           WHEN ${col} IS NULL OR btrim(${col}) = '' THEN NULL
           WHEN btrim(regexp_replace(${clean}, '[ ]+', ' ', 'g')) = '' THEN NULL
           WHEN btrim(regexp_replace(${clean}, '[ ]+', ' ', 'g')) = ANY(ARRAY[${notPlaceLit}]) THEN NULL
           ${whens}
           ELSE initcap(btrim(regexp_replace(${clean}, '\s+', ' ', 'g')))
         END`
}
