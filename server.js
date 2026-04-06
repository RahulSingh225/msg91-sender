require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { pool, db, sms_recipients, sms_callbacks, ensureTables } = require('./db');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const AUTHKEY = process.env.AUTHKEY;
const TEMPLATE_ID = process.env.TEMPLATE_ID;
const SHORT_URL = process.env.SHORT_URL || '0';
const REALTIME = process.env.REALTIME || '1';

if (!AUTHKEY || !TEMPLATE_ID) {
  console.warn('AUTHKEY or TEMPLATE_ID not set — sending will fail until configured');
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

async function sendFlow(recipients) {
  const payload = {
    template_id: TEMPLATE_ID,
    short_url: SHORT_URL,
    realTimeResponse: REALTIME,
    recipients
  };
  const res = await axios.post('https://control.msg91.com/api/v5/flow', payload, {
    headers: {
      accept: 'application/json',
      authkey: AUTHKEY,
      'content-type': 'application/json'
    },
    timeout: 15000
  });
  return { status: res.status, data: res.data };
}

const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  const recipients = req.body.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).send({ error: 'Provide recipients array in JSON body' });
  }

  const BATCH_ID = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

  // Insert into new sms_recipients
  try {
    const records = recipients.map(r => ({
      batch_id: BATCH_ID,
      mobile: String(r.mobiles || r.mobile || r.phone || r.telNum).replace(/[^0-9]/g, ''),
      var1: r.var1 || r.VAR1 || null,
      var2: r.var2 || r.VAR2 || null,
      template_id: TEMPLATE_ID,
      extra_vars: r
    }));
    await db.insert(sms_recipients).values(records);
  } catch (err) {
    console.error('Failed to insert into sms_recipients', err.message);
  }

  try {
    const result = await sendFlow(recipients);
    res.status(200).send({ ok: true, result });
  } catch (err) {
    const errBody = err && err.response ? err.response.data : { message: err.message };
    res.status(500).send({ error: errBody });
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  try {
    if (process.env.DATABASE_URL) {
      const hash = crypto.createHash('sha256').update(stableStringify(body)).digest('hex');

      // Exclusively insert into flattened sms_callbacks 
      try {
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
      } catch (cbErr) {
        console.error('sms_callbacks insert failed', cbErr.message);
      }
    }
  } catch (err) {
    console.error('Webhook error', err.message);
  }

  res.status(200).send({ ok: true });
});

app.get('/health', (req, res) => res.send({ ok: true }));

(async () => {
  await ensureTables();
  app.listen(PORT, () => console.log('Server listening on', PORT));
})();
