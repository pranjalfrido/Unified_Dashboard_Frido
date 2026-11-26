import { useState, useEffect } from 'react';
import { setBusy } from '../silentUpdate.js';
import HistoryPanel from './HistoryPanel.jsx';
import ChatTopBar from './ChatTopBar.jsx';
import ChatThread from './ChatThread.jsx';
import ChatComposer from './ChatComposer.jsx';
import { sendMessage } from './mockData.js';
import PulseMobile from './PulseMobile.jsx';
import { useBreakpoint } from '../responsive/useBreakpoint.js';
import { cleanConversations, newChatId, titleFrom } from './pulseShared.js';

// History is saved per user (frido_pulse_conversations_<userId>), so the next person on a shared
// laptop doesn't see it. Chats saved under the old shared key move to the first user who opens Pulse.
const LEGACY_KEY = 'frido_pulse_conversations';
const keyFor = userId => `${LEGACY_KEY}_${userId}`;

function loadConversations(userId) {
  if (!userId) return [];
  try {
    let raw = localStorage.getItem(keyFor(userId));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (raw == null && legacy != null) {
      raw = legacy;
      localStorage.setItem(keyFor(userId), legacy);
    }
    if (legacy != null) localStorage.removeItem(LEGACY_KEY);
    // Saved history is cleaned on load: no empty chats, unique ids, named by the first question.
    return raw ? cleanConversations(JSON.parse(raw)) : [];
  } catch { return []; }
}

function saveConversations(userId, convs) {
  if (!userId) return;
  try {
    // Keep only last 50 conversations, trim messages to last 40 per conv to avoid storage limits
    // A chat is saved only once it has a question.
    const trimmed = convs.filter(c => c.messages.length).slice(0, 50).map(c => ({
      ...c,
      messages: c.messages.filter(m => !m.thinking).slice(-40),
    }));
    localStorage.setItem(keyFor(userId), JSON.stringify(trimmed));
  } catch {}
}

// areas: which quick-question areas the user can open (from the same access data as the sidebar).
export default function AskFridoPage({ userProfile, session, areas, canFiles = false }) {
  const userId = session?.user?.id;
  const [conversations, setConversations] = useState(() => loadConversations(userId));
  const [activeId, setActiveId] = useState(null);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [sending, setSending] = useState(false);

  const active = conversations.find(c => c.id === activeId) || null;
  // Phones get their own layout (same rule as the app's phone header and bottom bar).
  const bp = useBreakpoint();
  const phone = bp.width <= 768 || bp.isPhoneLandscape;

  // Persist to localStorage whenever conversations change
  useEffect(() => {
    saveConversations(userId, conversations);
  }, [userId, conversations]);

  // New question: back to the first view. Nothing is saved until a question is sent.
  function handleNew() {
    setActiveId(null);
  }

  function handleSelect(id) {
    setActiveId(id);
  }

  function handleDelete(id) {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  // Undo a delete: the chat goes back where it was.
  function handleRestore(conv, index) {
    setConversations(prev => prev.some(c => c.id === conv.id) ? prev : [...prev.slice(0, index), conv, ...prev.slice(index)]);
  }

  // extra = { attachments, chips } from the composer when files were attached (contents are used for this request only).
  async function handleSend(text, extra) {
    if (sending) return;

    // Auto-create a conversation if none is active
    let currentId = activeId;
    if (!currentId) {
      currentId = newChatId();
      const conv = { id: currentId, date: 'today', ts: Date.now(), title: titleFrom(text), category: null, messages: [] };
      setConversations(prev => [conv, ...prev]);
      setActiveId(currentId);
    }

    // Capture history BEFORE updating state (setConversations is async)
    const currentConv = conversations.find(c => c.id === currentId);
    const history = (currentConv?.messages || []).filter(m => !m.thinking && m.text);
    const messagesForApi = [...history, { role: 'user', text, ...(extra?.attachments ? { attachments: extra.attachments } : {}) }];

    // Add user message + thinking bubble
    setConversations(prev => prev.map(c => {
      if (c.id !== currentId) return c;
      const isFirst = c.messages.length === 0;
      return {
        ...c,
        title: isFirst ? titleFrom(text) : c.title,
        ts: Date.now(),
        messages: [
          ...c.messages,
          { id: 'm' + Date.now(), role: 'user', text, ...(extra?.chips?.length ? { files: extra.chips } : {}) },
          { id: 'thinking-' + Date.now(), role: 'assistant', thinking: true },
        ],
      };
    }));

    setSending(true); setBusy('navai-answer', true);
    try {
      const response = await sendMessage(messagesForApi, session?.access_token);
      setConversations(prev => prev.map(c => {
        if (c.id !== currentId) return c;
        const msgs = c.messages.filter(m => !m.thinking);
        return { ...c, messages: [...msgs, response] };
      }));
    } catch (err) {
      setConversations(prev => prev.map(c => {
        if (c.id !== currentId) return c;
        const msgs = c.messages.filter(m => !m.thinking);
        return {
          ...c, messages: [...msgs, {
            id: 'err' + Date.now(), role: 'assistant',
            text: err.message || 'Something went wrong. Please try again.',
          }]
        };
      }));
    } finally {
      setSending(false); setBusy('navai-answer', false);
    }
  }

  function handleSuggestion(text) { handleSend(text); }
  function handleClarifyChoice(choice) { handleSend(choice); }

  if (phone) {
    return (
      <PulseMobile conversations={conversations} activeId={activeId} active={active} sending={sending}
        userProfile={userProfile} areas={areas} canFiles={canFiles}
        onSelect={handleSelect} onNew={handleNew} onDelete={handleDelete} onRestore={handleRestore} onSend={handleSend} onClarifyChoice={handleClarifyChoice} />
    );
  }

  return (
    <div className={`af-page${historyVisible ? '' : ' af-history-hidden'}`}>
      {historyVisible && (
        <HistoryPanel
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
        />
      )}
      <div className="af-main">
        <ChatTopBar
          conversation={active}
          onToggleHistory={() => setHistoryVisible(v => !v)}
          historyVisible={historyVisible}
        />
        <ChatThread
          messages={active?.messages || []}
          onSuggestion={handleSuggestion}
          onClarifyChoice={handleClarifyChoice}
          isAdmin={userProfile?.isAdmin === true}
        />
        <ChatComposer onSend={handleSend} disabled={sending} canFiles={canFiles} />
      </div>
    </div>
  );
}
