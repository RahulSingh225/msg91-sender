require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const { Pool } = require('pg');

const AUTHKEY = process.env.AUTHKEY;
const TEMPLATE_ID = process.env.TEMPLATE_ID;
const SHORT_URL = process.env.SHORT_URL || '0';
const REALTIME = process.env.REALTIME || '1';

if (!AUTHKEY || !TEMPLATE_ID) {
  console.error('Missing AUTHKEY or TEMPLATE_ID in environment');
  process.exit(1);
}

const input = process.argv[2] || 'pincodes.csv';

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL });
}

async function ensureOutgoingTable() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS sms_outgoing (
      id bigserial PRIMARY KEY,
      sent_at timestamptz DEFAULT now(),
      recipient text,
      request_payload jsonb,
      response_status int,
      response_body jsonb
    )`);
  } finally {
    client.release();
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendRecipient(row) {
  const mobiles = row.mobiles || row.mobile || row.phone || row.telNum;
  if (!mobiles) {
    console.warn('Skipping row without mobile:', row);
    return;
  }

  // Build recipient object: include all keys except mobiles
  const recipient = { mobiles };
  Object.keys(row).forEach(k => {
    if (k === 'mobiles' || k === 'mobile' || k === 'phone' || k === 'telNum') return;
    // MSG91 template variables should match the keys used here
    recipient[k] = row[k];
  });

  const payload = {
    template_id: TEMPLATE_ID,
    short_url: SHORT_URL,
    realTimeResponse: REALTIME,
    recipients: [recipient]
  };

  try {
    const res = await axios.post('https://control.msg91.com/api/v5/flow', payload, {
      headers: {
        accept: 'application/json',
        authkey: AUTHKEY,
        'content-type': 'application/json'
      },
      timeout: 15000
    });
    console.log('Sent to', mobiles, 'status', res.status, res.data);
    if (pool) {
      try {
        await pool.query(
          'INSERT INTO sms_outgoing(recipient, request_payload, response_status, response_body) VALUES($1,$2,$3,$4)',
          [mobiles, payload, res.status, res.data]
        );
      } catch (dbErr) {
        console.error('Failed to insert outgoing response to DB', dbErr.message);
      }
    }
  } catch (err) {
    const errBody = err && err.response ? err.response.data : { message: err.message };
    console.error('Error sending to', mobiles, errBody);
    if (pool) {
      try {
        await pool.query(
          'INSERT INTO sms_outgoing(recipient, request_payload, response_status, response_body) VALUES($1,$2,$3,$4)',
          [mobiles, payload, err.response ? err.response.status : null, errBody]
        );
      } catch (dbErr) {
        console.error('Failed to insert outgoing error to DB', dbErr.message);
      }
    }
  }
}

async function run() {
  await ensureOutgoingTable();
  const rows = [];
  fs.createReadStream(input)
    .pipe(csv())
    .on('data', (data) => rows.push(data))
    .on('end', async () => {
      console.log('Read', rows.length, 'rows from', input);
      for (const row of rows) {
        await sendRecipient(row);
        // small delay to avoid hitting provider rate limits
        await sleep(150);
      }
      console.log('All messages queued');
    });
}

run();
