require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const { Pool } = require('pg');

const AUTHKEY = process.env.AUTHKEY;
const TEMPLATE_ID = process.env.TEMPLATE_ID;
const SHORT_URL = process.env.SHORT_URL || '0';
const SHORT_URL_EXPIRY = process.env.SHORT_URL_EXPIRY;
const REALTIME = process.env.REALTIME || '1';

if (!AUTHKEY || !TEMPLATE_ID) {
  console.error('Missing AUTHKEY or TEMPLATE_ID in environment');
  process.exit(1);
}

const argv = process.argv.slice(2);
// first non-flag arg is input file
const inputArg = argv.find(a => !a.startsWith('-'));
const input = inputArg || 'pincodes.csv';
let DRY_RUN = process.env.DRY_RUN === '1' || argv.includes('--dry');
const TRIAL = argv.includes('--trial');
// Trial overrides dry-run to actually call API so response can be logged
if (TRIAL) DRY_RUN = false;
const BATCH_SIZE = 50;

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

function buildRecipientFromRow(row) {
  const mobiles = row.mobiles || row.mobile || row.phone || row.telNum || row.mobile_number || row.Mobile;
  if (!mobiles) return null;
  const recipient = { mobiles };
  // Map var1/var2 to uppercase keys expected by the template (VAR1, VAR2)
  if (row.var1 !== undefined || row.VAR1 !== undefined) recipient.var1 = row.var1 || row.VAR1;
  if (row.var2 !== undefined || row.VAR2 !== undefined) recipient.var2 = row.var2 || row.VAR2;
  // include any additional keys (excluding mobile fields)
  Object.keys(row).forEach(k => {
    if (['mobiles','mobile','phone','telNum','mobile_number','Mobile','var1','var2'].includes(k)) return;
    recipient[k] = row[k];
  });
  return recipient;
}

async function sendBatch(recipients) {
  if (!recipients || recipients.length === 0) return;
  // normalize mobile numbers: ensure country code 91 prefix
  function normalizeMobile(m) {
    if (!m) return m;
    const s = String(m).replace(/[^0-9]/g, '');
    
    return '91' + s;
  }

  const normalizedRecipients = recipients.map(r => ({ ...r, mobiles: normalizeMobile(r.mobiles) }));

  const payload = {
    template_id: TEMPLATE_ID,
    short_url: SHORT_URL,
    realTimeResponse: REALTIME,
    recipients: normalizedRecipients
  };

  if (typeof SHORT_URL_EXPIRY !== 'undefined' && SHORT_URL_EXPIRY !== '') {
    const n = Number(SHORT_URL_EXPIRY);
    payload.short_url_expiry = isNaN(n) ? SHORT_URL_EXPIRY : n;
  }

  if (DRY_RUN) {
    console.log('DRY RUN - would send payload:', JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const res = await axios.post('https://control.msg91.com/api/v5/flow', payload, {
      headers: {
        accept: 'application/json',
        authkey: AUTHKEY,
        'content-type': 'application/json'
      },
      timeout: 15000
    });
    console.log('Batch sent, status', res.status, 'response:', JSON.stringify(res.data));
    if (pool) {
      try {
        const recipientList = JSON.stringify(recipients.map(r => r.mobiles));
        await pool.query(
          'INSERT INTO sms_outgoing(recipient, request_payload, response_status, response_body) VALUES($1,$2,$3,$4)',
          [recipientList, payload, res.status, res.data]
        );
      } catch (dbErr) {
        console.error('Failed to insert outgoing response to DB', dbErr.message);
      }
    }
  } catch (err) {
    const errBody = err && err.response ? err.response.data : { message: err.message };
    console.error('Batch send error', errBody);
    if (pool) {
      try {
        const recipientList = JSON.stringify(recipients.map(r => r.mobiles));
        await pool.query(
          'INSERT INTO sms_outgoing(recipient, request_payload, response_status, response_body) VALUES($1,$2,$3,$4)',
          [recipientList, payload, err.response ? err.response.status : null, errBody]
        );
      } catch (dbErr) {
        console.error('Failed to insert outgoing error to DB', dbErr.message);
      }
    }
  }
}

async function run() {
  await ensureOutgoingTable();
  const ext = path.extname(input).toLowerCase();
  // helper to split into chunks
  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  if (ext === '.json') {
    try {
      const raw = await fs.promises.readFile(input, 'utf8');
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : (parsed.recipients || []);
      console.log('Read', rows.length, 'items from', input);
      const recipients = rows.map(buildRecipientFromRow).filter(Boolean);
      const batches = chunkArray(recipients, BATCH_SIZE);
      for (const batch of batches) {
        await sendBatch(batch);
        await sleep(150);
      }
      console.log('All messages queued');
    } catch (err) {
      console.error('Failed to read/parse JSON input', err.message);
    }
  } else {
    const rows = [];
    // If --trial was provided, send single hard-coded recipient and return
    if (TRIAL) {
      const trialRow = { mobile: '8918379567', var1: 'rahul', var2: '2000' };
      const recipient = buildRecipientFromRow(trialRow);
      if (recipient) {
        console.log('Running TRIAL: sending one recipient:', recipient);
        await sendBatch([recipient]);
      } else {
        console.error('Failed to build trial recipient');
      }
      return;
    }

    fs.createReadStream(input)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', async () => {
        console.log('Read', rows.length, 'rows from', input);
        const recipients = rows.map(buildRecipientFromRow).filter(Boolean);
        const batches = chunkArray(recipients, BATCH_SIZE);
        for (const batch of batches) {
          await sendBatch(batch);
          // small delay to avoid hitting provider rate limits
          await sleep(150);
        }
        console.log('All messages queued');
      })
      .on('error', (err) => console.error('CSV read error', err.message));
  }
}

run();
