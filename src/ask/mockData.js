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
  // Only the message being sent carries file contents (m.attachments, in memory for this request). Saved chats keep
  // just the file names (m.files), so a follow-up needs the file attached again.
  const hasFiles = conversationMessages.some(m => m.attachments?.length);
  let res;
  try {
    res = await fetch('/api/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerToken,
        messages: conversationMessages
          .filter(m => m.text && m.text.trim())
          .map(m => ({
            role: m.role,
            content: m.text,
            ...(m.attachments?.length ? { attachments: m.attachments } : {}),
          })),
      }),
    });
  } catch {
    throw new Error(sendFailureMessage(0, '', hasFiles));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(sendFailureMessage(res.status, err.error, hasFiles));
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

// One plain sentence per cause (never the bare "Chat failed"). Server messages that already explain themselves
// (login, access, billing, "I ran N data requests...") are kept as they are.
export function sendFailureMessage(status, serverMsg = '', hasFiles = false) {
  if (status === 0) return 'Network problem, try again.';
  if (status === 413) return hasFiles ? 'Photo too large, try a screenshot.' : 'This message is too large. Shorten it and try again.';
  if (status === 408 || status === 504) return 'NavAI took too long, try again.';
  if (status === 401 || status === 403 || status === 429 || status === 503) return serverMsg || `Server error ${status}`;
  if (status === 400 && hasFiles && !serverMsg) return "Couldn't read this image or file. Try a screenshot.";
  if (/^chat failed/i.test(serverMsg || '') || (!serverMsg && status >= 500)) {
    return hasFiles ? "NavAI couldn't answer with this file. Try again, or try a screenshot." : "NavAI couldn't answer this time. Try again.";
  }
  return serverMsg || `Server error ${status}`;
}
