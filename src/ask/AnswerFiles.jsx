import { DownloadSimple } from '@phosphor-icons/react'

// A file made by a tool and sent with the answer (the inventory_opportunity Excel): { name, mime, data (base64) }.
// "⬇ name" saves it from the browser; nothing is stored (files are not kept in the chat history, so they only live for this session).
function save(f) {
  const bin = atob(f.data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime || 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url; a.download = f.name || 'navai-file'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function AnswerFiles({ files, className = '' }) {
  if (!Array.isArray(files) || !files.length) return null
  return (
    <div className={`nx-files ${className}`}>
      {files.map((f, i) => (
        <button key={i} type="button" className="nx-xl nx-xl-file" data-testid="nx-file" onClick={() => save(f)} aria-label={`Download ${f.name}`}>
          <DownloadSimple size={14} weight="bold" aria-hidden="true" />{f.name}
        </button>
      ))}
    </div>
  )
}
