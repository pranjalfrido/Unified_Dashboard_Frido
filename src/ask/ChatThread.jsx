import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Code } from '@phosphor-icons/react';
import NavAIIcon from './NavAIIcon.jsx';
import { SUGGESTIONS } from './pulseShared.js';
import { renderMarkdown } from './markdown.js';

function ThinkingDots() {
  return (
    <div className="af-thinking">
      <span /><span /><span />
    </div>
  );
}

function AssistantTable({ table }) {
  if (!table) return null;
  return (
    <div className="af-table-wrap">
      <table className="af-table">
        <thead>
          <tr>{table.headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssistantMessage({ msg }) {
  const [sqlOpen, setSqlOpen] = useState(false);

  return (
    <div className="af-msg af-msg-assistant">
      <div className="af-assistant-icon">
        <NavAIIcon size={16} />
      </div>
      <div className="af-assistant-body">
        {msg.thinking ? (
          <ThinkingDots />
        ) : (
          <>
            {msg.text && (
              <div
                className="af-answer"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
              />
            )}
            <AssistantTable table={msg.table} />
            {msg.assumptions && (
              <div className="af-assumptions">Assumptions: {msg.assumptions}</div>
            )}
            {(msg.matchesDashboard !== undefined || msg.sql || msg.model) && (
              <div className="af-msg-actions">
                {msg.matchesDashboard && (
                  <button className="af-action-btn af-action-verified">
                    <CheckCircle size={12} weight="fill" />
                    Matches dashboard
                  </button>
                )}
                {msg.sql && (
                  <button
                    className="af-action-btn af-action-sql"
                    onClick={() => setSqlOpen(o => !o)}
                  >
                    <Code size={12} />
                    {sqlOpen ? 'Hide SQL' : 'Show SQL'}
                  </button>
                )}
                {msg.model && (
                  <span className={`af-action-btn af-model-badge${msg.model.includes('opus') ? ' af-model-opus' : ' af-model-sonnet'}`}>
                    {msg.model.includes('opus') ? '⚡ Opus' : '· Sonnet'}
                  </span>
                )}
              </div>
            )}
            {sqlOpen && msg.sql && (
              <pre className="af-sql-block">{msg.sql}</pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UserMessage({ msg }) {
  return (
    <div className="af-msg af-msg-user">
      <div className="af-user-bubble">{msg.text}</div>
    </div>
  );
}

function ClarifyMessage({ msg, onChoice }) {
  return (
    <div className="af-msg af-msg-assistant">
      <div className="af-assistant-icon">
        <NavAIIcon size={16} />
      </div>
      <div className="af-assistant-body">
        <div className="af-answer">{msg.question}</div>
        <div className="af-clarify-opts">
          {msg.options.map(opt => (
            <button key={opt} className="af-clarify-btn" onClick={() => onChoice(opt)}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion }) {
  const suggestions = SUGGESTIONS;
  return (
    <div className="af-empty-state">
      <div className="af-empty-icon"><NavAIIcon size={32} /></div>
      <div className="af-empty-title">Ask anything with NavAI</div>
      <div className="af-empty-sub">Sales, inventory, logistics, P&L — all in one place</div>
      <div className="af-suggestions">
        {suggestions.map(s => (
          <button key={s} className="af-suggestion" onClick={() => onSuggestion(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

export default function ChatThread({ messages, onSuggestion, onClarifyChoice }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!messages || messages.length === 0) {
    return (
      <div className="af-thread">
        <EmptyState onSuggestion={onSuggestion} />
      </div>
    );
  }

  return (
    <div className="af-thread">
      <div className="af-thread-inner">
        {messages.map(msg => {
          if (msg.role === 'user') return <UserMessage key={msg.id} msg={msg} />;
          if (msg.clarify) return <ClarifyMessage key={msg.id} msg={msg} onChoice={onClarifyChoice} />;
          return <AssistantMessage key={msg.id} msg={msg} />;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
