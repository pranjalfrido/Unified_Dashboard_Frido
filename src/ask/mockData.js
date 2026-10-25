export const MOCK_HISTORY = [];

export const CATEGORY_COLORS = {
  Logistics: { bg: '#FEF3C7', text: '#92400E' },
  Sales: { bg: '#DBEAFE', text: '#1E40AF' },
  Inventory: { bg: '#D1FAE5', text: '#065F46' },
  'P&L': { bg: '#EDE9FE', text: '#5B21B6' },
  Ads: { bg: '#FCE7F3', text: '#9D174D' },
  Customer: { bg: '#E0F2FE', text: '#0C4A6E' },
};

const CONNECTOR_URL = 'https://frido-data-connector-hjcnlcg4mq-el.a.run.app';
const CONNECTOR_API_KEY = 'f5e4fd36fe9b0fa4bce39a20b18ec70d78e2e41028a5958bb27c5fdd184fc7b2';

export async function sendMessage(conversationMessages) {
  const res = await fetch(`${CONNECTOR_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONNECTOR_API_KEY,
    },
    body: JSON.stringify({
      messages: conversationMessages.map(m => ({
        role: m.role,
        content: m.text || '',
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
