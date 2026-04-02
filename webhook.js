require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csvWriter = require('fast-csv');
const AWS = require('aws-sdk');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const CALLBACKS_CSV = process.env.CALLBACKS_CSV || 'callbacks.csv';

if (!DATABASE_URL) {
  console.warn('DATABASE_URL not set — webhook will still accept callbacks but DB inserts will fail');
}

const pool = new Pool({ connectionString: DATABASE_URL });

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

async function ensureTable() {
  if (!DATABASE_URL) return;
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS sms_events (
      id bigserial PRIMARY KEY,
      received_at timestamptz DEFAULT now(),
      payload jsonb
    )`);
  } finally {
    client.release();
  }
}

function appendCsv(obj) {
  const fileExists = fs.existsSync(CALLBACKS_CSV);
  const ws = fs.createWriteStream(CALLBACKS_CSV, { flags: 'a' });
  const headers = Object.keys(obj);
  // fast-csv writer can write headers only when file is new
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

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const body = req.body;
  // Insert into Postgres
  if (DATABASE_URL) {
    try {
      await pool.query('INSERT INTO sms_events(payload) VALUES($1)', [body]);
    } catch (err) {
      console.error('DB insert failed', err.message);
    }
  }

  // Append to CSV
  try {
    appendCsv(body);
    if (s3 && process.env.S3_BUCKET) {
      await uploadCsvToS3();
    }
  } catch (err) {
    console.error('CSV/S3 write failed', err.message);
  }

  res.status(200).send({ ok: true });
});

app.get('/health', (req, res) => res.send({ ok: true }));

(async () => {
  await ensureTable();
  app.listen(PORT, () => console.log('Webhook listening on', PORT));
})();
