import { useRef } from 'react';
import { ArrowUp } from '@phosphor-icons/react';

export default function ChatComposer({ onSend, disabled }) {
  const ref = useRef(null);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const text = ref.current?.value?.trim();
    if (!text || disabled) return;
    ref.current.value = '';
    ref.current.style.height = 'auto';
    onSend(text);
  }

  function handleInput() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  return (
    <div className="af-composer-wrap">
      <div className="af-composer">
        <textarea
          ref={ref}
          className="af-composer-input"
          placeholder="Ask anything about sales, inventory, logistics..."
          rows={1}
          onKeyDown={handleKey}
          onInput={handleInput}
          disabled={disabled}
        />
        <button
          className="af-composer-send"
          onClick={submit}
          disabled={disabled}
          title="Send"
        >
          <ArrowUp size={16} weight="bold" />
        </button>
      </div>
      <div className="af-disclaimer">
        Frido Pulse can make mistakes. Verify important numbers.
      </div>
    </div>
  );
}
