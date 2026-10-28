import { useState } from 'react';
import { MagnifyingGlass, Plus, Trash } from '@phosphor-icons/react';
import { displayTitle, groupByDate } from './pulseShared.js';

export default function HistoryPanel({ conversations, activeId, onSelect, onNew, onDelete }) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const groups = groupByDate(filtered);

  return (
    <div className="af-history">
      <div className="af-history-header">
        <div className="af-history-title">Frido Pulse</div>
        <div className="af-history-sub">Chat with your data</div>
      </div>

      <button className="af-new-btn" onClick={onNew}>
        <Plus size={14} weight="bold" />
        New question
      </button>

      <div className="af-search-wrap">
        <MagnifyingGlass size={13} className="af-search-icon" />
        <input
          className="af-search"
          placeholder="Search questions"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="af-history-list">
        {groups.today.length > 0 && (
          <>
            <div className="af-date-label">Today</div>
            {groups.today.map(c => (
              <HistoryItem key={c.id} c={c} active={c.id === activeId} onClick={() => onSelect(c.id)} onDelete={() => onDelete(c.id)} />
            ))}
          </>
        )}
        {groups.yesterday.length > 0 && (
          <>
            <div className="af-date-label">Yesterday</div>
            {groups.yesterday.map(c => (
              <HistoryItem key={c.id} c={c} active={c.id === activeId} onClick={() => onSelect(c.id)} onDelete={() => onDelete(c.id)} />
            ))}
          </>
        )}
        {groups.week.length > 0 && (
          <>
            <div className="af-date-label">Previous 7 days</div>
            {groups.week.map(c => (
              <HistoryItem key={c.id} c={c} active={c.id === activeId} onClick={() => onSelect(c.id)} onDelete={() => onDelete(c.id)} />
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <div className="af-empty-search">No conversations found</div>
        )}
      </div>

    </div>
  );
}

function HistoryItem({ c, active, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`af-history-item${active ? ' active' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="af-history-item-text" onClick={onClick} title={displayTitle(c)}>
        {displayTitle(c)}
      </span>
      {hovered && (
        <button
          className="af-delete-btn"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete conversation"
        >
          <Trash size={13} />
        </button>
      )}
    </div>
  );
}
