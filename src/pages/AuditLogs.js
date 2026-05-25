import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import './TablePage.css';

const STATUS_TYPES = [
  { value: '', label: 'All types' },
  { value: 'order', label: 'Order' },
  { value: 'inventory_item', label: 'Inventory item' },
  { value: 'sale', label: 'Sale' },
  { value: 'dispatch', label: 'Dispatch' },
];

const ACTION_TYPES = [
  { value: '', label: 'All actions' },
  { value: 'orders.pay_order', label: 'Pay order' },
  { value: 'orders.pay_cargo', label: 'Pay cargo' },
  { value: 'orders.move_to_inventory', label: 'Move to inventory' },
  { value: 'sales.update_status', label: 'Sale status change' },
  { value: 'sales.complete_from_order', label: 'Complete from order' },
  { value: 'returns.mark_refunded', label: 'Mark refunded' },
  { value: 'cash.adjust', label: 'Cash adjust' },
];

const AuditLogs = () => {
  const [tab, setTab] = useState('actions');
  const [statusLogs, setStatusLogs] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState({ object_type: '', object_id: '' });
  const [actionFilter, setActionFilter] = useState({ action: '', object_type: '', object_id: '' });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (tab === 'status') {
          const params = new URLSearchParams();
          if (statusFilter.object_type) params.append('object_type', statusFilter.object_type);
          if (statusFilter.object_id) params.append('object_id', statusFilter.object_id);
          const url = params.toString() ? `/audit-logs/?${params}` : '/audit-logs/';
          const response = await api.get(url);
          setStatusLogs(response.data.results || response.data);
        } else {
          const params = new URLSearchParams();
          if (actionFilter.action) params.append('action', actionFilter.action);
          if (actionFilter.object_type) params.append('object_type', actionFilter.object_type);
          if (actionFilter.object_id) params.append('object_id', actionFilter.object_id);
          const url = params.toString() ? `/action-audit-logs/?${params}` : '/action-audit-logs/';
          const response = await api.get(url);
          setActionLogs(response.data.results || response.data);
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab, statusFilter, actionFilter]);

  const formatJson = (value) => {
    if (value == null) return '-';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Audit Logs</h1>
      </div>

      <div style={{ marginBottom: 16, gap: 8, display: 'flex' }}>
        <button type="button" className={tab === 'actions' ? 'btn-primary' : 'btn-edit'} onClick={() => setTab('actions')}>
          Permission-sensitive actions
        </button>
        <button type="button" className={tab === 'status' ? 'btn-primary' : 'btn-edit'} onClick={() => setTab('status')}>
          Status changes
        </button>
      </div>

      {tab === 'actions' ? (
        <>
          <div className="form-card filter-card" style={{ marginBottom: 16 }}>
            <h3 className="filter-card__title">Filters</h3>
            <div className="filter-toolbar">
              <div className="filter-field">
                <label>Action</label>
                <select value={actionFilter.action} onChange={(e) => setActionFilter({ ...actionFilter, action: e.target.value })}>
                  {ACTION_TYPES.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Object type</label>
                <input value={actionFilter.object_type} onChange={(e) => setActionFilter({ ...actionFilter, object_type: e.target.value })} placeholder="e.g. order" />
              </div>
              <div className="filter-field">
                <label>Object ID</label>
                <input type="number" value={actionFilter.object_id} onChange={(e) => setActionFilter({ ...actionFilter, object_id: e.target.value })} placeholder="#" />
              </div>
            </div>
          </div>

          <div className="table-card">
            {loading ? <p style={{ padding: 16 }}>Loading...</p> : (
              <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Action</th><th>Object</th><th>User</th><th>Timestamp</th><th>Before</th><th>After</th><th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionLogs.length === 0 ? (
                      <tr><td colSpan="8" style={{ textAlign: 'center' }}>No action audit logs found</td></tr>
                    ) : actionLogs.map((log) => (
                      <tr key={log.id}>
                        <td>#{log.id}</td>
                        <td><code>{log.action}</code></td>
                        <td>{log.object_type} #{log.object_id}</td>
                        <td>{log.username || '-'}</td>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatJson(log.before_state)}>{formatJson(log.before_state)}</td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatJson(log.after_state)}>{formatJson(log.after_state)}</td>
                        <td>{log.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="form-card filter-card" style={{ marginBottom: 16 }}>
            <h3 className="filter-card__title">Filters</h3>
            <div className="filter-toolbar">
              <div className="filter-field">
                <label>Type</label>
                <select value={statusFilter.object_type} onChange={(e) => setStatusFilter({ ...statusFilter, object_type: e.target.value })}>
                  {STATUS_TYPES.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>ID</label>
                <input type="number" value={statusFilter.object_id} onChange={(e) => setStatusFilter({ ...statusFilter, object_id: e.target.value })} placeholder="Object #" />
              </div>
            </div>
          </div>

          <div className="table-card">
            {loading ? <p style={{ padding: 16 }}>Loading...</p> : (
              <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Object Type</th><th>Object ID</th><th>Previous Status</th><th>New Status</th><th>Changed By</th><th>Timestamp</th><th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusLogs.length === 0 ? (
                      <tr><td colSpan="8" style={{ textAlign: 'center' }}>No status logs found</td></tr>
                    ) : statusLogs.map((log) => (
                      <tr key={log.id}>
                        <td>#{log.id}</td>
                        <td>{log.object_type.replace('_', ' ')}</td>
                        <td>#{log.object_id}</td>
                        <td>{log.previous_status || '-'}</td>
                        <td><span className={`status-badge ${log.new_status}`}>{log.new_status.replace('_', ' ')}</span></td>
                        <td>{log.changed_by_detail?.username || '-'}</td>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>{log.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogs;
