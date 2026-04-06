import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST() {
  try {
    // 1. Gather Analytics Context
    const summaryRes = await query(`
      SELECT 
        COUNT(*) as total_callbacks,
        SUM(CASE WHEN event = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN event = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN event = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(credit) as total_credits
      FROM sms_callbacks
    `);
    
    // 2. Gather Failure Reasons
    const failureRes = await query(`
      SELECT failure_reason, COUNT(*) as count 
      FROM sms_callbacks 
      WHERE event = 'failed' 
      GROUP BY failure_reason
      ORDER BY count DESC
      LIMIT 10
    `);

    const summary = summaryRes.rows[0];
    const total = parseInt(summary.total_callbacks) || 0;
    const delivered = parseInt(summary.delivered) || 0;
    const failed = parseInt(summary.failed) || 0;
    const credits = parseFloat(summary.total_credits) || 0;
    const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(2) : 0;
    
    const failures = failureRes.rows.map(r => `${r.count}x: ${r.failure_reason}`).join(', ');

    // 3. Construct Prompt
    const promptContext = `
You are an expert data analyst AI evaluating bulk SMS delivery metrics. 
Here is the current platform performance data:
- Total Callbacks Received: ${total}
- Messages Delivered: ${delivered}
- Messages Failed: ${failed}
- Success Rate: ${deliveryRate}%
- Total Cost (Credits): ${credits.toFixed(2)}

Top failure reasons: 
${failures}

Please provide a highly concise, professional analysis in Markdown. 
Highlight the core insights: what is the overall health of the SMS campaigns, is the cost-to-delivery ratio acceptable, and what are the main reasons causing failures that the operational team should look into? 
Do not hallucinate data. Do not print out the raw numbers back as a list, strictly provide an analytical summary.
    `;

    // 4. Send to Ollama
    let OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    OLLAMA_URL = OLLAMA_URL.replace(/\/v1\/?$/, '').replace(/\/$/, '');
    const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder14b';

    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: promptContext,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama responded with status: ${ollamaResponse.status}`);
    }

    const aiData = await ollamaResponse.json();

    return NextResponse.json({ insight: aiData.response });

  } catch (error) {
    console.error('AI Insight Generation Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI insights. Check if Ollama is running and accessible.' },
      { status: 500 }
    );
  }
}
