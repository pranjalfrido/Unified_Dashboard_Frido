import { geoMercator, geoPath } from 'd3-geo'
import { readFileSync, writeFileSync } from 'fs'

const geo = JSON.parse(readFileSync('./india_states.geojson', 'utf8'))
const W = 600, H = 680

const projection = geoMercator().fitSize([W, H], geo)
const pathGen = geoPath().projection(projection)

const states = geo.features.map(f => {
  const name = f.properties.NAME_1
  const d = pathGen(f)
  return { id: name.toUpperCase().trim(), name, d }
})

const out = `// Auto-generated from geohacker/india GeoJSON via d3-geo — do not edit manually
export const INDIA_STATE_PATHS = ${JSON.stringify(states, null, 2)}
`
writeFileSync('./src/indiaMapPaths.js', out)
console.log(`Generated ${states.length} state paths`)
states.forEach(s => console.log(` - ${s.name}`))
