import { GoogleAuth } from 'google-auth-library'

const PROJECT = 'frido-429506'
const REGION  = 'asia-south1'
const BASE    = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs`

const EMAIL_JOB_IDS = [
  'low-rtd-email-morning',
  'low-rtd-email-evening',
  'excess-rtd-email-daily',
  'ops-email-reports-daily',
  'shipment-pendency-daily',
  'warehouse-allocation-report-daily',
  'logistics-report-daily-trigger',
  'product-report-weekly',
  'wbr-email-weekly',
]

async function getClient() {
  const saKey = process.env.GCP_SA_KEY
    ? JSON.parse(process.env.GCP_SA_KEY)
    : (await import('fs')).default.existsSync('./sa_key.json')
      ? JSON.parse((await import('fs')).default.readFileSync('./sa_key.json', 'utf8'))
      : null
  if (!saKey) throw new Error('No GCP credentials found')
  const auth = new GoogleAuth({ credentials: saKey, scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  return auth.getClient()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const client = await getClient()
    const token  = (await client.getAccessToken()).token

    if (req.method === 'GET') {
      // Fetch all jobs in parallel
      const results = await Promise.all(
        EMAIL_JOB_IDS.map(async id => {
          try {
            const r = await fetch(`${BASE}/${id}`, { headers: { Authorization: `Bearer ${token}` } })
            if (!r.ok) return [id, { state: 'UNKNOWN' }]
            const j = await r.json()
            return [id, { state: j.state, lastAttemptTime: j.lastAttemptTime, scheduleTime: j.scheduleTime }]
          } catch {
            return [id, { state: 'UNKNOWN' }]
          }
        })
      )
      return res.status(200).json(Object.fromEntries(results))
    }

    if (req.method === 'POST') {
      const { jobId, action } = req.body
      if (!EMAIL_JOB_IDS.includes(jobId)) return res.status(400).json({ error: 'Unknown job ID' })
      if (!['pause', 'resume'].includes(action)) return res.status(400).json({ error: 'action must be pause or resume' })

      const r = await fetch(`${BASE}/${jobId}:${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'GCP error' })
      return res.status(200).json({ state: data.state })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
