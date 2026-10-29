// When the Anthropic API refuses because of credits / billing / quota, Pulse shows a clear "temporarily unavailable"
// message instead of "Chat failed", and the team gets one alert email per hour (per running instance).
import { sendAlertEmail } from './mailer.js';

const ONE_HOUR = 60 * 60 * 1000;
let lastAlertAt = 0;

export const UNAVAILABLE_MESSAGE = 'Pulse is temporarily unavailable — the team has been notified';

// Anthropic error shapes: { status: 400, error: { error: { type, message } } } or a plain Error with the message.
export function isBillingError(err) {
  const msg = String(err?.error?.error?.message || err?.message || '');
  const type = String(err?.error?.error?.type || err?.error?.type || '');
  return err?.status === 402
    || /billing_error|insufficient_quota|quota/i.test(type)
    || /credit balance|billing|plans & billing|insufficient (credit|funds)|quota|payment required/i.test(msg);
}

export async function alertBilling(err, user) {
  if (Date.now() - lastAlertAt < ONE_HOUR) return false;
  lastAlertAt = Date.now();
  const detail = String(err?.error?.error?.message || err?.message || 'unknown').slice(0, 300);
  try {
    await sendAlertEmail(
      'Frido Pulse is DOWN — Anthropic API credits / billing',
      [
        'Frido Pulse cannot answer: the Anthropic API refused the request (credit / billing / quota).',
        `<strong>Message from Anthropic:</strong> ${detail.replace(/</g, '&lt;')}`,
        `Last user affected: <strong>${user?.email || 'unknown'}</strong>`,
        `Fix: add credits in the Anthropic console (Plans &amp; Billing). Users see "${UNAVAILABLE_MESSAGE}". This alert is sent at most once per hour per running instance.`,
      ]
    );
  } catch (e) {
    console.error('billing alert email failed:', e.message);
  }
  return true;
}
