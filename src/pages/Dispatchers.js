import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import './TablePage.css';

const DISPATCH_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'returned', label: 'Returned' },
  { value: 'failed', label: 'Delivery failed' },
];

const statusOptionsRow = DISPATCH_STATUSES.filter((s) => s.value);

const productLine = (sale) => {
  if (!sale?.product_detail) return '—';
  const p = sale.product_detail;
  return `${p.brand || ''} ${p.model || ''}`.trim() + (p.size ? ` · ${p.size}` : '') + (p.color ? ` (${p.color})` : '');
};

const formatCost = (d) => {
  const uzs = d.delivery_cost_uzs != null && parseFloat(d.delivery_cost_uzs) !== 0;
  const usd = d.delivery_cost != null && parseFloat(d.delivery_cost) !== 0;
  const parts = [];
  if (uzs) parts.push(`${parseFloat(d.delivery_cost_uzs).toLocaleString()} UZS`);
  if (usd) parts.push(`$${parseFloat(d.delivery_cost).toFixed(2)}`);
  return parts.length ? parts.join(' · ') : '—';
};

const Dispatchers = () => {
  const [loading, setLoading] = useState(true);
  const [dispatchers, setDispatchers] = useState([]);
  const [activeDispatchers, setActiveDispatchers] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDispatcher, setSelectedDispatcher] = useState(null);
  const [dispatcherDetail, setDispatcherDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    telephone: '+998',
    notes: '',
    is_active: true,
  });
  const [filters, setFilters] = useState({
    status: '',
    dispatcher: '',
  });

  const fetchDispatchers = useCallback(async () => {
    try {
      const res = await api.get('/dispatchers/');
      const list = res.data.results || res.data;
      setDispatchers(list);
    } catch (e) {
      console.error('Error fetching dispatchers:', e);
    }
  }, []);

  const fetchActiveDispatchers = useCallback(async () => {
    try {
      const res = await api.get('/dispatchers/', { params: { is_active: true } });
      const list = res.data.results || res.data;
      setActiveDispatchers(list);
    } catch (e) {
      console.error('Error fetching active dispatchers:', e);
    }
  }, []);

  const fetchDispatches = useCallback(async () => {
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.dispatcher) params.dispatcher = filters.dispatcher;
      const res = await api.get('/dispatches/', { params });
      const list = res.data.results || res.data;
      setDispatches(list);
    } catch (e) {
      console.error('Error fetching dispatches:', e);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.dispatcher]);

  const loadDispatcherDetail = useCallback(async (dispatcher) => {
    setDetailLoading(true);
    setDispatcherDetail(null);
    try {
      const res = await api.get(`/dispatchers/${dispatcher.id}/deliveries/`);
      setDispatcherDetail(res.data);
    } catch (e) {
      console.error('Error loading dispatcher deliveries:', e);
      alert('Could not load dispatcher history');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const afterDispatchMutation = useCallback(async () => {
    await fetchDispatches();
    await fetchDispatchers();
    await fetchActiveDispatchers();
    if (selectedDispatcher) {
      try {
        const res = await api.get(`/dispatchers/${selectedDispatcher.id}/deliveries/`);
        setDispatcherDetail(res.data);
      } catch (e) {
        console.error(e);
      }
    }
  }, [selectedDispatcher, fetchDispatches, fetchDispatchers, fetchActiveDispatchers]);

  useEffect(() => {
    fetchDispatchers();
    fetchActiveDispatchers();
  }, [fetchDispatchers, fetchActiveDispatchers]);

  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches]);

  const handleRowSelect = (d) => {
    setSelectedDispatcher(d);
    loadDispatcherDetail(d);
  };

  const handleDispatcherSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        telephone: formData.telephone || '',
        notes: formData.notes || '',
        is_active: formData.is_active,
      };
      if (formData.id) {
        await api.put(`/dispatchers/${formData.id}/`, payload);
      } else {
        await api.post('/dispatchers/', payload);
      }
      setShowForm(false);
      setFormData({ name: '', telephone: '+998', notes: '', is_active: true });
      fetchDispatchers();
      fetchActiveDispatchers();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Error saving dispatcher');
    }
  };

  const handleEditDispatcher = (d) => {
    setFormData({
      id: d.id,
      name: d.name || '',
      telephone: d.telephone || '+998',
      notes: d.notes || '',
      is_active: d.is_active !== false,
    });
    setShowForm(true);
  };

  const handleDeleteDispatcher = async (id) => {
    if (!window.confirm('Delete this dispatcher? Assigned dispatches will be unassigned.')) return;
    try {
      await api.delete(`/dispatchers/${id}/`);
      if (selectedDispatcher?.id === id) {
        setSelectedDispatcher(null);
        setDispatcherDetail(null);
      }
      fetchDispatchers();
      fetchActiveDispatchers();
      fetchDispatches();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Cannot delete (may be in use). Try deactivating instead.');
    }
  };

  const patchDispatch = async (id, data) => {
    await api.patch(`/dispatches/${id}/`, data);
    await afterDispatchMutation();
  };

  const postDispatchStatus = async (id, status, notes = '') => {
    await api.post(`/dispatches/${id}/update_status/`, { status, notes });
    await afterDispatchMutation();
  };

  if (loading && dispatches.length === 0) {
    return <div className="page-container">Loading...</div>;
  }

  const detailDispatches = dispatcherDetail?.dispatches || [];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Dispatchers</h1>
        <button
          className="btn-primary"
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            if (!showForm) {
              setFormData({ name: '', telephone: '+998', notes: '', is_active: true });
            }
          }}
        >
          {showForm ? 'Cancel' : '+ New dispatcher'}
        </button>
      </div>

      {showForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>{formData.id ? 'Edit dispatcher' : 'Add dispatcher'}</h2>
          <form onSubmit={handleDispatcherSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Telephone</label>
                <input
                  type="text"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />{' '}
                  Active
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {formData.id ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div className="table-card" style={{ flex: selectedDispatcher ? '0 0 42%' : '1', minWidth: 0 }}>
          <h2>Delivery partners</h2>
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
            Click a row to see every shipment assigned to that dispatcher: products, costs, status, and timeline. Sales →
            Dostavshik dispatches created there appear here when a dispatcher is assigned.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Loads</th>
                <th>Active</th>
                <th onClick={(e) => e.stopPropagation()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispatchers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    No dispatchers yet — add one above.
                  </td>
                </tr>
              ) : (
                dispatchers.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => handleRowSelect(d)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedDispatcher?.id === d.id ? '#e3f2fd' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedDispatcher?.id !== d.id) e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedDispatcher?.id !== d.id) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td>
                      <strong>{d.name}</strong>
                    </td>
                    <td>{d.telephone || '—'}</td>
                    <td>{d.dispatch_count != null ? d.dispatch_count : '—'}</td>
                    <td>{d.is_active ? 'Yes' : 'No'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-edit" onClick={() => handleEditDispatcher(d)}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn-delete" onClick={() => handleDeleteDispatcher(d.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedDispatcher && (
          <div className="table-card" style={{ flex: '1', minWidth: 0 }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{selectedDispatcher.name} — assignments &amp; history</h2>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setSelectedDispatcher(null);
                  setDispatcherDetail(null);
                }}
              >
                Close
              </button>
            </div>

            {detailLoading && <p>Loading…</p>}

            {!detailLoading && dispatcherDetail && (
              <>
                <div className="form-card" style={{ marginBottom: '16px', backgroundColor: '#f9f9f9' }}>
                  <h3 style={{ marginTop: 0 }}>Contact</h3>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Phone:</strong> {dispatcherDetail.dispatcher.telephone || '—'}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Notes:</strong> {dispatcherDetail.dispatcher.notes || '—'}
                  </p>
                </div>

                <div className="form-card" style={{ marginBottom: '16px', backgroundColor: '#f9f9f9' }}>
                  <h3 style={{ marginTop: 0 }}>Summary</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <strong>Total loads</strong>
                      <div>{dispatcherDetail.summary.total_dispatches}</div>
                    </div>
                    <div>
                      <strong>Delivery cost (UZS)</strong>
                      <div>
                        {parseFloat(dispatcherDetail.summary.total_delivery_cost_uzs || 0).toLocaleString()} UZS
                      </div>
                    </div>
                    <div>
                      <strong>Delivery cost (USD)</strong>
                      <div>${parseFloat(dispatcherDetail.summary.total_delivery_cost_usd || 0).toFixed(2)}</div>
                    </div>
                    {Object.entries(dispatcherDetail.summary.by_dispatch_status || {})
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <div key={k}>
                          <strong>{DISPATCH_STATUSES.find((s) => s.value === k)?.label || k}</strong>
                          <div>{v}</div>
                        </div>
                      ))}
                  </div>
                </div>

                <h3 style={{ marginBottom: '8px' }}>Shipments</h3>
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Sale</th>
                        <th>Product</th>
                        <th>Customer</th>
                        <th>Sale status</th>
                        <th>Dispatch date</th>
                        <th>Type</th>
                        <th>Delivery cost</th>
                        <th>Paid</th>
                        <th>Dispatch status</th>
                        <th>Delivered</th>
                        <th>Tracking</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailDispatches.length === 0 ? (
                        <tr>
                          <td colSpan={12} style={{ textAlign: 'center' }}>
                            No dispatches assigned yet.
                          </td>
                        </tr>
                      ) : (
                        detailDispatches.map((row) => {
                          const sale = row.sale_detail;
                          return (
                            <tr key={row.id}>
                              <td>#{sale?.id}</td>
                              <td style={{ minWidth: '140px' }}>{productLine(sale)}</td>
                              <td>{sale?.customer_detail?.name || '—'}</td>
                              <td>
                                <span className={`status-badge ${sale?.status || ''}`}>{sale?.status || '—'}</span>
                              </td>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                {row.dispatch_date ? new Date(row.dispatch_date).toLocaleString() : '—'}
                              </td>
                              <td>{row.dispatch_type === 'bts' ? 'BTS' : 'Dostavshik'}</td>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{formatCost(row)}</td>
                              <td>{row.is_paid ? 'Yes' : 'No'}</td>
                              <td>
                                <select
                                  value={row.status}
                                  onChange={(e) => postDispatchStatus(row.id, e.target.value, '')}
                                >
                                  {statusOptionsRow.map((s) => (
                                    <option key={s.value} value={s.value}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                {row.delivered_at ? new Date(row.delivered_at).toLocaleString() : '—'}
                              </td>
                              <td>{row.tracking_number || '—'}</td>
                              <td>
                                <LogisticsNotesCell
                                  dispatchId={row.id}
                                  initial={row.logistics_notes || ''}
                                  onSave={(notes) => patchDispatch(row.id, { logistics_notes: notes })}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <h3 style={{ marginBottom: '8px' }}>Status change timeline</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Dispatch #</th>
                        <th>From</th>
                        <th>To</th>
                        <th>By</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!dispatcherDetail.status_change_logs?.length ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center' }}>
                            No status changes logged yet.
                          </td>
                        </tr>
                      ) : (
                        dispatcherDetail.status_change_logs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                              {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                            </td>
                            <td>#{log.object_id}</td>
                            <td>{log.previous_status || '—'}</td>
                            <td>{log.new_status}</td>
                            <td>{log.changed_by_detail?.username || '—'}</td>
                            <td>{log.notes || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="table-card" style={{ marginTop: '24px' }}>
        <h2>All deliveries (workspace)</h2>
        <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
          Filter and update any dispatch. Reassign couriers or edit logistics for BTS and other routes.
        </p>
        <div className="form-grid" style={{ marginBottom: '16px', maxWidth: '640px' }}>
          <div className="form-group">
            <label>Filter by status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              {DISPATCH_STATUSES.map((s) => (
                <option key={s.value || 'all'} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Filter by dispatcher</label>
            <select
              value={filters.dispatcher}
              onChange={(e) => setFilters({ ...filters, dispatcher: e.target.value })}
            >
              <option value="">All</option>
              {activeDispatchers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Sale</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Cost</th>
                <th>Dispatcher</th>
                <th>Status</th>
                <th>Delivered</th>
                <th>Logistics notes</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center' }}>
                    No dispatches match filters.
                  </td>
                </tr>
              ) : (
                dispatches.map((row) => {
                  const sale = row.sale_detail;
                  return (
                    <tr key={row.id}>
                      <td>#{sale?.id}</td>
                      <td>{productLine(sale)}</td>
                      <td>{sale?.customer_detail?.name || '—'}</td>
                      <td>{row.dispatch_type === 'bts' ? 'BTS' : 'Dostavshik'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{formatCost(row)}</td>
                      <td>
                        <select
                          value={row.dispatcher || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchDispatch(row.id, { dispatcher: v ? parseInt(v, 10) : null });
                          }}
                        >
                          <option value="">— Unassigned —</option>
                          {activeDispatchers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={row.status}
                          onChange={(e) => postDispatchStatus(row.id, e.target.value, '')}
                        >
                          {statusOptionsRow.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.9em' }}>
                        {row.delivered_at ? new Date(row.delivered_at).toLocaleString() : '—'}
                      </td>
                      <td>
                        <LogisticsNotesCell
                          dispatchId={row.id}
                          initial={row.logistics_notes || ''}
                          onSave={(notes) => patchDispatch(row.id, { logistics_notes: notes })}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function LogisticsNotesCell({ dispatchId, initial, onSave }) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(initial);
    setDirty(false);
  }, [dispatchId, initial]);

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
      <textarea
        rows={2}
        style={{ minWidth: '140px', maxWidth: '200px' }}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
      />
      {dirty && (
        <button type="button" className="btn-primary" onClick={() => onSave(value)}>
          Save
        </button>
      )}
    </div>
  );
}

export default Dispatchers;
