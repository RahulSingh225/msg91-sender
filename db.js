require('dotenv').config();
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { pgTable, serial, text, timestamp, jsonb, integer } = require('drizzle-orm/pg-core');

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : new Pool();

const db = drizzle(pool);

const sms_outgoing = pgTable('sms_outgoing', {
  id: serial('id').primaryKey(),
  sent_at: timestamp('sent_at').defaultNow(),
  recipient: text('recipient'),
  request_payload: jsonb('request_payload'),
  response_status: integer('response_status'),
  response_body: jsonb('response_body')
});

const sms_events = pgTable('sms_events', {
  id: serial('id').primaryKey(),
  received_at: timestamp('received_at').defaultNow(),
  payload: jsonb('payload')
});

async function ensureTables() {
  if (!DATABASE_URL) return;
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
    await client.query(`CREATE TABLE IF NOT EXISTS sms_events (
      id bigserial PRIMARY KEY,
      received_at timestamptz DEFAULT now(),
      payload jsonb
    )`);
  } finally {
    client.release();
  }
}

module.exports = { pool, db, sms_outgoing, sms_events, ensureTables };
