import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import './TablePage.css';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    object_type: '',
    object_id: '',
  });

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchLogs = async () => {
    try {
      let url = '/audit-logs/';
      const params = new URLSearchParams();
      if (filter.object_type) params.append('object_type', filter.object_type);
      if (filter.object_id) params.append('object_id', filter.object_id);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      setLogs(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Audit Logs</h1>
      </div>

      {/* Filters */}
      <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
        <h3 className="filter-card__title">Filters</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>Type</label>
            <select
              value={filter.object_type}
              onChange={(e) => setFilter({ ...filter, object_type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="order">Order</option>
              <option value="inventory_item">Inventory Item</option>
              <option value="sale">Sale</option>
              <option value="dispatch">Dispatch</option>
            </select>
          </div>
          <div className="filter-field">
            <label>ID</label>
            <input
              type="number"
              value={filter.object_id}
              onChange={(e) => setFilter({ ...filter, object_id: e.target.value })}
              placeholder="Object #"
            />
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Object Type</th>
              <th>Object ID</th>
              <th>Previous Status</th>
              <th>New Status</th>
              <th>Changed By</th>
              <th>Timestamp</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>
                  No audit logs found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>#{log.id}</td>
                  <td>{log.object_type.replace('_', ' ')}</td>
                  <td>#{log.object_id}</td>
                  <td>{log.previous_status || '-'}</td>
                  <td>
                    <span className={`status-badge ${log.new_status}`}>
                      {log.new_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{log.changed_by_detail?.username || '-'}</td>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.notes || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td colSpan="3" style={{ textAlign: 'right' }}>
                {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </td>
              <td colSpan="2">—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;

