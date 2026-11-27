import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Code } from '@phosphor-icons/react';
import NavAIIcon from './NavAIIcon.jsx';
import { ThumbsDown } from '@phosphor-icons/react';
import { useFeedback } from '../feedback/feedbackCtx.js';
import { ranQuery } from './ranQuery.js';
import { SUGGESTIONS } from './pulseShared.js';
import { renderMarkdown } from './markdown.js';
import { answerBlocks } from './answerTables.js';
import ExcelButton from './ExcelButton.jsx';
import AnswerFiles from './AnswerFiles.jsx';

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

// The answer as blocks: text is rendered exactly as before; each table gets its "Excel" button, and an answer with
// several tables gets "Download all".
function AnswerBody({ text }) {
  const blocks = useMemo(() => answerBlocks(text), [text]);
  const tables = blocks.filter(b => b.type === 'table');
  return (
    <div className="af-answer">
      {blocks.map((b, i) => b.type === 'table' ? (
        <div key={i} className="nx-tblock">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(b.raw) }} />
          <div className="nx-tbar"><ExcelButton tables={[b]} /></div>
        </div>
      ) : (
        <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(b.raw ?? b.text) }} />
      ))}
      {tables.length > 1 && <div className="nx-tbar nx-tbar-all"><ExcelButton tables={tables} all /></div>}
    </div>
  );
}

function AssistantMessage({ msg, question, isAdmin }) {
  const [sqlOpen, setSqlOpen] = useState(false);
  const fbk = useFeedback();
  const reportable = !msg.thinking && !!msg.text && !msg.error;
  // Admins only: the SQL behind an answer (when one really ran) and which model answered.
  const showSql = isAdmin && ranQuery(msg.sql);
  const showModel = isAdmin && !!msg.model;

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
              <AnswerBody text={msg.text} />
            )}
            <AssistantTable table={msg.table} />
            <AnswerFiles files={msg.files} />
            {msg.assumptions && (
              <div className="af-assumptions">Assumptions: {msg.assumptions}</div>
            )}
            {(msg.matchesDashboard !== undefined || showSql || showModel) && (
              <div className="af-msg-actions">
                {msg.matchesDashboard && (
                  <button className="af-action-btn af-action-verified">
                    <CheckCircle size={12} weight="fill" />
                    Matches dashboard
                  </button>
                )}
                {showSql && (
                  <button
                    className="af-action-btn af-action-sql"
                    onClick={() => setSqlOpen(o => !o)}
                  >
                    <Code size={12} />
                    {sqlOpen ? 'Hide SQL' : 'Show SQL'}
                  </button>
                )}
                {showModel && (
                  <span className={`af-action-btn af-model-badge${msg.model.includes('opus') ? ' af-model-opus' : ' af-model-sonnet'}`}>
                    {msg.model.includes('opus') ? '⚡ Opus' : '· Sonnet'}
                  </span>
                )}
              </div>
            )}
            {sqlOpen && showSql && (
              <pre className="af-sql-block">{msg.sql}</pre>
            )}
            {reportable && (
              <button type="button" className="fb-report" data-testid="report-answer" onClick={() => fbk.open({ type: 'wrong_number', ai: { question, answer: msg.text } })}>
                <ThumbsDown size={14} /> Report this answer
              </button>
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
      <div className="af-user-bubble">
        {msg.text}
        {msg.files?.length ? <div className="nx-sent">{msg.files.map((f, i) => <span key={i}>📎 {f.name}</span>)}</div> : null}
      </div>
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

export default function ChatThread({ messages, onSuggestion, onClarifyChoice, isAdmin }) {
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
        {messages.map((msg, idx) => {
          if (msg.role === 'user') return <UserMessage key={msg.id} msg={msg} />;
          if (msg.clarify) return <ClarifyMessage key={msg.id} msg={msg} onChoice={onClarifyChoice} />;
          const q = [...messages.slice(0, idx)].reverse().find(m => m.role === 'user')?.text || '';
          return <AssistantMessage key={msg.id} msg={msg} question={q} isAdmin={isAdmin} />;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
