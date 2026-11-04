// Shared by the laptop (HistoryPanel / ChatTopBar / ChatThread) and phone (PulseMobile) views.

// A chat is named by its first question: trimmed, spaces collapsed, first letter capitalised.
export function titleFrom(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ')
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

export function displayTitle(c) {
  if (!c) return ''
  const first = (c.messages || []).find(m => m.role === 'user' && m.text?.trim())
  return first ? titleFrom(first.text) : (c.title || 'New conversation')
}

// Ids must stay unique across page loads (a counter restarting at 1000 gave new chats the same id as
// saved ones, so several rows highlighted together and tapping a row opened a different chat).
export const newChatId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

// Clean saved history: drop chats with no messages, give duplicate ids a fresh one, name every chat by
// its first question.
export function cleanConversations(convs) {
  const seen = new Set()
  return (Array.isArray(convs) ? convs : [])
    .filter(c => c && c.messages?.some(m => !m.thinking))
    .map(c => {
      const id = c.id && !seen.has(c.id) ? c.id : newChatId()
      seen.add(id)
      return { ...c, id, title: displayTitle(c) }
    })
}

export const SUGGESTIONS = [
  'What is our RTO rate this week?',
  'Top 5 products by revenue this month',
  'Show inventory across all warehouses',
  'Compare Delhivery vs BlueDart delivery rate',
]

// Phone quick questions by area (shown only for areas the user can open). `fill` puts the text in the
// question box for the user to finish instead of sending it.
export const QUICK_QUESTIONS = [
  { area: 'sales', tag: 'Sales', label: 'D2C revenue yesterday', q: 'D2C revenue yesterday' },
  { area: 'sales', tag: 'Sales', label: 'Top 10 products this month', q: 'Top 10 products this month' },
  { area: 'logistics', tag: 'Logistics', label: 'RTO last month', q: 'RTO last month' },
  { area: 'returns', tag: 'Returns', label: 'D2C returns breakdown', q: 'D2C returns breakdown this month' },
  { area: 'inventory', tag: 'Inventory', label: 'Critical SKUs', q: 'Critical SKUs by inventory' },
  { area: 'planning', tag: 'Planning', label: 'Plan 40 days for a SKU', q: 'How much to plan for 40 days for SKU ', fill: true },
]

// Calendar day in IST, as a day number, for grouping by Today / Yesterday.
const istDay = ms => Math.floor((ms + 330 * 60000) / 86400000)

// Today / Yesterday / Previous 7 days, from each chat's last activity (`ts`); chats saved before
// timestamps existed use their stored `date`.
export function groupByDate(conversations, now = Date.now()) {
  const today = [], yesterday = [], week = []
  for (const c of conversations) {
    const d = c.ts ? istDay(now) - istDay(c.ts) : (c.date === 'today' ? 0 : c.date === 'yesterday' ? 1 : 2)
    if (d <= 0) today.push(c)
    else if (d === 1) yesterday.push(c)
    else week.push(c)
  }
  return { today, yesterday, week }
}

// "05:12" for today and yesterday, "27 Oct" for older chats (IST); blank when the chat has no time.
export function chatTime(c, now = Date.now()) {
  if (!c?.ts) return ''
  const opts = istDay(now) - istDay(c.ts) <= 1
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { day: 'numeric', month: 'short' }
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'Asia/Kolkata' }).format(c.ts)
}
