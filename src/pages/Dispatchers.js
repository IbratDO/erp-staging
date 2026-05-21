import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import SaleCompletePayForm from '../components/SaleCompletePayForm';
import SaleDeliverySettlementForm from '../components/SaleDeliverySettlementForm';
import ShopDeliverySettlementButtons from '../components/ShopDeliverySettlementButtons';
import { shopDeliverySettlementRequired } from '../utils/saleCompletePayHelpers';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';

const canCompleteAndPay = (sale) => !!(sale && sale.status === 'dispatched');

/** Synthetic “partner” row for BTS (company) dispatches — not a DB dispatcher id. */
const BTS_ROW_ID = 'bts';

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

/** Lowercase key for client-side sort (matches visual product column). */
function productLineSortKey(sale) {
  if (!sale?.product_detail) return '';
  const p = sale.product_detail;
  return `${p.brand || ''} ${p.model || ''} ${p.size || ''} ${p.color || ''}`.trim().toLowerCase();
}

/** Rough single-number sort for mixed UZS + USD delivery cost display column. */
function dispatchCostSortApprox(row) {
  return (parseFloat(row.delivery_cost_uzs) || 0) / 12500 + (parseFloat(row.delivery_cost) || 0);
}

const PARTNER_DISPATCHER_SORT_ACCESSORS = {
  name: (d) => String(d.name ?? '').toLowerCase(),
  telephone: (d) => String(d.telephone ?? '').toLowerCase(),
  loads: (d) => Number(d.dispatch_count) || 0,
  active: (d) => (d.is_active !== false ? 1 : 0),
};

const DISPATCH_SHIPMENT_SORT_ACCESSORS = {
  sale_id: (row) => Number(row.sale_detail?.id) || 0,
  product: (row) => productLineSortKey(row.sale_detail),
  customer: (row) => String(row.sale_detail?.customer_detail?.name ?? '').toLowerCase(),
  sale_status: (row) => String(row.sale_detail?.status ?? '').toLowerCase(),
  dispatch_date: (row) => new Date(row.dispatch_date).getTime() || 0,
  dispatch_type_key: (row) => String(row.dispatch_type ?? '').toLowerCase(),
  delivery_cost_key: (row) => dispatchCostSortApprox(row),
  is_paid: (row) => (row.is_paid ? 1 : 0),
  status: (row) => String(row.status ?? '').toLowerCase(),
  delivered_at: (row) => new Date(row.delivered_at).getTime() || 0,
  tracking_number: (row) => String(row.tracking_number ?? '').toLowerCase(),
  logistics_notes: (row) => String(row.logistics_notes ?? '').toLowerCase(),
};

const ALL_DELIVERIES_SORT_ACCESSORS = {
  id: (row) => Number(row.id) || 0,
  sale_id: (row) => Number(row.sale_detail?.id) || 0,
  product: (row) => productLineSortKey(row.sale_detail),
  customer: (row) => String(row.sale_detail?.customer_detail?.name ?? '').toLowerCase(),
  dispatch_type_key: (row) => String(row.dispatch_type ?? '').toLowerCase(),
  delivery_cost_key: (row) => dispatchCostSortApprox(row),
  dispatcher_name: (row) => String(row.dispatcher_detail?.name ?? '').toLowerCase(),
  status: (row) => String(row.status ?? '').toLowerCase(),
  delivered_at: (row) => new Date(row.delivered_at).getTime() || 0,
  logistics_notes: (row) => String(row.logistics_notes ?? '').toLowerCase(),
};

const STATUS_TIMELINE_SORT_ACCESSORS = {
  timestamp: (log) => new Date(log.timestamp).getTime() || 0,
  dispatch_num: (log) => Number(log.object_id) || 0,
  previous_status: (log) => String(log.previous_status ?? '').toLowerCase(),
  new_status: (log) => String(log.new_status ?? '').toLowerCase(),
  changed_by: (log) => String(log.changed_by_detail?.username ?? '').toLowerCase(),
  notes: (log) => String(log.notes ?? '').toLowerCase(),
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
  const [completePaySale, setCompletePaySale] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });

  const showNotification = (message, type = 'info') => {
    setNotification({ show: true, message, type });
    window.setTimeout(() => {
      setNotification((n) => (n.show ? { show: false, message: '', type: 'info' } : n));
    }, 4000);
  };

  const [formData, setFormData] = useState({
    name: '',
    telephone: '+998',
    notes: '',
    is_active: true,
  });
  const [filters, setFilters] = useState({
    status: '',
    dispatcher: '',
    serviceType: '',
  });
  const [btsLoadCount, setBtsLoadCount] = useState(null);

  const allDeliveriesCostTotals = useMemo(() => {
    let uzs = 0;
    let usd = 0;
    for (const row of dispatches) {
      uzs += parseFloat(row.delivery_cost_uzs) || 0;
      usd += parseFloat(row.delivery_cost) || 0;
    }
    return { uzs, usd };
  }, [dispatches]);

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
      if (filters.serviceType) params.dispatch_type = filters.serviceType;
      const res = await api.get('/dispatches/', { params });
      const list = res.data.results || res.data;
      setDispatches(list);
    } catch (e) {
      console.error('Error fetching dispatches:', e);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.dispatcher, filters.serviceType]);

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

  const loadBtsDetail = useCallback(async () => {
    setDetailLoading(true);
    setDispatcherDetail(null);
    try {
      const res = await api.get('/dispatchers/bts-deliveries/');
      setDispatcherDetail(res.data);
      if (res.data?.summary?.total_dispatches != null) {
        setBtsLoadCount(res.data.summary.total_dispatches);
      }
    } catch (e) {
      console.error('Error loading BTS deliveries:', e);
      alert('Could not load BTS deliveries');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchBtsCount = useCallback(async () => {
    try {
      const res = await api.get('/dispatches/', { params: { dispatch_type: 'bts', page_size: 1 } });
      if (typeof res.data.count === 'number') {
        setBtsLoadCount(res.data.count);
        return;
      }
      const list = res.data.results || res.data;
      setBtsLoadCount(Array.isArray(list) ? list.length : 0);
    } catch (e) {
      console.error('Error counting BTS dispatches:', e);
    }
  }, []);

  const afterDispatchMutation = useCallback(async () => {
    await fetchDispatches();
    await fetchDispatchers();
    await fetchActiveDispatchers();
    if (selectedDispatcher?.isBts) {
      try {
        const res = await api.get('/dispatchers/bts-deliveries/');
        setDispatcherDetail(res.data);
        if (res.data?.summary?.total_dispatches != null) {
          setBtsLoadCount(res.data.summary.total_dispatches);
        }
      } catch (e) {
        console.error(e);
      }
    } else if (selectedDispatcher && !selectedDispatcher.isBts) {
      try {
        const res = await api.get(`/dispatchers/${selectedDispatcher.id}/deliveries/`);
        setDispatcherDetail(res.data);
      } catch (e) {
        console.error(e);
      }
    }
    await fetchBtsCount();
  }, [selectedDispatcher, fetchDispatches, fetchDispatchers, fetchActiveDispatchers, fetchBtsCount]);

  useEffect(() => {
    fetchDispatchers();
    fetchActiveDispatchers();
  }, [fetchDispatchers, fetchActiveDispatchers]);

  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches]);

  useEffect(() => {
    fetchBtsCount();
  }, [fetchBtsCount]);

  const handleRowSelect = (d) => {
    if (d.is_bts_channel) {
      setSelectedDispatcher({ ...d, isBts: true });
      loadBtsDetail();
      return;
    }
    setSelectedDispatcher(d);
    loadDispatcherDetail(d);
  };

  /** When the BTS DB row was deleted, keep a synthetic row to open the BTS workspace. */
  const handleSyntheticBtsRowSelect = () => {
    setSelectedDispatcher({ id: BTS_ROW_ID, name: 'BTS', isBts: true, synthetic: true });
    loadBtsDetail();
  };

  const handleRestoreBtsPartner = async () => {
    try {
      await api.post('/dispatchers/ensure-bts/');
      await fetchDispatchers();
      await fetchActiveDispatchers();
      await fetchBtsCount();
      showNotification('BTS partner row restored.', 'success');
    } catch (e) {
      console.error(e);
      showNotification(e.response?.data?.detail || 'Could not restore BTS row', 'error');
    }
  };

  const handleDispatcherSubmit = async (e) => {
    e.preventDefault();
    const name = String(formData.name || '').trim();
    const telephone = String(formData.telephone || '').trim();
    if (!name) {
      showNotification('Please enter the dispatcher name.', 'error');
      return;
    }
    if (!telephone || telephone === '+998') {
      showNotification('Please enter the dispatcher telephone.', 'error');
      return;
    }
    try {
      const payload = {
        name,
        telephone,
        notes: String(formData.notes || '').trim(),
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
    const row = dispatchers.find((x) => x.id === id);
    const message = row?.is_bts_channel
      ? 'Delete the BTS partner line? BTS (company) dispatches stay in the system; you can add this row back with “Restore BTS” in the Actions column.'
      : 'Delete this dispatcher? Assigned dispatches will be unassigned.';
    if (!window.confirm(message)) return;
    try {
      await api.delete(`/dispatchers/${id}/`);
      if (selectedDispatcher?.id === id) {
        setSelectedDispatcher(null);
        setDispatcherDetail(null);
      }
      fetchDispatchers();
      fetchActiveDispatchers();
      fetchDispatches();
      fetchBtsCount();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Cannot delete (may be in use). Try deactivating instead.');
    }
  };

  const patchDispatch = async (id, data) => {
    await api.patch(`/dispatches/${id}/`, data);
    await afterDispatchMutation();
  };

  const postDispatchStatus = async (id, status, notes) => {
    await api.post(`/dispatches/${id}/update_status/`, {
      status,
      notes: String(notes ?? '').trim(),
    });
    await afterDispatchMutation();
  };

  const applyDispatchRowStatusChange = async (row, newStatus) => {
    try {
      await postDispatchStatus(row.id, newStatus, '');
    } catch (err) {
      console.error(err);
      showNotification(
        err.response?.data?.detail || err.response?.data?.error || err.response?.data?.notes || 'Could not update status',
        'error',
      );
    }
  };

  const openCompleteAndPay = async (saleId) => {
    if (!saleId) return;
    try {
      const res = await api.get(`/sales/${saleId}/`);
      setCompletePaySale(res.data);
    } catch (e) {
      console.error(e);
      showNotification(e.response?.data?.detail || e.response?.data?.error || 'Could not load sale', 'error');
    }
  };

  const detailDeliveriesCostTotals = useMemo(() => {
    const rows = dispatcherDetail?.dispatches || [];
    let uzs = 0;
    let usd = 0;
    for (const row of rows) {
      uzs += parseFloat(row.delivery_cost_uzs) || 0;
      usd += parseFloat(row.delivery_cost) || 0;
    }
    return { uzs, usd };
  }, [dispatcherDetail]);

  const btsFromApi = useMemo(() => dispatchers.find((d) => d.is_bts_channel), [dispatchers]);
  const partnersWithoutBts = useMemo(() => dispatchers.filter((d) => !d.is_bts_channel), [dispatchers]);

  const partnerSort = useClientTableSort(PARTNER_DISPATCHER_SORT_ACCESSORS);
  const sortedPartnersWithoutBts = useMemo(
    () => partnerSort.sortRows(partnersWithoutBts || []),
    [partnersWithoutBts, partnerSort],
  );

  const shipmentSort = useClientTableSort(DISPATCH_SHIPMENT_SORT_ACCESSORS);
  const sortedDetailDispatches = useMemo(
    () => shipmentSort.sortRows(dispatcherDetail?.dispatches || []),
    [dispatcherDetail?.dispatches, shipmentSort],
  );

  const allDeliveriesSort = useClientTableSort(ALL_DELIVERIES_SORT_ACCESSORS);
  const sortedAllDeliveriesRows = useMemo(
    () => allDeliveriesSort.sortRows(dispatches || []),
    [dispatches, allDeliveriesSort],
  );

  const statusTimelineSort = useClientTableSort(STATUS_TIMELINE_SORT_ACCESSORS);
  const sortedStatusChangeLogs = useMemo(
    () => statusTimelineSort.sortRows(dispatcherDetail?.status_change_logs || []),
    [dispatcherDetail?.status_change_logs, statusTimelineSort],
  );

  if (loading && dispatches.length === 0) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      {notification.show && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor:
              notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
            color: 'white',
            maxWidth: 'min(90vw, 400px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {notification.message}
        </div>
      )}

      {completePaySale && shopDeliverySettlementRequired(completePaySale) && (
        <SaleDeliverySettlementForm
          sale={completePaySale}
          onClose={() => setCompletePaySale(null)}
          onAfterStepRecorded={afterDispatchMutation}
          onSuccess={async () => {
            setCompletePaySale(null);
            await afterDispatchMutation();
          }}
          showNotification={showNotification}
        />
      )}
      {completePaySale && !shopDeliverySettlementRequired(completePaySale) && (
        <SaleCompletePayForm
          sale={completePaySale}
          onClose={() => setCompletePaySale(null)}
          onSuccess={async () => {
            setCompletePaySale(null);
            await afterDispatchMutation();
          }}
          showNotification={showNotification}
        />
      )}

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
                <label>Telephone *</label>
                <input
                  type="text"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>
                  Notes{' '}
                  <span style={{ fontWeight: 400, color: '#718096' }}>(optional)</span>
                </label>
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
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="name" sortCol={partnerSort.sortCol} sortDir={partnerSort.sortDir} onSort={partnerSort.onHeaderClick}>Name</SortableTh>
                <SortableTh columnId="telephone" sortCol={partnerSort.sortCol} sortDir={partnerSort.sortDir} onSort={partnerSort.onHeaderClick}>Phone</SortableTh>
                <SortableTh columnId="loads" sortCol={partnerSort.sortCol} sortDir={partnerSort.sortDir} onSort={partnerSort.onHeaderClick}>Loads</SortableTh>
                <SortableTh columnId="active" sortCol={partnerSort.sortCol} sortDir={partnerSort.sortDir} onSort={partnerSort.onHeaderClick}>Active</SortableTh>
                <th onClick={(e) => e.stopPropagation()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {btsFromApi ? (
                <tr
                  key={`bts-${btsFromApi.id}`}
                  onClick={() => handleRowSelect(btsFromApi)}
                  style={{
                    cursor: 'pointer',
                    backgroundColor:
                      selectedDispatcher?.isBts && selectedDispatcher?.id === btsFromApi.id
                        ? '#e8f5e9'
                        : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      selectedDispatcher?.isBts && selectedDispatcher?.id === btsFromApi.id
                        ? '#e8f5e9'
                        : '#f1f8e9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      selectedDispatcher?.isBts && selectedDispatcher?.id === btsFromApi.id
                        ? '#e8f5e9'
                        : 'transparent';
                  }}
                >
                  <td>
                    <strong>{btsFromApi.name || 'BTS'}</strong>{' '}
                    <span style={{ fontSize: '0.85em', color: '#666', fontWeight: 400 }}>(company delivery)</span>
                  </td>
                  <td>{btsFromApi.telephone || '—'}</td>
                  <td>{btsLoadCount != null ? btsLoadCount : '—'}</td>
                  <td>{btsFromApi.is_active ? 'Yes' : 'No'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn-edit" onClick={() => handleEditDispatcher(btsFromApi)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn-delete" onClick={() => handleDeleteDispatcher(btsFromApi.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ) : (
                <tr
                  key="bts-synthetic"
                  onClick={handleSyntheticBtsRowSelect}
                  style={{
                    cursor: 'pointer',
                    backgroundColor:
                      selectedDispatcher?.synthetic && selectedDispatcher?.isBts ? '#e8f5e9' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      selectedDispatcher?.synthetic && selectedDispatcher?.isBts ? '#e8f5e9' : '#f1f8e9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      selectedDispatcher?.synthetic && selectedDispatcher?.isBts ? '#e8f5e9' : 'transparent';
                  }}
                >
                  <td>
                    <strong>BTS</strong>{' '}
                    <span style={{ fontSize: '0.85em', color: '#666', fontWeight: 400 }}>(company — row removed)</span>
                  </td>
                  <td>—</td>
                  <td>{btsLoadCount != null ? btsLoadCount : '—'}</td>
                  <td>—</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleRestoreBtsPartner}
                      style={{ fontSize: '0.9em' }}
                    >
                      Restore BTS
                    </button>
                  </td>
                </tr>
              )}
              {partnersWithoutBts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    {btsFromApi
                      ? 'No named (Dostavshik) partners yet — add one with + New dispatcher.'
                      : 'No named (Dostavshik) partners yet — or restore the BTS row with the button above.'}
                  </td>
                </tr>
              ) : (
                sortedPartnersWithoutBts.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => handleRowSelect(d)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor:
                        !selectedDispatcher?.isBts && selectedDispatcher?.id === d.id ? '#e3f2fd' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedDispatcher?.id !== d.id || selectedDispatcher?.isBts) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedDispatcher?.id !== d.id || selectedDispatcher?.isBts) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
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
              <h2 style={{ margin: 0 }}>
                {selectedDispatcher.isBts
                  ? 'BTS — company delivery'
                  : `${selectedDispatcher.name} — assignments & history`}
              </h2>
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
                        <SortableTh columnId="sale_id" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Sale</SortableTh>
                        <SortableTh columnId="product" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Product</SortableTh>
                        <SortableTh columnId="customer" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Customer</SortableTh>
                        <SortableTh columnId="sale_status" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Sale status</SortableTh>
                        <SortableTh columnId="dispatch_date" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Dispatch date</SortableTh>
                        <SortableTh columnId="dispatch_type_key" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Type</SortableTh>
                        <SortableTh columnId="delivery_cost_key" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Delivery cost</SortableTh>
                        <SortableTh columnId="is_paid" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Paid</SortableTh>
                        <SortableTh columnId="status" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Dispatch status</SortableTh>
                        <SortableTh columnId="delivered_at" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Delivered</SortableTh>
                        <SortableTh columnId="tracking_number" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Tracking</SortableTh>
                        <SortableTh columnId="logistics_notes" sortCol={shipmentSort.sortCol} sortDir={shipmentSort.sortDir} onSort={shipmentSort.onHeaderClick}>Notes</SortableTh>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDetailDispatches.length === 0 ? (
                        <tr>
                          <td colSpan={13} style={{ textAlign: 'center' }}>
                            No dispatches assigned yet.
                          </td>
                        </tr>
                      ) : (
                        sortedDetailDispatches.map((row) => {
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
                                  onChange={(e) => applyDispatchRowStatusChange(row, e.target.value)}
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
                              <td onClick={(e) => e.stopPropagation()}>
                                {canCompleteAndPay(sale) &&
                                  (shopDeliverySettlementRequired(sale) ? (
                                    <ShopDeliverySettlementButtons sale={sale} onOpenSettlement={openCompleteAndPay} />
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-status"
                                      onClick={() => openCompleteAndPay(sale.id)}
                                    >
                                      Complete & Pay
                                    </button>
                                  ))}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'right' }}>
                          Total
                        </td>
                        <td style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                          {detailDeliveriesCostTotals.uzs > 0 || detailDeliveriesCostTotals.usd > 0
                            ? [
                                detailDeliveriesCostTotals.uzs > 0
                                  ? `${detailDeliveriesCostTotals.uzs.toLocaleString()} UZS`
                                  : null,
                                detailDeliveriesCostTotals.usd > 0
                                  ? `$${detailDeliveriesCostTotals.usd.toFixed(2)}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : '—'}
                        </td>
                        <td colSpan="5">—</td>
                        <td>—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <h3 style={{ marginBottom: '8px' }}>Status change timeline</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <SortableTh columnId="timestamp" sortCol={statusTimelineSort.sortCol} sortDir={statusTimelineSort.sortDir} onSort={statusTimelineSort.onHeaderClick}>Time</SortableTh>
                        <SortableTh columnId="dispatch_num" sortCol={statusTimelineSort.sortCol} sortDir={statusTimelineSort.sortDir} onSort={statusTimelineSort.onHeaderClick}>Dispatch #</SortableTh>
                        <SortableTh columnId="previous_status" sortCol={statusTimelineSort.sortCol} sortDir={statusTimelineSort.sortDir} onSort={statusTimelineSort.onHeaderClick}>From</SortableTh>
                        <SortableTh columnId="new_status" sortCol={statusTimelineSort.sortCol} sortDir={statusTimelineSort.sortDir} onSort={statusTimelineSort.onHeaderClick}>To</SortableTh>
                        <SortableTh columnId="changed_by" sortCol={statusTimelineSort.sortCol} sortDir={statusTimelineSort.sortDir} onSort={statusTimelineSort.onHeaderClick}>By</SortableTh>
                        <SortableTh columnId="notes" sortCol={statusTimelineSort.sortCol} sortDir={statusTimelineSort.sortDir} onSort={statusTimelineSort.onHeaderClick}>Notes</SortableTh>
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
                        sortedStatusChangeLogs.map((log) => (
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
        <div className="filter-toolbar filter-toolbar--tight filter-toolbar--bleed">
          <div className="filter-field">
            <label>Status</label>
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
          <div className="filter-field">
            <label>Service</label>
            <select
              value={filters.serviceType}
              onChange={(e) => setFilters({ ...filters, serviceType: e.target.value })}
            >
              <option value="">All</option>
              <option value="bts">BTS</option>
              <option value="dostavshik">Dostavshik</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Dispatcher</label>
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
                <SortableTh columnId="id" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>ID</SortableTh>
                <SortableTh columnId="sale_id" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Sale</SortableTh>
                <SortableTh columnId="product" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Product</SortableTh>
                <SortableTh columnId="customer" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Customer</SortableTh>
                <SortableTh columnId="dispatch_type_key" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Type</SortableTh>
                <SortableTh columnId="delivery_cost_key" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Cost</SortableTh>
                <SortableTh columnId="dispatcher_name" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Dispatcher</SortableTh>
                <SortableTh columnId="status" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Status</SortableTh>
                <SortableTh columnId="delivered_at" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Delivered</SortableTh>
                <SortableTh columnId="logistics_notes" sortCol={allDeliveriesSort.sortCol} sortDir={allDeliveriesSort.sortDir} onSort={allDeliveriesSort.onHeaderClick}>Logistics notes</SortableTh>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center' }}>
                    No dispatches match filters.
                  </td>
                </tr>
              ) : (
                sortedAllDeliveriesRows.map((row) => {
                  const sale = row.sale_detail;
                  return (
                    <tr key={row.id}>
                      <td>#{row.id}</td>
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
                          onChange={(e) => applyDispatchRowStatusChange(row, e.target.value)}
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
                      <td>
                        {canCompleteAndPay(sale) &&
                          (shopDeliverySettlementRequired(sale) ? (
                            <ShopDeliverySettlementButtons sale={sale} onOpenSettlement={openCompleteAndPay} />
                          ) : (
                            <button
                              type="button"
                              className="btn-status"
                              onClick={() => openCompleteAndPay(sale.id)}
                            >
                              Complete & Pay
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="5" style={{ textAlign: 'right' }}>
                  Total (filtered)
                </td>
                <td style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                  {allDeliveriesCostTotals.uzs > 0 || allDeliveriesCostTotals.usd > 0
                    ? [
                        allDeliveriesCostTotals.uzs > 0
                          ? `${allDeliveriesCostTotals.uzs.toLocaleString()} UZS`
                          : null,
                        allDeliveriesCostTotals.usd > 0
                          ? `$${allDeliveriesCostTotals.usd.toFixed(2)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : '—'}
                </td>
                <td colSpan="4">—</td>
                <td>—</td>
              </tr>
            </tfoot>
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
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (!String(value).trim()) {
              alert('Please enter logistics notes before saving.');
              return;
            }
            onSave(String(value).trim());
            setDirty(false);
          }}
        >
          Save
        </button>
      )}
    </div>
  );
}

export default Dispatchers;
