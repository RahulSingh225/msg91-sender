'use client';
import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];

export default function DashboardOverview() {
  const [summary, setSummary] = useState(null);
  const [failures, setFailures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [sumRes, failRes] = await Promise.all([
          fetch('/api/analytics/summary'),
          fetch('/api/analytics/failures')
        ]);
        
        const sumData = await sumRes.json();
        const failData = await failRes.json();
        
        setSummary(sumData);
        setFailures(failData);
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="page-title">Loading dashboard...</div>;
  if (!summary) return <div className="page-title">Failed to load data</div>;

  const generateInsight = async () => {
    setAiLoading(true);
    setAiInsight('');
    try {
      const res = await fetch('/api/ai-insights', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setAiInsight('Error: ' + data.error);
      } else {
        setAiInsight(data.insight);
      }
    } catch (err) {
      setAiInsight('Error: Failed to reach AI endpoint.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Platform Overview</h1>
        <button 
          onClick={generateInsight} 
          disabled={aiLoading}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {aiLoading ? 'Generating Analysis...' : '✨ Generate AI Insights'}
        </button>
      </div>

      {(aiInsight || aiLoading) && (
        <div className="glass-panel" style={{ marginBottom: '40px', borderColor: 'var(--accent-primary)', background: 'rgba(99, 102, 241, 0.05)' }}>
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)' }}>
            ✨ Ollama Qwen2.5 Analysis
          </h2>
          {aiLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Processing metrics through LLM...</p>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '15px' }}>
              {aiInsight}
            </div>
          )}
        </div>
      )}
      
      <div className="kpi-grid">
        <div className="glass-panel kpi-card">
          <div className="kpi-label">Total Callbacks</div>
          <div className="kpi-value">{summary.total.toLocaleString()}</div>
        </div>
        <div className="glass-panel kpi-card success">
          <div className="kpi-label">Delivered</div>
          <div className="kpi-value">{summary.delivered.toLocaleString()}</div>
        </div>
        <div className="glass-panel kpi-card danger">
          <div className="kpi-label">Failed</div>
          <div className="kpi-value">{summary.failed.toLocaleString()}</div>
        </div>
        <div className="glass-panel kpi-card">
          <div className="kpi-label">Delivery Rate</div>
          <div className="kpi-value">{summary.deliveryRate}%</div>
        </div>
        <div className="glass-panel kpi-card">
          <div className="kpi-label">Credits Spent</div>
          <div className="kpi-value">₹ {summary.credits.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="glass-panel chart-container">
          <h2 className="section-title">Failure Reasons Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={failures} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
              <XAxis type="number" stroke="#9494a0" />
              <YAxis dataKey="reason" type="category" width={150} stroke="#9494a0" fontSize={12} tickFormatter={(val) => val.length > 20 ? val.substring(0, 20) + '...' : val} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(10,10,15,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                itemStyle={{ color: '#f0f0f5' }}
              />
              <Bar dataKey="count" fill="url(#colorUv)" radius={[0, 4, 4, 0]}>
                {failures.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="glass-panel chart-container">
          <h2 className="section-title">Event Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Delivered', value: summary.delivered },
                  { name: 'Failed', value: summary.failed },
                  { name: 'Rejected', value: summary.rejected }
                ]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#10b981" />
                <Cell fill="#ef4444" />
                <Cell fill="#f59e0b" />
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(10,10,15,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
