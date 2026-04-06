'use client';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export default function RecipientsPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const limit = 50;

  const fetchRecipients = async () => {
    setLoading(true);
    try {
      const url = new URL(window.location.origin + '/api/recipients');
      url.searchParams.append('page', page);
      url.searchParams.append('limit', limit);
      if (search) url.searchParams.append('search', search);

      const res = await fetch(url);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      console.error('Failed to load recipients', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, [page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchRecipients();
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const url = new URL(window.location.origin + '/api/recipients');
      url.searchParams.append('export', 'true');
      if (search) url.searchParams.append('search', search);

      const res = await fetch(url);
      const exportData = await res.json();

      const ws = XLSX.utils.json_to_sheet(exportData.map(row => ({
        'Sent At': new Date(row.sent_at).toLocaleString(),
        'Batch ID': row.batch_id,
        'Mobile': row.mobile,
        'Name (var1)': row.var1 || '',
        'Amount (var2)': row.var2 || '',
        'Template ID': row.template_id || ''
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "SMS History");
      XLSX.writeFile(wb, `MSG91_History_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export', err);
      alert('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="page-title">SMS History (Recipients)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Track exactly what amount (var2) was communicated to whom (var1) over time.
      </p>

      <div className="controls-bar">
        <form onSubmit={handleSearch} className="input-group">
          <input 
            type="text" 
            placeholder="Search mobile or name..." 
            className="input-field" 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>

        <button onClick={exportToExcel} disabled={exporting} className="btn" style={{ background: '#10b981', color: 'white' }}>
          {exporting ? 'Exporting...' : 'Export to Excel'}
        </button>
      </div>

      <div className="glass-panel">
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sent At</th>
                <th>Mobile</th>
                <th>Name (var1)</th>
                <th>Amount (var2)</th>
                <th>Batch ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{textAlign: 'center'}}>Loading...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={5} style={{textAlign: 'center'}}>No records found</td></tr>
              ) : (
                data.map((row, i) => (
                  <tr key={i}>
                    <td>{new Date(row.sent_at).toLocaleString()}</td>
                    <td style={{ fontWeight: 600 }}>{row.mobile}</td>
                    <td>{row.var1 || '-'}</td>
                    <td style={{ color: 'var(--success)', fontWeight: '600' }}>
                      {row.var2 ? `₹ ${row.var2}` : '-'}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {row.batch_id ? row.batch_id.substring(0, 8) + '...' : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
