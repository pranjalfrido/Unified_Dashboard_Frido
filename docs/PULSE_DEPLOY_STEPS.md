# Deploying the connector auth fix to Cloud Run (prepared, NOT yet run)

Service `frido-data-connector`, project `frido-429506`, region `asia-south1`.
Current revision (rollback target): **frido-data-connector-00043-t29** (100% traffic, deployed 2026-10-27).
Run from the repo root on branch `feature/pulse-tools`. Nothing here pushes or merges to `main`.

What the new revision changes: authentication always on (401 without the key), no key baked into the image, SELECT-only query guard (20 GB cap), CORS limited to `https://frido-navigator.vercel.app`.
`AUTH_ENABLED=true` is set as asked, but the new code no longer reads it; auth is always on.

## 0. Why Suraj must run step 1
The account Claude uses here (`for-quickcomm-automation`, Editor) is denied Secret Manager (`secretmanager.secretAccessor/admin`). Step 1 needs a person with Secret Manager Admin.

## 1. Create the secret and let Cloud Run read it
```
gcloud secrets create connector-gcp-sa-key --project frido-429506 --replication-policy=automatic --data-file=sa_key.json
gcloud secrets add-iam-policy-binding connector-gcp-sa-key --project frido-429506 \
  --member="serviceAccount:1012773678578-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```
(`1012773678578-compute@...` is the service account the service runs as. `sa_key.json` is the current key, as decided; swap in the pulse-readonly key later with `gcloud secrets versions add`.)

## 2. Check CONNECTOR_API_KEY matches Vercel (prints no secret)
Vercel CLI isn't installed on this machine, so compare hashes:
```
# Vercel value (production) -> hash
vercel env pull .env.vercel --environment=production && grep '^CONNECTOR_API_KEY=' .env.vercel | cut -d= -f2- | tr -d '"\r\n' | sha256sum; rm .env.vercel
# Cloud Run value -> hash
gcloud run services describe frido-data-connector --region asia-south1 --project frido-429506 --format=json \
  | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const e=j.spec.template.spec.containers[0].env.find(x=>x.name==='CONNECTOR_API_KEY');console.log(require('crypto').createHash('sha256').update(e.value).digest('hex'))"
```
The two hashes must be equal. If not, update Cloud Run (`--update-env-vars CONNECTOR_API_KEY=...`) or Vercel (`CONNECTOR_URL` stays the same).
Also confirm Vercel has `CONNECTOR_URL=https://frido-data-connector-hjcnlcg4mq-el.a.run.app`.

## 3. Deploy the new revision with NO traffic (safe canary)
```
gcloud run deploy frido-data-connector --source frido-data-connector \
  --project frido-429506 --region asia-south1 \
  --no-traffic --tag canary \
  --update-secrets GCP_SA_KEY=connector-gcp-sa-key:latest \
  --remove-env-vars GCP_SA_KEY_FILE \
  --update-env-vars AUTH_ENABLED=true,CORS_ORIGIN=https://frido-navigator.vercel.app
```
The build uses `.gcloudignore`, so no key or `.env` is uploaded. Canary URL: `https://canary---frido-data-connector-hjcnlcg4mq-el.a.run.app`.

## 4. Test the canary before sending traffic
```
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://canary---frido-data-connector-hjcnlcg4mq-el.a.run.app/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'       # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://canary---frido-data-connector-hjcnlcg4mq-el.a.run.app/health                                                                                      # expect 200
```
Then a keyed call (`-H "x-api-key: $KEY"`) with a small question must return an answer.

## 5. Send traffic to the new revision
```
gcloud run services update-traffic frido-data-connector --project frido-429506 --region asia-south1 --to-latest
```
Then: open Pulse on https://frido-navigator.vercel.app and ask a question (must answer), and confirm that a request without the key gets 401 on the real URL.

## ROLLBACK (back to the current revision, takes seconds)
```
gcloud run services update-traffic frido-data-connector --project frido-429506 --region asia-south1 \
  --to-revisions frido-data-connector-00043-t29=100
```
Revision 00043 still has its old env vars (including `GCP_SA_KEY_FILE`) and image, so it keeps working exactly as today (but with open auth). The secret and the new revision can stay in place.
