require('dotenv').config();
const express = require('express');
const { pool, ensureTables } = require('./db');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('DATABASE_URL not set — webhook will still accept callbacks but DB inserts will fail');
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function parseTs(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (DATABASE_URL) {
    try {
      const hash = crypto.createHash('sha256').update(stableStringify(body)).digest('hex');

      await pool.query(
        `INSERT INTO sms_callbacks(
          event, failure_reason, tel_num, credit, status,
          request_id, requested_at, delivery_time, sender_id,
          campaign_name, campaign_pid, sms_length, raw_payload, payload_hash
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (payload_hash) DO NOTHING`,
        [
          body.event || body.eventName || null,
          body.failureReason || null,
          body.telNum || null,
          body.credit ? parseFloat(body.credit) : null,
          body.status != null ? String(body.status) : null,
          body.requestId || null,
          parseTs(body.requestedAt),
          parseTs(body.deliveryTime),
          body.senderId || null,
          body.campaignName || null,
          body.campaign_pid || null,
          body.smsLength ? parseInt(body.smsLength) : null,
          body,
          hash
        ]
      );
    } catch (err) {
      console.error('Webhook insert failed:', err.message);
    }
  }

  res.status(200).send({ ok: true });
});

app.get('/health', (req, res) => res.send({ ok: true }));

(async () => {
  await ensureTables();
  app.listen(PORT, () => console.log('Webhook listening on', PORT));
})();
