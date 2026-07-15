import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery({
  projectId: 'frido-429506',
  keyFilename: 'C:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json',
});

const query = `
WITH base AS (
  SELECT
    awb,
    courier_partner,
    clickpost_unified_status,
    latest_remark,
    out_for_delivery_attempts,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(created_at, 1, 10))          AS created_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(order_date, 1, 10))           AS order_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(pickup_date, 1, 10))          AS pickup_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(delivery_date, 1, 10))        AS delivery_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(rto_mark_date, 1, 10))        AS rto_mark_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(out_for_delivery_1st_attempt, 1, 10)) AS ofd1_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(latest_timestamp, 1, 10))     AS latest_ts_date,

    CASE
      WHEN LOWER(courier_partner) LIKE '%bluedart%'                                        THEN 'Bluedart'
      WHEN LOWER(courier_partner) LIKE '%ekart%'                                           THEN 'Ekart'
      WHEN LOWER(courier_partner) LIKE '%elastic%'                                         THEN 'ElasticRun'
      WHEN LOWER(courier_partner) LIKE '%delhivery%' AND LOWER(courier_partner) LIKE '%hld%' THEN 'Delhivery DS'
      WHEN LOWER(courier_partner) LIKE '%delhivery%' AND LEFT(awb, 4) = '5448'            THEN 'Delhivery NDD'
      WHEN LOWER(courier_partner) LIKE '%delhivery%'                                       THEN 'Delhivery'
      WHEN LOWER(courier_partner) LIKE '%safexpress%'                                      THEN 'Safexpress'
      WHEN LOWER(courier_partner) LIKE '%shadowfax%'                                       THEN 'Shadowfax'
      WHEN LOWER(courier_partner) LIKE '%sky air%' OR LOWER(courier_partner) LIKE '%skye air%' THEN 'Sky Air'
      WHEN LOWER(courier_partner) LIKE '%swift%' AND LOWER(courier_partner) LIKE '%reverse%'   THEN 'Swift Reverse'
      WHEN LOWER(courier_partner) LIKE '%swift%'                                           THEN 'Swift'
      WHEN LOWER(courier_partner) LIKE '%urbane bolt%' OR LOWER(courier_partner) LIKE '%urbanbolt%' THEN 'UrbaneBolt'
      ELSE courier_partner
    END AS courier_group,

    CASE
      WHEN clickpost_unified_status = 'Delivered'                                                        THEN 'Delivered'
      WHEN clickpost_unified_status = 'NoStatusExist' AND LOWER(latest_remark) LIKE '%delivered%'        THEN 'Delivered'
      WHEN clickpost_unified_status IN ('RTO-Marked','RTO-ShipmentDelay','RTO-InTransit','RTO-Delivered',
            'RTO-Requested','RTO-ContactCustomerCare','RTO-OutForDelivery','RTO-Failed')                  THEN 'RTO'
      WHEN clickpost_unified_status = 'NoStatusExist' AND LOWER(latest_remark) LIKE '%rto%'             THEN 'RTO'
      WHEN clickpost_unified_status IN ('PickupFailed','OutForPickup','PickupPending','OrderPlaced')      THEN 'Pickup Pending'
      WHEN clickpost_unified_status IN ('ShipmentHeld','ContactCustomerCare','InTransit','DestinationHubIn',
            'FailedDelivery','ShipmentDelayed','PickedUp','OutForDelivery','OriginCityOut','OriginCityIn') THEN 'Intransit'
      WHEN clickpost_unified_status = 'Cancelled'                                                        THEN 'Cancelled'
      ELSE 'Others'
    END AS unified_status

  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE SUBSTR(created_at, 1, 10) BETWEEN '2026-04-01' AND '2026-04-30'
),

agg AS (
  SELECT
    courier_group,
    COUNT(awb) AS total,
    COUNTIF(unified_status = 'Delivered') AS delivered,
    COUNTIF(unified_status = 'RTO') AS rto,
    COUNTIF(unified_status = 'RTO' AND COALESCE(SAFE_CAST(out_for_delivery_attempts AS INT64), 0) = 0) AS z_rto,
    COUNTIF(unified_status = 'Cancelled') AS cancelled,
    COUNTIF(SAFE_CAST(out_for_delivery_attempts AS INT64) = 1 AND unified_status = 'Delivered') AS d1,
    COUNTIF(SAFE_CAST(out_for_delivery_attempts AS INT64) > 1 AND unified_status = 'Delivered') AS rasr_num,
    COUNTIF(SAFE_CAST(out_for_delivery_attempts AS INT64) IS NOT NULL AND SAFE_CAST(out_for_delivery_attempts AS INT64) != 0) AS ofd_total,
    AVG(CASE WHEN order_date IS NOT NULL AND created_date IS NOT NULL
              AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10
             THEN DATE_DIFF(created_date, order_date, DAY) END) AS avg_processing,
    AVG(CASE WHEN pickup_date IS NOT NULL AND created_date IS NOT NULL
              AND DATE_DIFF(pickup_date, created_date, DAY) BETWEEN 0 AND 10
             THEN DATE_DIFF(pickup_date, created_date, DAY) END) AS avg_pickup,
    AVG(CASE WHEN delivery_date IS NOT NULL AND pickup_date IS NOT NULL
              AND DATE_DIFF(delivery_date, pickup_date, DAY) BETWEEN 0 AND 20
             THEN DATE_DIFF(delivery_date, pickup_date, DAY) END) AS avg_s2d,
    AVG(CASE WHEN delivery_date IS NOT NULL AND order_date IS NOT NULL
              AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20
             THEN DATE_DIFF(delivery_date, order_date, DAY) END) AS avg_o2d,
    AVG(CASE WHEN clickpost_unified_status = 'RTO-Delivered'
              AND latest_ts_date IS NOT NULL AND rto_mark_date IS NOT NULL
              AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20
             THEN DATE_DIFF(latest_ts_date, rto_mark_date, DAY) END) AS avg_rto_tat,
    AVG(CASE WHEN ofd1_date IS NOT NULL AND pickup_date IS NOT NULL
             THEN DATE_DIFF(ofd1_date, pickup_date, DAY) END) AS avg_s2a
  FROM base
  GROUP BY courier_group
)

SELECT
  courier_group,
  total,
  ROUND(total / SUM(total) OVER() * 100, 2) AS vol_pct,
  delivered,
  ROUND(delivered / total * 100, 2) AS del_pct,
  rto,
  ROUND(rto / total * 100, 2) AS rto_pct,
  z_rto,
  ROUND(z_rto / total * 100, 2) AS z_rto_pct,
  cancelled,
  ROUND(cancelled / total * 100, 2) AS canc_pct,
  d1,
  rasr_num,
  ofd_total,
  ROUND(SAFE_DIVIDE(d1, ofd_total) * 100, 2) AS fasr_pct,
  ROUND(SAFE_DIVIDE(rasr_num, ofd_total) * 100, 2) AS rasr_pct,
  ROUND(avg_processing, 2) AS avg_processing,
  ROUND(avg_pickup, 2) AS avg_pickup,
  ROUND(avg_s2d, 2) AS avg_s2d,
  ROUND(avg_o2d, 2) AS avg_o2d,
  ROUND(avg_rto_tat, 2) AS avg_rto_tat,
  ROUND(avg_s2a, 2) AS avg_s2a
FROM agg
ORDER BY total DESC
`;

const [rows] = await bq.query({ query, location: 'asia-south1' });

if (rows.length === 0) {
  console.log('No rows returned.');
  process.exit(0);
}

const cols = Object.keys(rows[0]);
const widths = cols.map(c => c.length);
for (const row of rows) {
  cols.forEach((c, i) => {
    const v = row[c] == null ? 'null' : String(row[c]);
    if (v.length > widths[i]) widths[i] = v.length;
  });
}

const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
const header = '|' + cols.map((c, i) => ' ' + c.padEnd(widths[i]) + ' ').join('|') + '|';
console.log(sep);
console.log(header);
console.log(sep);
for (const row of rows) {
  const line = '|' + cols.map((c, i) => {
    const v = row[c] == null ? 'null' : String(row[c]);
    return ' ' + v.padEnd(widths[i]) + ' ';
  }).join('|') + '|';
  console.log(line);
}
console.log(sep);
console.log(`\nTotal rows: ${rows.length}`);
