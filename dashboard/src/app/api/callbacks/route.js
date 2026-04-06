import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const exportCsv = searchParams.get('export') === 'true';
  const event = searchParams.get('event') || '';
  const search = searchParams.get('search') || '';

  const offset = (page - 1) * limit;

  try {
    let whereClause = '1=1';
    let values = [];
    let paramIndex = 1;

    if (event) {
      whereClause += ` AND event = $${paramIndex}`;
      values.push(event);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND tel_num LIKE $${paramIndex}`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Export gets all matching records without pagination limit (or a high limit)
    const limitClause = exportCsv ? 'LIMIT 100000' : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const queryValues = exportCsv ? values : [...values, limit, offset];

    const dataRes = await query(`
      SELECT 
        id, received_at, event, failure_reason, tel_num, credit, 
        request_id, requested_at, delivery_time, campaign_name
      FROM sms_callbacks 
      WHERE ${whereClause} 
      ORDER BY received_at DESC 
      ${limitClause}
    `, queryValues);

    if (exportCsv) {
      return NextResponse.json(dataRes.rows);
    }

    // Get total count for pagination
    const countRes = await query(`
      SELECT COUNT(*) as total FROM sms_callbacks WHERE ${whereClause}
    `, values);

    return NextResponse.json({
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].total),
      page,
      limit
    });
  } catch (error) {
    console.error('Failed to fetch callbacks:', error);
    return NextResponse.json({ error: 'Failed to fetch callbacks' }, { status: 500 });
  }
}
