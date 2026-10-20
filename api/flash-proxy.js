// Serverless proxy — forwards requests to the FLASH GCP backend over HTTP.
// Needed because Vercel is HTTPS and the GCP VM is plain HTTP;
// browsers block mixed-content XHR, but a server-side proxy does not.
// Usage: POST /api/flash-proxy?path=/chat  (path query param = target endpoint)
const FLASH_BACKEND = 'http://34.100.146.169/api';

export default async function handler(req, res) {
  // Allow CORS for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Extract target path from query param: /api/flash-proxy?path=/chat
  const targetPath = req.query.path || '/health';
  const url = `${FLASH_BACKEND}${targetPath}`;

  try {
    const fetchRes = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD'
        ? JSON.stringify(req.body)
        : undefined,
    });

    const data = await fetchRes.text();
    res.status(fetchRes.status)
       .setHeader('Content-Type', fetchRes.headers.get('content-type') || 'application/json')
       .send(data);
  } catch (err) {
    res.status(502).json({ error: 'FLASH backend unreachable', detail: err.message });
  }
}
