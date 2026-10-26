import { useState, useEffect } from 'react';
import HistoryPanel from './HistoryPanel.jsx';
import ChatTopBar from './ChatTopBar.jsx';
import ChatThread from './ChatThread.jsx';
import ChatComposer from './ChatComposer.jsx';
import { sendMessage } from './mockData.js';

let nextId = 1000;

const STORAGE_KEY = 'frido_pulse_conversations';

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversations(convs) {
  try {
    // Keep only last 50 conversations, trim messages to last 40 per conv to avoid storage limits
    const trimmed = convs.slice(0, 50).map(c => ({
      ...c,
      messages: c.messages.filter(m => !m.thinking).slice(-40),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export default function AskFridoPage({ userProfile }) {
  const [conversations, setConversations] = useState(() => loadConversations());
  const [activeId, setActiveId] = useState(null);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [sending, setSending] = useState(false);

  const active = conversations.find(c => c.id === activeId) || null;

  // Persist to localStorage whenever conversations change
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  function handleNew() {
    const id = 'new-' + (++nextId);
    const conv = { id, date: 'today', title: 'New conversation', category: null, messages: [] };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
  }

  function handleSelect(id) {
    setActiveId(id);
  }

  function handleDelete(id) {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function handleSend(text) {
    if (sending) return;

    // Auto-create a conversation if none is active
    let currentId = activeId;
    if (!currentId) {
      currentId = 'new-' + (++nextId);
      const conv = { id: currentId, date: 'today', title: text.slice(0, 60), category: null, messages: [] };
      setConversations(prev => [conv, ...prev]);
      setActiveId(currentId);
    }

    // Add user message + thinking bubble
    setConversations(prev => prev.map(c => {
      if (c.id !== currentId) return c;
      const isFirst = c.messages.length === 0;
      return {
        ...c,
        title: isFirst ? text.slice(0, 60) : c.title,
        messages: [
          ...c.messages,
          { id: 'm' + Date.now(), role: 'user', text },
          { id: 'thinking-' + Date.now(), role: 'assistant', thinking: true },
        ],
      };
    }));

    setSending(true);
    try {
      const currentConv = conversations.find(c => c.id === currentId);
      const history = (currentConv?.messages || []).filter(m => !m.thinking);
      const messagesForApi = [...history, { role: 'user', text }];

      const response = await sendMessage(messagesForApi);
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
      setSending(false);
    }
  }

  function handleSuggestion(text) { handleSend(text); }
  function handleClarifyChoice(choice) { handleSend(choice); }

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
        />
        <ChatComposer onSend={handleSend} disabled={sending} />
      </div>
    </div>
  );
}
