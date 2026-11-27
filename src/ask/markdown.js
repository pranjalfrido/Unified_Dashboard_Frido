// Pulse answer renderer (hand-rolled markdown subset), shared by the laptop and phone views.
// Exported for the phone view (PulseMobile), which uses the same renderer.
// Machine-readable state a NavAI answer may carry for follow-ups (<!--nx:{...}-->): kept in the chat history, never shown.
export const stripHidden = t => String(t || '').replace(/<!--nx:[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
export function renderMarkdown(text) {
  text = stripHidden(text);
  if (!text) return '';

  const lines = text.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Markdown table: line with | and next line is separator (---|---)
    if (line.includes('|') && lines[i + 1] && /^[\s|:\-]+$/.test(lines[i + 1].replace(/\|/g, '|'))) {
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

// Phone view: the answer split into blocks so tables can render as their own component.
//   { type: 'md', text }  ordinary lines (renderMarkdown)
//   { type: 'table', headers, rows }  cells are raw markdown (inline formatting, <br> = second line)
//   { type: 'src', text }  a "Source: …" line, shown small and grey
export function splitAnswer(text) {
  const lines = stripHidden(text).split('\n');
  const blocks = [];
  let md = [];
  const flush = () => { if (md.length) blocks.push({ type: 'md', text: md.join('\n') }); md = []; };
  // Empty cells are kept, so a row with a blank cell (e.g. a Total row) stays under its headers.
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('|') && lines[i + 1] && /^[\s|:-]+$/.test(lines[i + 1])) {
      flush();
      const start = i;
      const headers = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const r = cells(lines[i]);
        if (r.length) rows.push(r);
        i++;
      }
      i--;
      blocks.push({ type: 'table', headers, rows, raw: lines.slice(start, i + 1).join('\n') });
      continue;
    }
    const src = line.trim().replace(/^[*_]+|[*_]+$/g, '');
    if (/^source\s*:/i.test(src)) { flush(); blocks.push({ type: 'src', text: src, raw: line }); continue; }
    md.push(line);
  }
  flush();
  return blocks;
}

export { inlineFormat };
