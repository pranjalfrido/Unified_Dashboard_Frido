import { useEffect, useRef, useState } from 'react';
import { Lightning, CheckCircle, Code } from '@phosphor-icons/react';

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

function renderMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Markdown table: line with | and next line is separator (---|---)
    if (line.includes('|') && lines[i + 1] && /^\s*\|?[\s\-|:]+\|?\s*$/.test(lines[i + 1])) {
      const headers = line.split('|').map(c => c.trim()).filter(c => c);
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
        if (cells.length > 0) rows.push(cells);
        i++;
      }
      const thead = `<thead><tr>${headers.map(h => `<th>${inlineFormat(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<div class="af-table-wrap"><table class="af-table">${thead}${tbody}</table></div>`);
      continue;
    }

    // ### heading
    if (/^###\s+/.test(line)) {
      out.push(`<div class="af-md-h3">${inlineFormat(line.replace(/^###\s+/, ''))}</div>`);
      i++; continue;
    }
    // ## heading
    if (/^##\s+/.test(line)) {
      out.push(`<div class="af-md-h2">${inlineFormat(line.replace(/^##\s+/, ''))}</div>`);
      i++; continue;
    }
    // bullet - or *
    if (/^[\-\*]\s+/.test(line)) {
      out.push(`<div class="af-md-li">${inlineFormat(line.replace(/^[\-\*]\s+/, ''))}</div>`);
      i++; continue;
    }
    // horizontal rule ---
    if (/^---+$/.test(line.trim())) {
      out.push('<hr class="af-md-hr"/>');
      i++; continue;
    }
    // empty line
    if (line.trim() === '') {
      out.push('<div class="af-md-gap"></div>');
      i++; continue;
    }
    // normal paragraph line
    out.push(`<div>${inlineFormat(line)}</div>`);
    i++;
  }

  return out.join('');
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="af-inline-code">$1</code>');
}

function AssistantMessage({ msg }) {
  const [sqlOpen, setSqlOpen] = useState(false);

  return (
    <div className="af-msg af-msg-assistant">
      <div className="af-assistant-icon">
        <Lightning size={14} weight="fill" />
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
        <Lightning size={14} weight="fill" />
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
  const suggestions = [
    'What is our RTO rate this week?',
    'Top 5 products by revenue this month',
    'Show inventory across all warehouses',
    'Compare Delhivery vs BlueDart delivery rate',
  ];
  return (
    <div className="af-empty-state">
      <div className="af-empty-icon"><Lightning size={32} weight="fill" /></div>
      <div className="af-empty-title">Ask anything with Frido Pulse</div>
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
