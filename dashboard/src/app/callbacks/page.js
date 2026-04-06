'use client';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export default function CallbacksPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterEvent, setFilterEvent] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const limit = 50;

  const fetchCallbacks = async () => {
    setLoading(true);
    try {
      const url = new URL(window.location.origin + '/api/callbacks');
      url.searchParams.append('page', page);
      url.searchParams.append('limit', limit);
      if (filterEvent) url.searchParams.append('event', filterEvent);
      if (search) url.searchParams.append('search', search);

      const res = await fetch(url);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      console.error('Failed to load callbacks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallbacks();
  }, [page, filterEvent]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCallbacks();
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const url = new URL(window.location.origin + '/api/callbacks');
      url.searchParams.append('export', 'true');
      if (filterEvent) url.searchParams.append('event', filterEvent);
      if (search) url.searchParams.append('search', search);

      const res = await fetch(url);
      const exportData = await res.json();

      const ws = XLSX.utils.json_to_sheet(exportData.map(row => ({
        'Received At': new Date(row.received_at).toLocaleString(),
        'Event': row.event,
        'Mobile': row.tel_num,
        'Failure Reason': row.failure_reason || '',
        'Credit': row.credit,
        'Request ID': row.request_id,
        'Requested At': row.requested_at ? new Date(row.requested_at).toLocaleString() : '',
        'Delivery Time': row.delivery_time ? new Date(row.delivery_time).toLocaleString() : '',
        'Campaign': row.campaign_name
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Callbacks");
      XLSX.writeFile(wb, `MSG91_Callbacks_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      <h1 className="page-title">Callback Reports</h1>
      
      <div className="controls-bar">
        <form onSubmit={handleSearch} className="input-group">
          <input 
            type="text" 
            placeholder="Search mobile..." 
            className="input-field" 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select 
            className="input-field"
            value={filterEvent}
            onChange={e => { setFilterEvent(e.target.value); setPage(1); }}
          >
            <option value="">All Events</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="rejected">Rejected</option>
          </select>
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
                <th>Time</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Failure Reason</th>
                <th>Campaign</th>
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
                    <td>{new Date(row.received_at).toLocaleString()}</td>
                    <td>{row.tel_num}</td>
                    <td>
                      <span className={`status-badge ${row.event}`}>
                        {row.event}
                      </span>
                    </td>
                    <td style={{ color: 'var(--danger)', fontSize: '13px' }}>{row.failure_reason || '-'}</td>
                    <td>{row.campaign_name || '-'}</td>
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
