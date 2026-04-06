import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const exportCsv = searchParams.get('export') === 'true';
  const search = searchParams.get('search') || '';

  const offset = (page - 1) * limit;

  try {
    let whereClause = '1=1';
    let values = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (mobile LIKE $${paramIndex} OR var1 ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    const limitClause = exportCsv ? 'LIMIT 100000' : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const queryValues = exportCsv ? values : [...values, limit, offset];

    const dataRes = await query(`
      SELECT 
        id, batch_id, sent_at, mobile, var1, var2, extra_vars, template_id
      FROM sms_recipients 
      WHERE ${whereClause} 
      ORDER BY sent_at DESC 
      ${limitClause}
    `, queryValues);

    if (exportCsv) {
      return NextResponse.json(dataRes.rows);
    }

    const countRes = await query(`
      SELECT COUNT(*) as total FROM sms_recipients WHERE ${whereClause}
    `, values);

    return NextResponse.json({
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].total),
      page,
      limit
    });
  } catch (error) {
    console.error('Failed to fetch recipients:', error);
    return NextResponse.json({ error: 'Failed to fetch recipients' }, { status: 500 });
  }
}
