import { useRef, useCallback } from 'react';
import { ArrowUp } from '@phosphor-icons/react';
import { AttachButton, AttachChips } from './ComposerExtras.jsx'
import { VoiceSlot } from './VoiceSlot.jsx';
import { useAttachments, useFileDrop } from './useAttachments.js';

// canFiles: the person has the 'ask:files' permission (admins always do). Without it there is no paperclip and
// the server refuses attachments anyway.
export default function ChatComposer({ onSend, disabled, canFiles = false }) {
  const ref = useRef(null);
  const files = useAttachments(canFiles);
  const drop = useFileDrop(canFiles && !disabled, files.add);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function grow() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function submit() {
    if (disabled || !files.sendable) return; // nothing is sent while a file is still being prepared or failed
    let text = ref.current?.value?.trim();
    if (!text && files.items.length) text = 'Please analyse the attached file' + (files.items.length > 1 ? 's.' : '.');
    if (!text) return;
    const bytes = files.payload(text.length);
    if (!bytes.complete) { files.setError('A file is not ready. Remove it or try again.'); return; } // never send without an attached file
    if (bytes.tooBig) { files.setError(bytes.tooBig); return; }
    const typed = ref.current.value, sent = files.items;
    ref.current.value = '';
    ref.current.style.height = 'auto';
    files.detach();
    // A failed send (false) puts the question and the files back so the person can just press Send again.
    Promise.resolve(onSend(text, bytes.data.length ? { attachments: bytes.data, chips: bytes.names } : undefined)).then(ok => {
      if (ok === false) {
        if (ref.current && !ref.current.value) { ref.current.value = typed; grow(); }
        if (sent.length) files.restore(sent);
      } else files.release(sent);
    });
  }

  // Voice writes into the box only; the person edits it and presses Send.
  const getValue = useCallback(() => ref.current?.value || '', []);
  const setValue = useCallback(t => { if (ref.current) { ref.current.value = t; grow(); } }, []);

  return (
    <div className="af-composer-wrap">
      <div className={`af-composer nx-composer${drop.over ? ' nx-over' : ''}`} {...drop.props}>
        <AttachChips items={files.items} onRemove={files.remove} />
        <div className="nx-row">
          <textarea
            ref={ref}
            className="af-composer-input"
            placeholder="Ask anything about sales, inventory, logistics..."
            rows={1}
            onKeyDown={handleKey}
            onInput={grow}
            disabled={disabled}
          />
          {canFiles && <AttachButton onFiles={files.add} disabled={disabled} shortcut />}
          <VoiceSlot getValue={getValue} setValue={setValue} disabled={disabled} />
          <button
            className="af-composer-send"
            onClick={submit}
            disabled={disabled || !files.sendable}
            title={files.converting ? 'Preparing file…' : files.failed ? 'Remove the file that failed' : 'Send'}
          >
            <ArrowUp size={16} weight="bold" />
          </button>
        </div>
      </div>
      {files.error && <div className="nx-err" role="alert">{files.error}</div>}
      <div className="af-disclaimer">
        NavAI can make mistakes. Verify key numbers.
      </div>
    </div>
  );
}
