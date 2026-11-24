import { useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'
import { downloadAnswerTables } from './answerTables.js'

// "⬇ Excel" under a table, "Download all" (one sheet per table) when an answer has several. The Excel library is loaded
// only when the button is clicked; the file is built in the browser from the answer's own tables.
export default function ExcelButton({ tables, all = false, className = '' }) {
  const [state, setState] = useState('') // '' | 'busy' | 'error'
  const click = async () => {
    if (state === 'busy') return
    setState('busy')
    try { await downloadAnswerTables(tables); setState('') } catch { setState('error') }
  }
  return (
    <>
      <button type="button" className={`nx-xl ${className}`} data-testid={all ? 'nx-xl-all' : 'nx-xl'} onClick={click} disabled={state === 'busy'}
        aria-label={all ? 'Download all tables as Excel' : 'Download this table as Excel'}>
        <DownloadSimple size={13} weight="bold" aria-hidden="true" />{state === 'busy' ? 'Preparing…' : all ? `Download all (${tables.length})` : 'Excel'}
      </button>
      {state === 'error' && <span className="nx-xl-err" role="alert">Could not make the Excel file. Try again.</span>}
    </>
  )
}
