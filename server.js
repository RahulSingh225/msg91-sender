require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { db, sms_outgoing, sms_events, ensureTables } = require('./db');
const csvWriter = require('fast-csv');
const AWS = require('aws-sdk');

const PORT = process.env.PORT || 3000;
const AUTHKEY = process.env.AUTHKEY;
const TEMPLATE_ID = process.env.TEMPLATE_ID;
const SHORT_URL = process.env.SHORT_URL || '0';
const REALTIME = process.env.REALTIME || '1';
const CALLBACKS_CSV = process.env.CALLBACKS_CSV || 'callbacks.csv';

if (!AUTHKEY || !TEMPLATE_ID) {
  console.warn('AUTHKEY or TEMPLATE_ID not set — sending will fail until configured');
}

// Optional S3
let s3 = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION) {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
  });
  s3 = new AWS.S3();
}

function appendCsv(obj) {
  const fileExists = fs.existsSync(CALLBACKS_CSV);
  const ws = fs.createWriteStream(CALLBACKS_CSV, { flags: 'a' });
  const headers = Object.keys(obj);
  const csvStream = csvWriter.format({ headers: !fileExists ? headers : false });
  csvStream.pipe(ws);
  csvStream.write(obj);
  csvStream.end();
}

async function uploadCsvToS3() {
  if (!s3 || !process.env.S3_BUCKET) return;
  const body = fs.readFileSync(CALLBACKS_CSV);
  const key = path.basename(CALLBACKS_CSV);
  await s3.putObject({ Bucket: process.env.S3_BUCKET, Key: key, Body: body }).promise();
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

  try {
    const result = await sendFlow(recipients);
    // store outgoing summary
    try {
      await db.insert(sms_outgoing).values({
        recipient: JSON.stringify(recipients.map(r => r.mobiles || r.mobile || r.phone || r.telNum)),
        request_payload: { recipients },
        response_status: result.status,
        response_body: result.data
      });
    } catch (dbErr) {
      console.error('DB insert failed', dbErr.message);
    }
    res.status(200).send({ ok: true, result });
  } catch (err) {
    const errBody = err && err.response ? err.response.data : { message: err.message };
    try {
      await db.insert(sms_outgoing).values({
        recipient: JSON.stringify(recipients.map(r => r.mobiles || r.mobile || r.phone || r.telNum)),
        request_payload: { recipients },
        response_status: err.response ? err.response.status : null,
        response_body: errBody
      });
    } catch (dbErr) {
      console.error('DB insert failed', dbErr.message);
    }
    res.status(500).send({ error: errBody });
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  try {
    if (process.env.DATABASE_URL) {
      await db.insert(sms_events).values({ payload: body });
    }
  } catch (err) {
    console.error('DB insert failed', err.message);
  }

  try {
    appendCsv(body);
    if (s3 && process.env.S3_BUCKET) await uploadCsvToS3();
  } catch (err) {
    console.error('CSV/S3 write failed', err.message);
  }

  res.status(200).send({ ok: true });
});

app.get('/health', (req, res) => res.send({ ok: true }));

(async () => {
  await ensureTables();
  app.listen(PORT, () => console.log('Server listening on', PORT));
})();
