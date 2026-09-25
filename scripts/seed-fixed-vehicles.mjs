// Seeds public.logistics_fixed_vehicles with the four vehicles on standing monthly hire.
//
// These four are the complete fleet on fixed rental, unchanged month to month, running
// from Apr'26. The same four rows are written for every month in the window so each
// month carries its own charge — the cost is incurred monthly, not once.
//
// Idempotent: keyed on (month_year, vehicle_number), so re-running corrects rather than
// duplicates. Extend MONTHS as the arrangement continues.
//
//   node -r dotenv/config scripts/seed-fixed-vehicles.mjs
import pkg from 'pg'
const { Pool } = pkg

const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

const VEHICLES = [
  { location: 'Talwade, Pune',  transport_name: 'RN Transport',            vehicle_type: 'Pickup', vehicle_number: 'MH 14 JL 6920', agreed_km: 3000, cost: 55000 },
  { location: 'Vadgaon, Pune',  transport_name: 'KM Logistic',             vehicle_type: 'Pickup', vehicle_number: 'MH 14 JL 2615', agreed_km: 3000, cost: 54800 },
  { location: 'Vadgaon, Pune',  transport_name: 'KM Logistic',             vehicle_type: 'Pickup', vehicle_number: 'MH 16 CD 0594', agreed_km: 3000, cost: 54800 },
  { location: 'GGN2, Hexalog',  transport_name: 'Hexalog, Techonologies',  vehicle_type: 'Pickup', vehicle_number: 'HR 55 AN 2389', agreed_km: 3000, cost: 70000 },
]

const url = process.env.SUPABASE_URL
if (!url) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 60000 })

let written = 0
for (const month of MONTHS) {
  for (const v of VEHICLES) {
    await pool.query(
      `INSERT INTO public.logistics_fixed_vehicles
         (month_year, location, transport_name, vehicle_type, vehicle_number, agreed_km, cost, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (month_year, vehicle_number) DO UPDATE SET
         location = EXCLUDED.location, transport_name = EXCLUDED.transport_name,
         vehicle_type = EXCLUDED.vehicle_type, agreed_km = EXCLUDED.agreed_km,
         cost = EXCLUDED.cost, updated_at = now()`,
      [month, v.location, v.transport_name, v.vehicle_type, v.vehicle_number, v.agreed_km, v.cost])
    written++
  }
}

const r = await pool.query(`
  SELECT COUNT(*)::int AS rows,
         COUNT(DISTINCT vehicle_number)::int AS vehicles,
         COUNT(DISTINCT month_year)::int AS months,
         SUM(cost)::float8 AS total
    FROM public.logistics_fixed_vehicles`)
const x = r.rows[0]
console.log(`wrote ${written} rows`)
console.log(`  ${x.vehicles} vehicles x ${x.months} months = ${x.rows} rows`)
console.log(`  monthly Rs ${(x.total / x.months).toLocaleString('en-IN')}`)
console.log(`  total   Rs ${Number(x.total).toLocaleString('en-IN')}`)
await pool.end()
