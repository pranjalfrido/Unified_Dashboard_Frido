import { ArrowClockwise, List } from '@phosphor-icons/react';
import { CATEGORY_COLORS } from './mockData.js';
import { displayTitle } from './pulseShared.js';

export default function ChatTopBar({ conversation, onToggleHistory, historyVisible }) {
  if (!conversation) return <div className="af-topbar" />;

  const catStyle = CATEGORY_COLORS[conversation.category] || { bg: '#F3F4F6', text: '#374151' };

  return (
    <div className="af-topbar">
      <div className="af-topbar-left">
        <button className="af-topbar-toggle" onClick={onToggleHistory} title="Toggle history">
          <List size={18} />
        </button>
        <span className="af-topbar-title">{displayTitle(conversation)}</span>
        {conversation.category && (
          <span className="af-category-tag" style={{ background: catStyle.bg, color: catStyle.text }}>
            {conversation.category}
          </span>
        )}
      </div>
      <div className="af-topbar-right">
        <button className="af-topbar-btn" title="Refresh">
          <ArrowClockwise size={15} />
        </button>
      </div>
    </div>
  );
}
