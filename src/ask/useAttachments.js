import { useCallback, useEffect, useRef, useState } from 'react'
import { setBusy } from '../silentUpdate.js'
import { convertFile, kindOf, precheck, checkRequestSize } from './attachments.js'

let nextId = 1

// State for the chips above the box. Each file is converted in the browser (add() starts it). A chip is
// 'converting' ("Preparing file…"), 'ready', or 'error' (the conversion failed; the chip says why). The message can only be
// sent when every chip is ready: sendable is false while anything is converting or failed, and payload() only ever
// returns data for the chips currently shown, so a message can never go out without a file the person attached.
export function useAttachments(enabled) {
  const [items, setItems] = useState([])     // { id, name, size, kind, status, data?, error?, preview? }
  const [error, setError] = useState('')
  const count = useRef(0)                    // updated synchronously, so two quick adds can't both slip past the 3-file limit

  const add = useCallback(files => {
    if (!enabled) return
    setError('')
    for (const file of Array.from(files || [])) {
      const bad = precheck(file, count.current)
      if (bad) { setError(bad); continue }
      count.current++
      const id = nextId++
      const kind = kindOf(file)
      const preview = kind === 'image' ? URL.createObjectURL(file) : null
      setItems(prev => [...prev, { id, name: file.name || 'pasted-image.png', size: file.size, kind, status: 'converting', preview }])
      convertFile(file).then(
        data => setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'ready', data } : i)),
        err => setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', error: err?.message || `Could not read ${file.name}` } : i)),
      )
    }
  }, [enabled])

  const remove = useCallback(id => {
    setError('')
    setItems(prev => {
      const gone = prev.find(i => i.id === id)
      if (gone) { count.current = Math.max(0, count.current - 1); if (gone.preview) URL.revokeObjectURL(gone.preview) }
      return prev.filter(i => i.id !== id)
    })
  }, [])
  const clear = useCallback(() => {
    count.current = 0
    setItems(prev => { prev.forEach(i => i.preview && URL.revokeObjectURL(i.preview)); return [] })
    setError('')
  }, [])

  // Sending: take the chips off the screen without freeing them, so a failed send can put them back (restore) and a
  // good one frees their previews (release).
  const detach = useCallback(() => { count.current = 0; setItems([]); setError('') }, [])
  const restore = useCallback(list => { count.current = list.length; setItems(list) }, [])
  const release = useCallback(list => list.forEach(i => i.preview && URL.revokeObjectURL(i.preview)), [])

  const converting = items.some(i => i.status === 'converting')
  useEffect(() => { setBusy('navai-attachment', converting); return () => setBusy('navai-attachment', false) }, [converting])
  const failed = items.some(i => i.status === 'error')
  const sendable = !converting && !failed
  // What to send. `complete` is false unless every chip shown has its converted data; callers must not send otherwise.
  const payload = useCallback((otherBytes = 0) => {
    const ready = items.filter(i => i.status === 'ready')
    const data = ready.map(i => i.data)
    return { data, complete: ready.length === items.length, tooBig: checkRequestSize(data, otherBytes), names: items.map(i => ({ name: i.name })) }
  }, [items])
  return { items, error, setError, add, remove, clear, detach, restore, release, converting, failed, sendable, payload }
}

// Drag-and-drop and paste (screenshots) onto the composer area.
export function useFileDrop(enabled, onFiles) {
  const [over, setOver] = useState(false)
  const props = enabled ? {
    onDragOver: e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setOver(true) } },
    onDragLeave: () => setOver(false),
    onDrop: e => { if (e.dataTransfer?.files?.length) { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) } },
    onPaste: e => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) { e.preventDefault(); onFiles(files.map(f => (f.name ? f : new File([f], 'pasted-image.png', { type: f.type })))) }
    },
  } : {}
  return { over, props }
}
