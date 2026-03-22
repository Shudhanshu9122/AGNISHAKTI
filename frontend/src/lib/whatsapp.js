/**
 * AGNISHAKTI — WhatsApp Alert Service
 * Uses Twilio's REST API directly (no SDK) to send WhatsApp messages.
 *
 * Setup:
 *  1. Create a Twilio account at https://www.twilio.com
 *  2. Enable the WhatsApp Sandbox in Twilio Console → Messaging → Try it out → Send a WhatsApp message
 *  3. Each recipient must text "join <sandbox-word>" to the Twilio sandbox number once
 *  4. Add env vars (see .env.local.example comments below)
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID      — e.g. ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN       — Your Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM    — e.g. whatsapp:+14155238886  (Twilio sandbox number)
 *   WHATSAPP_ALERT_NUMBERS  — Comma-separated recipients: whatsapp:+91XXXXXXXXXX,whatsapp:+91YYYYYYYYYY
 *
 * Optional location env vars (used to build Google Maps link):
 *   CAMERA_LOCATION_NAME    — e.g. "Block A Laboratory"
 *   CAMERA_LATITUDE         — e.g. 12.8231
 *   CAMERA_LONGITUDE        — e.g. 80.0432
 */

/**
 * Send a WhatsApp message via Twilio REST API.
 * @param {Object} params
 * @param {string} params.to         - Recipient in format "whatsapp:+91XXXXXXXXXX"
 * @param {string} params.message    - Text body of the message
 * @param {string} [params.mediaUrl] - Optional publicly accessible image URL
 * @returns {Promise<Object>}         - Twilio API response JSON
 */
export async function sendWhatsAppAlert({ to, message, mediaUrl } = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      '[WhatsApp] Missing Twilio credentials. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in .env.local'
    );
  }

  if (!to) throw new Error('[WhatsApp] Recipient "to" is required');
  if (!message) throw new Error('[WhatsApp] Message body is required');

  const body = new URLSearchParams({ From: from, To: to, Body: message });
  if (mediaUrl) body.append('MediaUrl0', mediaUrl);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const responseJson = await res.json();

  if (!res.ok) {
    console.error('[WhatsApp] Twilio error:', responseJson);
    throw new Error(`[WhatsApp] Twilio API error ${res.status}: ${responseJson.message || JSON.stringify(responseJson)}`);
  }

  console.log(`[WhatsApp] ✅ Message sent to ${to}. SID: ${responseJson.sid}`);
  return responseJson;
}

/**
 * Send WhatsApp alerts to ALL configured recipients.
 * Failures for individual recipients are logged but do not throw.
 * @param {Object} params
 * @param {string} params.message    - Alert message text
 * @param {string} [params.mediaUrl] - Optional public image URL
 * @returns {Promise<{sent: number, failed: number}>}
 */
export async function sendWhatsAppAlertToAll({ message, mediaUrl } = {}) {
  const recipients = getAlertRecipients();

  if (recipients.length === 0) {
    console.warn('[WhatsApp] No recipients configured. Set WHATSAPP_ALERT_NUMBERS in .env.local');
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    recipients.map((to) => sendWhatsAppAlert({ to, message, mediaUrl }))
  );

  let sent = 0;
  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      sent++;
    } else {
      failed++;
      console.error(`[WhatsApp] ❌ Failed to send to ${recipients[i]}:`, result.reason?.message);
    }
  });

  console.log(`[WhatsApp] Alert batch complete. Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

/**
 * Parse the comma-separated WHATSAPP_ALERT_NUMBERS env var.
 * @returns {string[]} - Array of recipient strings like ["whatsapp:+91XXXXXXXXXX"]
 */
export function getAlertRecipients() {
  const raw = process.env.WHATSAPP_ALERT_NUMBERS || '';
  return raw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Build a formatted AGNISHAKTI alert message.
 * @param {Object} params
 * @param {string} params.className     - Detection class, e.g. "fire" or "smoke"
 * @param {number} params.confidence    - Confidence 0–1
 * @param {string} [params.alertId]     - Alert document ID
 * @param {boolean} [params.isUpdate]   - If true, shows "UPDATE" badge instead of initial alert
 * @returns {string}
 */
export function buildAlertMessage({ className, confidence, alertId, isUpdate = false }) {
  const locationName = process.env.CAMERA_LOCATION_NAME || 'Unknown Location';
  const lat = process.env.CAMERA_LATITUDE;
  const lng = process.env.CAMERA_LONGITUDE;
  const mapsLink =
    lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;

  const badge = isUpdate ? '🔄 *UPDATE*' : '🚨 *AGNISHAKTI ALERT*';
  const confidencePct = confidence ? `${(confidence * 100).toFixed(1)}%` : 'N/A';

  const lines = [
    badge,
    '',
    `*Threat Detected:* ${(className || 'fire').toUpperCase()}`,
    `*Confidence:* ${confidencePct}`,
    `*Location:* ${locationName}`,
  ];

  if (mapsLink) lines.push(`*Map:* ${mapsLink}`);
  if (alertId) lines.push(`*Alert ID:* ${alertId.slice(0, 8)}...`);

  if (isUpdate) {
    lines.push('', '⚠️ Threat is *still active*. Live snapshot attached.');
  } else {
    lines.push('', '⚠️ Immediate action required. Live snapshot attached.');
    lines.push('Updates will be sent every 30 seconds until threat clears.');
  }

  return lines.join('\n');
}
