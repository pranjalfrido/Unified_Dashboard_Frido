import { useState } from 'react'
import { C } from '../utils.js'
import { initials } from './profileShared.js'

// Photo, or initials in a soft-green circle. (The old background was `radial-gradient(135deg, …)`,
// which isn't valid CSS, so the circle rendered blank: white initials on white.)
export default function Avatar({ url, name, size = 44 }) {
  const M = C.m
  const [brokenUrl, setBrokenUrl] = useState(null) // a photo that failed to load falls back to initials
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, position: 'relative', overflow: 'hidden',
      background: 'rgba(31,90,61,.12)', color: M.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(12, Math.round(size * 0.36)), fontWeight: 700, fontFamily: 'var(--font)', letterSpacing: '-0.02em',
    }}>
      {initials(name)}
      {url && url !== brokenUrl && (
        <img src={url} alt="" onError={() => setBrokenUrl(url)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
      )}
    </div>
  )
}

