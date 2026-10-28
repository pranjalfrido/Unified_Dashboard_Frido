// Shared by the laptop (HistoryPanel / ChatTopBar / ChatThread) and phone (PulseMobile) views.

// A chat with no title yet shows its first question (trimmed) instead of "New conversation";
// display only — the stored title is unchanged.
export function displayTitle(c) {
  if (!c) return ''
  if (c.title && c.title !== 'New conversation') return c.title
  const first = (c.messages || []).find(m => m.role === 'user' && m.text?.trim())
  return first ? first.text.trim().replace(/\s+/g, ' ') : (c.title || 'New conversation')
}

export const SUGGESTIONS = [
  'What is our RTO rate this week?',
  'Top 5 products by revenue this month',
  'Show inventory across all warehouses',
  'Compare Delhivery vs BlueDart delivery rate',
]

// Today / Yesterday / Previous 7 days, from each conversation's stored `date`.
export function groupByDate(conversations) {
  const today = [], yesterday = [], week = []
  for (const c of conversations) {
    if (c.date === 'today') today.push(c)
    else if (c.date === 'yesterday') yesterday.push(c)
    else week.push(c)
  }
  return { today, yesterday, week }
}
