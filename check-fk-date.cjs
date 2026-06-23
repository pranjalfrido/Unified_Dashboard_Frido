const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

bq.query(`SELECT MAX(DATE(SUBSTR(order_date,1,10))) AS latest_date, MIN(DATE(SUBSTR(order_date,1,10))) AS earliest_date, COUNT(*) AS total_rows FROM \`frido-429506.flipkart_reports.sales_report\``).then(([r]) => {
  console.log('Latest date :', r[0].latest_date?.value || r[0].latest_date)
  console.log('Earliest date:', r[0].earliest_date?.value || r[0].earliest_date)
  console.log('Total rows   :', r[0].total_rows)
}).catch(console.error)
