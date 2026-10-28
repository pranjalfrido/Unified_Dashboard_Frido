import { timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { getUserProfile } from './users.js';

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 min
});

function getKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Constant-time compare so the API key can't be guessed from response timing.
function keyMatches(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function validateRequest(req) {
  // Authentication is always on. There is no dev/open mode: a request without a valid API key
  // or Azure AD token gets 401. The key is accepted as `x-api-key` (what api/pulse.js sends)
  // or `Authorization: Bearer <key>` (Claude.ai connector). If CONNECTOR_API_KEY is unset the
  // key path fails closed.
  const CONNECTOR_API_KEY = process.env.CONNECTOR_API_KEY;
  const authHeader = req.headers['authorization'];
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (keyMatches(req.headers['x-api-key'], CONNECTOR_API_KEY) || keyMatches(bearer, CONNECTOR_API_KEY)) {
    return { ok: true, user: { email: 'connector@myfrido.com', role: 'analyst', name: 'Connector Service' } };
  }

  if (!bearer) {
    return { ok: false, status: 401, message: 'Missing or invalid API key.' };
  }

  const token = bearer;

  let decoded;
  try {
    decoded = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          audience: CLIENT_ID,
          issuer: [
            `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
            `https://sts.windows.net/${TENANT_ID}/`,
          ],
          algorithms: ['RS256'],
        },
        (err, payload) => (err ? reject(err) : resolve(payload))
      );
    });
  } catch (err) {
    return { ok: false, status: 401, message: `Token invalid: ${err.message}` };
  }

  const email = (decoded.preferred_username || decoded.upn || decoded.email || '').toLowerCase();
  if (!email.endsWith('@myfrido.com')) {
    return { ok: false, status: 403, message: 'Access restricted to @myfrido.com accounts.' };
  }

  // Allowlist + role check from DB
  const profile = await getUserProfile(email);
  if (!profile) {
    return {
      ok: false,
      status: 403,
      message: 'Access not granted. Request access from the Analytics team at accounts@myfrido.com.',
    };
  }
  if (!profile.is_active) {
    return { ok: false, status: 403, message: 'Your access has been deactivated. Contact accounts@myfrido.com.' };
  }

  return { ok: true, user: { email, role: profile.role, name: profile.full_name } };
}
