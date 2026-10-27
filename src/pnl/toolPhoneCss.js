import { C } from '../utils.js'

// Phone styles for the four P&L tools (PNL_REVIEW_FIXES.md §2 / §7 design-system check). The tools are
// written with the laptop palette (C.t1, C.border, C.acd …) and laptop type sizes inline, so on phones
// this maps each laptop colour to its mobile one (MOBILE_DESIGN_SYSTEM.md §1) and lifts text under
// 12px to 12px, scoped to .pnl-tool-phone. Inline colours serialize as "rgb(r, g, b)" in the style
// attribute, which the selectors match; "color:" is matched only as its own property (not inside
// "background-color:"). Laptop is untouched.
const rgb = hex => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})` }

export function toolPhoneCss() {
  const M = C.m
  const S = '.pnl-tool-phone'
  // [laptop colour, phone text colour, phone background, phone border]
  const map = [
    [C.t1, M.ink, M.ink, M.ink],
    [C.t2, M.ink, M.muted, M.g4],
    [C.t3, M.muted, M.muted, M.g4],
    [C.acc, M.green, M.green, M.green],
    [C.acm, M.green, M.g2, M.g2],
    [C.acd, M.green, M.greenDark, M.green],
    [C.acs, M.green, M.g3, M.g3],
    [C.acl, M.green, M.soft, M.line],
    [C.bg, M.ink, M.soft, M.line],
    [C.hov, M.ink, M.soft, M.line],
    [C.border, M.muted, M.line, M.line],
    [C.border2, M.muted, M.g4, M.g4],
    [C.red.tx, M.down, M.down, M.down],
    [C.red.bg, M.down, 'rgba(192,57,43,.08)', 'rgba(192,57,43,.08)'],
    [C.red.bd, M.down, M.down, 'rgba(192,57,43,.35)'],
    [C.amber.tx, M.amber, M.amber, M.amber],
    [C.amber.bg, M.amber, 'rgba(200,134,10,.10)', 'rgba(200,134,10,.10)'],
    [C.amber.bd, M.amber, M.amber, 'rgba(200,134,10,.40)'],
    [C.green.tx, M.up, M.up, M.up],
    [C.green.bg, M.up, 'rgba(31,90,61,.08)', 'rgba(31,90,61,.08)'],
    [C.green.bd, M.up, M.g3, M.g3],
    [C.blue.tx, M.ink, M.ink, M.ink],
    [C.blue.bg, M.ink, M.soft, M.line],
    [C.blue.bd, M.ink, M.g4, M.g4],
  ].filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex || ''))
  const rules = map.map(([hex, tx, bg, bd]) => {
    const v = rgb(hex)
    return [
      `${S} [style^="color: ${v}"],${S} [style*="; color: ${v}"]{color:${tx}!important}`,
      `${S} [style*="background: ${v}"],${S} [style*="background-color: ${v}"]{background:${bg}!important}`,
      `${S} [style*="solid ${v}"],${S} [style*="dashed ${v}"]{border-color:${bd}!important}`,
      `${S} svg [fill="${hex}"],${S} svg [fill="${hex.toLowerCase()}"]{fill:${tx}}`,
    ].join('')
  })
  const small = ['10px', '10.5px', '11px', '11.5px'].map(px => `${S} [style*="font-size: ${px}"]`).join(',')
  return `${S}{color:${M.ink}}${rules.join('')}${small}{font-size:12px!important}`
}
