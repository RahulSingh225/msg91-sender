/**
 * migrate.js — Backfill sms_callbacks from existing sms_events data.
 * Safe to run multiple times (uses payload_hash dedup).
 *
 * Usage: node migrate.js
 */
require('dotenv').config();
const { pool, ensureTables } = require('./db');
const crypto = require('crypto');

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

async function migrate() {
  await ensureTables();

  const client = await pool.connect();
  try {
    // Count existing sms_events
    const countRes = await client.query('SELECT count(*) as cnt FROM sms_events');
    const totalEvents = parseInt(countRes.rows[0].cnt);
    console.log(`Found ${totalEvents} rows in sms_events to migrate`);

    if (totalEvents === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    const BATCH = 500;
    let offset = 0;
    let inserted = 0;
    let skipped = 0;

    while (offset < totalEvents) {
      const res = await client.query(
        'SELECT id, received_at, payload, payload_hash FROM sms_events ORDER BY id LIMIT $1 OFFSET $2',
        [BATCH, offset]
      );

      for (const row of res.rows) {
        const p = row.payload || {};
        const hash = row.payload_hash || crypto.createHash('sha256').update(stableStringify(p)).digest('hex');

        try {
          await client.query(
            `INSERT INTO sms_callbacks(
              received_at, event, failure_reason, tel_num, credit, status,
              request_id, requested_at, delivery_time, sender_id,
              campaign_name, campaign_pid, sms_length, raw_payload, payload_hash
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (payload_hash) DO NOTHING`,
            [
              row.received_at,
              p.event || p.eventName || null,
              p.failureReason || null,
              p.telNum || null,
              p.credit ? parseFloat(p.credit) : null,
              p.status != null ? String(p.status) : null,
              p.requestId || null,
              parseTs(p.requestedAt),
              parseTs(p.deliveryTime),
              p.senderId || null,
              p.campaignName || null,
              p.campaign_pid || null,
              p.smsLength ? parseInt(p.smsLength) : null,
              p,
              hash
            ]
          );
          inserted++;
        } catch (err) {
          if (err.code === '23505') { // unique violation
            skipped++;
          } else {
            console.error(`Error migrating event id=${row.id}:`, err.message);
          }
        }
      }

      offset += BATCH;
      process.stdout.write(`\rProcessed ${Math.min(offset, totalEvents)}/${totalEvents} — inserted: ${inserted}, skipped: ${skipped}`);
    }

    console.log(`\nMigration complete. Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
