import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // We aggregate data from sms_callbacks
    const summaryRes = await query(`
      SELECT 
        COUNT(*) as total_callbacks,
        SUM(CASE WHEN event = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN event = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN event = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(credit) as total_credits
      FROM sms_callbacks
    `);

    const data = summaryRes.rows[0];
    
    // Calculate percentages
    const total = parseInt(data.total_callbacks) || 0;
    const delivered = parseInt(data.delivered) || 0;
    const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(2) : 0;

    return NextResponse.json({
      total: total,
      delivered: delivered,
      failed: parseInt(data.failed) || 0,
      rejected: parseInt(data.rejected) || 0,
      credits: parseFloat(data.total_credits) || 0,
      deliveryRate: parseFloat(deliveryRate)
    });
  } catch (error) {
    console.error('Failed to fetch analytics summary:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics summary' }, { status: 500 });
  }
}
