import { useState, useRef, useEffect } from 'react';

const FLASH_API_BASE = import.meta.env.VITE_FLASH_API_URL || 'http://localhost:3001/api';
// When using the Vercel proxy, paths become query params to avoid SPA rewrite conflicts
const flashUrl = (path) => FLASH_API_BASE.includes('flash-proxy')
  ? `${FLASH_API_BASE}?path=/${path}`
  : `${FLASH_API_BASE}/${path}`;

const SUGGESTED_QUESTIONS = [
  'What is revenue from all platforms this week?',
  'How many pending shipments today?',
  'Which SKU is selling the most this month?',
  'What is our RTO rate this week?',
  'Show inventory at all warehouses',
  'Top 5 products by revenue this month',
  'How many open customer tickets today?',
  'COGS vs revenue this month',
];

export default function FlashPage({ userEmail = '' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  async function sendMessage(question, clarifications = {}, skipAmbiguityCheck = false) {
    if (!question.trim() || loading) return;

    const userMsg = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 180s timeout

    try {
      const res = await fetch(flashUrl('chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId, userEmail, clarifications, skipAmbiguityCheck }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();

      if (data.type === 'product_search') {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'product_search',
          question,
          searchTerm: data.searchTerm,
          products: data.products,
        }]);
      } else if (data.type === 'clarification') {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'clarification',
          question,
          ambiguities: data.ambiguities,
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: data.messageId || crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          headline: data.headline,
          chart_type: data.chart_type,
          data: data.data || [],
          confidence: data.confidence,
          timing: data.timing,
        }]);
      }
    } catch (err) {
      clearTimeout(timeout);
      const msg = err.name === 'AbortError'
        ? 'Request timed out (>3min). Try a simpler question or narrower date range.'
        : 'Could not reach FLASH backend. Make sure it is running on port 3001.';
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: msg,
        confidence: 0,
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(messageId, rating) {
    await fetch(flashUrl('chat/feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, userEmail, rating })
    });
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, feedback: rating } : m
    ));
  }

  function handleClarification(originalQuestion, ambiguity, option) {
    setMessages(prev => prev.filter(m => m.role !== 'clarification'));
    sendMessage(originalQuestion, { [ambiguity.field]: option }, true);
  }

  function handleProductSelect(originalQuestion, product) {
    setMessages(prev => prev.filter(m => m.role !== 'product_search'));
    sendMessage(originalQuestion, {
      selected_product: product.product_name,
      selected_sku: product.sku_code,
    }, true);
  }

  return (
    <div className="flash-container">
      <div className="flash-header">
        <span className="flash-logo">⚡</span>
        <div>
          <h2 className="flash-title">FLASH</h2>
          <p className="flash-subtitle">Frido Live Analytics & Smart Hub</p>
        </div>
      </div>

      <div className="flash-messages">
        {messages.length === 0 && (
          <div className="flash-welcome">
            <p className="flash-welcome-text">Ask anything about Frido's data</p>
            <div className="flash-suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} className="flash-suggestion" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' && (
              <div className="flash-msg flash-msg-user">
                <span>{msg.content}</span>
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="flash-msg flash-msg-assistant">
                {msg.headline && <p className="flash-headline">{msg.headline}</p>}
                <p className="flash-answer"><RenderAnswer text={msg.content} /></p>
                {msg.data?.length > 1 && (
                  <DataTable data={msg.data} />
                )}
                {msg.timing && (
                  <p className="flash-timing">
                    ⏱ {(msg.timing.total_ms / 1000).toFixed(1)}s total
                    &nbsp;·&nbsp; SQL+BQ: {(msg.timing.sql_gen_ms / 1000).toFixed(1)}s
                    &nbsp;·&nbsp; Answer: {(msg.timing.answer_gen_ms / 1000).toFixed(1)}s
                  </p>
                )}
                {msg.confidence !== undefined && msg.confidence < 0.6 && (
                  <p className="flash-low-confidence">⚠️ Low confidence — please verify this answer</p>
                )}
                {msg.id && (
                  <div className="flash-feedback">
                    <button
                      className={`flash-fb-btn ${msg.feedback === 'up' ? 'active' : ''}`}
                      onClick={() => sendFeedback(msg.id, 'up')}
                    >👍</button>
                    <button
                      className={`flash-fb-btn ${msg.feedback === 'down' ? 'active' : ''}`}
                      onClick={() => sendFeedback(msg.id, 'down')}
                    >👎</button>
                  </div>
                )}
              </div>
            )}

            {msg.role === 'product_search' && (
              <div className="flash-msg flash-msg-assistant">
                <p className="flash-clarification-intro">
                  🔍 Found multiple products matching <strong>"{msg.searchTerm}"</strong> — which one?
                </p>
                <div className="flash-clarification-opts" style={{ flexDirection: 'column', gap: 6 }}>
                  {msg.products.map((p, j) => (
                    <button
                      key={j}
                      className="flash-clarification-btn"
                      style={{ textAlign: 'left' }}
                      onClick={() => handleProductSelect(msg.question, p)}
                    >
                      <span style={{ fontWeight: 600 }}>{p.product_name}</span>
                      {(p.color || p.size) && (
                        <span style={{ opacity: 0.6, marginLeft: 8, fontSize: '0.85em' }}>
                          {[p.color, p.size].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="flash-clarification-skip">
                  or{' '}
                  <button
                    className="flash-clarification-skip-btn"
                    onClick={() => {
                      setMessages(prev => prev.filter(m => m.role !== 'product_search'));
                      sendMessage(msg.question, {}, true);
                    }}
                  >
                    skip and let FLASH decide
                  </button>
                </p>
              </div>
            )}

            {msg.role === 'clarification' && (
              <div className="flash-msg flash-msg-assistant">
                <p className="flash-clarification-intro">
                  🤔 Just to make sure I give you the right answer —
                </p>
                {msg.ambiguities.map((amb, i) => (
                  <div key={i} className="flash-clarification">
                    <p className="flash-clarification-q">{amb.question}</p>
                    <div className="flash-clarification-opts">
                      {amb.options.map((opt, j) => (
                        <button
                          key={j}
                          className="flash-clarification-btn"
                          onClick={() => handleClarification(msg.question, amb, opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="flash-clarification-skip">
                  or{' '}
                  <button
                    className="flash-clarification-skip-btn"
                    onClick={() => {
                      setMessages(prev => prev.filter(m => m.role !== 'clarification'));
                      sendMessage(msg.question, {}, true);
                    }}
                  >
                    skip and let FLASH decide
                  </button>
                </p>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flash-msg flash-msg-assistant">
            <div className="flash-loading">
              <span></span><span></span><span></span>
            </div>
            <p className="flash-timing" style={{ marginTop: 6 }}>
              Thinking... {elapsed}s
              {elapsed > 5 && elapsed <= 30 ? ' (loading model...)' : ''}
              {elapsed > 30 ? ' — complex query, hang tight' : ''}
              {elapsed > 90 ? ' — complex query, hang tight' : ''}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flash-input-area">
        <input
          className="flash-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          placeholder="Ask anything about sales, inventory, logistics..."
          disabled={loading}
        />
        <button
          className="flash-send"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
        >
          ⚡
        </button>
      </div>
    </div>
  );
}

function RenderAnswer({ text }) {
  if (!text) return null;
  // Split on **bold** markers and render inline
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

function DataTable({ data }) {
  if (!data?.length) return null;
  const keys = Object.keys(data[0]);
  return (
    <div className="flash-table-wrap">
      <table className="flash-table">
        <thead>
          <tr>{keys.map(k => <th key={k}>{k}</th>)}</tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row, i) => (
            <tr key={i}>
              {keys.map(k => <td key={k}>{String(row[k] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 20 && (
        <p className="flash-table-more">Showing 20 of {data.length} rows</p>
      )}
    </div>
  );
}
