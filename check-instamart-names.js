import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

const [rows] = await bq.query({ query: `
  SELECT im.productid, im.channelproductname, im.masterskucode
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` im
  WHERE TRIM(im.channelname) = 'Instamart'
    AND im.productid IN ('418600','563809','194361','322756','141858','910129','970717','827251')
` })
console.log('Name lookup for dashboard SKUs:')
rows.forEach(r => console.log(` ${r.productid}: ${r.channelproductname} (${r.masterskucode})`))
