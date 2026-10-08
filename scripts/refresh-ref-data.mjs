/**
 * Pulls the three reference tables from BigQuery `inventory_sales_allocation`
 * and writes fresh JSON files to api/data/.
 *
 * Run before generate-sales-alloc-cache.mjs (or any script that needs current
 * facility / state / channel mappings):
 *
 *   node scripts/refresh-ref-data.mjs
 */

import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'api', 'data')

function getBQ() {
  if (process.env.GCP_SA_KEY) {
    const keyPath = join(tmpdir(), 'sa_key.json')
    writeFileSync(keyPath, process.env.GCP_SA_KEY)
    return new BigQuery({ keyFilename: keyPath, projectId: 'frido-429506' })
  }
  return new BigQuery({
    keyFilename: join(__dirname, '..', 'sa_key.json'),
    projectId: 'frido-429506',
  })
}

const bq = getBQ()
const loc = { location: 'asia-south1' }

console.log('[refresh-ref-data] Fetching from BQ inventory_sales_allocation …')

const [facilityRows, stateRows, channelRows] = await Promise.all([
  bq.query({
    ...loc,
    query: `
      SELECT
        Facility,
        Facility2,
        Location,
        FCs_Status_for_Invt,
        FacilityType,
        Store_Location
      FROM \`frido-429506.inventory_sales_allocation.facility_master\`
      ORDER BY Facility
    `,
  }),
  bq.query({
    ...loc,
    query: `
      SELECT shipping_address_state, region, nearest_wh
      FROM \`frido-429506.inventory_sales_allocation.state_region_nearest_wh\`
      ORDER BY shipping_address_state
    `,
  }),
  bq.query({
    ...loc,
    query: `
      SELECT
        uniware_channels,
        unified_channel,
        unified_channel2,
        channel_description,
        Flex_Location AS \`Flex Location\`
      FROM \`frido-429506.inventory_sales_allocation.uc_channel_desc\`
      ORDER BY uniware_channels
    `,
  }),
])

const [facilityData] = facilityRows
const [stateData] = stateRows
const [channelData] = channelRows

// Flatten BigQuery numeric/date wrappers to plain JS values
const flatten = rows =>
  rows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        v != null && typeof v === 'object' && 'value' in v ? v.value : v,
      ])
    )
  )

const facilityJson = flatten(facilityData)
const stateJson    = flatten(stateData)
const channelJson  = flatten(channelData)

writeFileSync(join(DATA_DIR, 'facility_master.json'), JSON.stringify(facilityJson, null, 2))
writeFileSync(join(DATA_DIR, 'state_region_wh.json'), JSON.stringify(stateJson, null, 2))
writeFileSync(join(DATA_DIR, 'channel_desc.json'),    JSON.stringify(channelJson, null, 2))

console.log(`[refresh-ref-data] ✅ facility_master: ${facilityJson.length} rows`)
console.log(`[refresh-ref-data] ✅ state_region_wh: ${stateJson.length} rows`)
console.log(`[refresh-ref-data] ✅ channel_desc:    ${channelJson.length} rows`)
console.log('[refresh-ref-data] Done — api/data/ JSON files are up to date.')
