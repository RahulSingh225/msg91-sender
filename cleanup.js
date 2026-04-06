require('dotenv').config();
const { pool } = require('./db');

async function cleanup() {
  const client = await pool.connect();
  try {
    console.log('Dropping legacy tables sms_outgoing and sms_events...');
    await client.query('DROP TABLE IF EXISTS sms_outgoing;');
    await client.query('DROP TABLE IF EXISTS sms_events;');
    console.log('Successfully dropped legacy tables.');
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup();
