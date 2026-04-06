require('dotenv').config();
const { pool } = require('./db');

async function migrateOutgoing() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, sent_at, request_payload, response_body FROM sms_outgoing');
    console.log(`Found ${res.rows.length} rows in sms_outgoing to migrate.`);

    let inserted = 0;
    for (const row of res.rows) {
      const payload = row.request_payload || {};
      const recipients = payload.recipients || [];
      const templateId = payload.template_id || null;
      // We use the outgoing row ID to group the batch
      const batchId = `legacy_${row.id}`; 

      for (const r of recipients) {
        const mobile = r.mobiles ? String(r.mobiles).replace(/[^0-9]/g, '') : null;
        if (!mobile) continue;
        
        const var1 = r.var1 || r.VAR1 || null;
        const var2 = r.var2 || r.VAR2 || null;
        
        const extras = {};
        Object.keys(r).forEach(k => {
          if (!['mobiles', 'var1', 'var2', 'VAR1', 'VAR2'].includes(k)) {
            extras[k] = r[k];
          }
        });
        const extraVars = Object.keys(extras).length > 0 ? JSON.stringify(extras) : null;

        await client.query(
          `INSERT INTO sms_recipients(batch_id, sent_at, mobile, var1, var2, extra_vars, template_id) 
           VALUES($1, $2, $3, $4, $5, $6, $7)`,
          [batchId, row.sent_at, mobile, var1, var2, extraVars, templateId]
        );
        inserted++;
      }
    }

    console.log(`Successfully migrated ${inserted} recipients from sms_outgoing to sms_recipients.`);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateOutgoing();
