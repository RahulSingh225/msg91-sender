require('dotenv').config();
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { pgTable, serial, text, timestamp, jsonb, integer, numeric } = require('drizzle-orm/pg-core');

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : new Pool();

const db = drizzle(pool);

// --- New tables exclusively ---
const sms_recipients = pgTable('sms_recipients', {
  id: serial('id').primaryKey(),
  batch_id: text('batch_id'),
  sent_at: timestamp('sent_at').defaultNow(),
  mobile: text('mobile'),
  var1: text('var1'),
  var2: text('var2'),
  extra_vars: jsonb('extra_vars'),
  template_id: text('template_id')
});

const sms_callbacks = pgTable('sms_callbacks', {
  id: serial('id').primaryKey(),
  received_at: timestamp('received_at').defaultNow(),
  event: text('event'),
  failure_reason: text('failure_reason'),
  tel_num: text('tel_num'),
  credit: numeric('credit'),
  status: text('status'),
  request_id: text('request_id'),
  requested_at: timestamp('requested_at'),
  delivery_time: timestamp('delivery_time'),
  sender_id: text('sender_id'),
  campaign_name: text('campaign_name'),
  campaign_pid: text('campaign_pid'),
  sms_length: integer('sms_length'),
  raw_payload: jsonb('raw_payload'),
  payload_hash: text('payload_hash')
});

async function ensureTables() {
  if (!DATABASE_URL) return;
  const client = await pool.connect();
  try {
    // New: sms_recipients
    await client.query(`CREATE TABLE IF NOT EXISTS sms_recipients (
      id bigserial PRIMARY KEY,
      batch_id text,
      sent_at timestamptz DEFAULT now(),
      mobile text NOT NULL,
      var1 text,
      var2 text,
      extra_vars jsonb,
      template_id text
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recipients_mobile ON sms_recipients(mobile)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recipients_batch ON sms_recipients(batch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recipients_sent_at ON sms_recipients(sent_at)`);

    // New: sms_callbacks (flattened from sms_events for fast analytics)
    await client.query(`CREATE TABLE IF NOT EXISTS sms_callbacks (
      id bigserial PRIMARY KEY,
      received_at timestamptz DEFAULT now(),
      event text,
      failure_reason text,
      tel_num text,
      credit numeric,
      status text,
      request_id text,
      requested_at timestamptz,
      delivery_time timestamptz,
      sender_id text,
      campaign_name text,
      campaign_pid text,
      sms_length int,
      raw_payload jsonb,
      payload_hash text UNIQUE
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_callbacks_event ON sms_callbacks(event)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_callbacks_tel ON sms_callbacks(tel_num)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_callbacks_requested ON sms_callbacks(requested_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_callbacks_failure ON sms_callbacks(failure_reason)`);
  } finally {
    client.release();
  }
}

module.exports = { pool, db, sms_recipients, sms_callbacks, ensureTables };
