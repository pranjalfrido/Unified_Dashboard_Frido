export const MOCK_HISTORY = [];

export const CATEGORY_COLORS = {
  Logistics: { bg: '#FEF3C7', text: '#92400E' },
  Sales: { bg: '#DBEAFE', text: '#1E40AF' },
  Inventory: { bg: '#D1FAE5', text: '#065F46' },
  'P&L': { bg: '#EDE9FE', text: '#5B21B6' },
  Ads: { bg: '#FCE7F3', text: '#9D174D' },
  Customer: { bg: '#E0F2FE', text: '#0C4A6E' },
};

export async function sendMessage(conversationMessages, callerToken) {
  const res = await fetch('/api/pulse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callerToken,
      messages: conversationMessages
        .filter(m => m.text && m.text.trim())
        .map(m => ({
          role: m.role,
          content: m.text,
        })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }

  const data = await res.json();
  return {
    id: 'r' + Date.now(),
    role: 'assistant',
    text: data.text || 'No response received.',
    sql: data.sql || null,
    model: data.model || null,
  };
}
