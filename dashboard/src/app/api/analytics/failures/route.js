import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Only look at failed events and count them by reason
    const res = await query(`
      SELECT 
        failure_reason, 
        COUNT(*) as count 
      FROM sms_callbacks 
      WHERE event = 'failed' 
      GROUP BY failure_reason
      ORDER BY count DESC
    `);

    // Clean up empty reasons
    const failures = res.rows.map(row => ({
      reason: row.failure_reason || 'Unknown',
      count: parseInt(row.count)
    }));

    return NextResponse.json(failures);
  } catch (error) {
    console.error('Failed to fetch failure analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch failure analytics' }, { status: 500 });
  }
}
