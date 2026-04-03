require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('DATABASE_URL not set — webhook will still accept callbacks but DB inserts will fail');
}

const pool = new Pool({ connectionString: DATABASE_URL });

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

  res.status(200).send({ ok: true });
});

app.get('/health', (req, res) => res.send({ ok: true }));

(async () => {
  await ensureTable();
  app.listen(PORT, () => console.log('Webhook listening on', PORT));
})();
