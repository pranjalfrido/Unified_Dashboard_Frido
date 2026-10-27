// Scoped CSS that maps a page's own inline colours to the mobile palette on phones (MOBILE_DESIGN_SYSTEM.md
// §1) and lifts text under 12px to 12px. For pages whose shared parts (forms, modals) are written with
// their own hex colours inline: the inline colour serializes as "rgb(r, g, b)" in the style attribute,
// which the selectors match ("color:" only as its own property, not inside "background-color:").
//   scope  e.g. '.profile-phone'
//   map    [[hex, text colour, background, border], …]
const rgb = hex => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})` }

export function paletteMapCss(scope, map, { ink } = {}) {
  const S = scope
  const rules = map.filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex || '')).map(([hex, tx, bg, bd]) => {
    const v = rgb(hex)
    return `${S} [style^="color: ${v}"],${S} [style*="; color: ${v}"]{color:${tx}!important}`
      + `${S} [style*="background: ${v}"],${S} [style*="background-color: ${v}"]{background:${bg}!important}`
      + `${S} [style*="solid ${v}"],${S} [style*="dashed ${v}"]{border-color:${bd}!important}`
  })
  const small = ['10px', '10.5px', '11px', '11.5px'].map(px => `${S} [style*="font-size: ${px}"]`).join(',')
  return `${ink ? `${S}{color:${ink}}` : ''}${rules.join('')}${small}{font-size:12px!important}${S} input,${S} select,${S} textarea{font-size:16px!important}`
}
