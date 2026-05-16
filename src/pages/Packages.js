import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

const PKG_STOCK_SORT = {
  package_type: (r) => String(r.package_type ?? '').toLowerCase(),
  quantity: (r) => Number(r.quantity) || 0,
  cost_uzs_unit: (r) => parseFloat(r.cost_per_unit_uzs) || 0,
  cost_usd_unit: (r) => parseFloat(r.cost_per_unit_usd) || 0,
  total_uzs: (r) => (parseFloat(r.quantity) || 0) * (parseFloat(r.cost_per_unit_uzs) || 0),
  total_usd: (r) => (parseFloat(r.quantity) || 0) * (parseFloat(r.cost_per_unit_usd) || 0),
  updated_at: (r) => new Date(r.updated_at).getTime() || 0,
};

const PKG_HIST_SORT = {
  id: (h) => Number(h.id) || 0,
  package_type: (h) => String(h.package_detail?.package_type ?? h.package ?? '').toLowerCase(),
  quantity_added: (h) => {
    const qr = h.quantity_received != null ? parseFloat(h.quantity_received) : NaN;
    const qa = parseFloat(h.quantity_added) || 0;
    return Number.isFinite(qr) ? qr : qa;
  },
  cost_unit_key: (h) =>
    (parseFloat(h.cost_per_unit_uzs) || 0) + (parseFloat(h.cost_per_unit_usd) || 0) * 1e9,
  total_cost_key: (h) =>
    (parseFloat(h.total_cost_uzs) || 0) + (parseFloat(h.total_cost_usd) || 0) * 1e9,
  status: (h) => String(h.status ?? '').toLowerCase(),
  uzs_paid: (h) =>
    (parseFloat(h.payment_uzs_cash) || 0) + (parseFloat(h.payment_uzs_card) || 0),
  usd_paid: (h) =>
    (parseFloat(h.payment_usd_cash) || 0) + (parseFloat(h.payment_usd_card) || 0),
  added_by: (h) => String(h.created_by_detail?.username ?? '').toLowerCase(),
  date: (h) => new Date(h.created_at).getTime() || 0,
};

const defaultPaymentState = {
  payment_uzs: '',
  payment_usd: '',
};

/** Strip $, commas, spaces (so pasting "$1,200.50" does not stick a $ in the value). */
const sanitizePaymentAmountInput = (raw) => {
  if (raw === '' || raw == null) return '';
  return String(raw).replace(/[$\s,]/g, '');
};

function formatApiError(data) {
  if (data == null) return null;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map((x) => formatApiError(x)).filter(Boolean).join(' ');
  }
  if (typeof data === 'object' && data.detail != null) return formatApiError(data.detail);
  if (typeof data === 'object' && data.error) return String(data.error);
  if (typeof data === 'object') {
    const parts = Object.entries(data).map(([k, v]) => {
      const inner = formatApiError(v);
      return inner ? `${k}: ${inner}` : null;
    });
    return parts.filter(Boolean).join(' — ') || null;
  }
  return String(data);
}

const Packages = () => {
  const [packages, setPackages] = useState([]);
  const [packageHistory, setPackageHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [formData, setFormData] = useState({
    package_type: 'M',
    quantity: '',
    cost_per_unit_uzs: '',
    cost_per_unit_usd: '',
  });
  const [paymentFormData, setPaymentFormData] = useState({
    historyId: null,
    quantity_received: '',
    ...defaultPaymentState,
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    fetchPackages();
    fetchPackageHistory();
  }, []);

  const packageStockTotals = useMemo(() => {
    let quantity = 0;
    let totalUzs = 0;
    let totalUsd = 0;
    for (const p of packages) {
      const q = parseFloat(p.quantity) || 0;
      const cpuUzs = parseFloat(p.cost_per_unit_uzs) || 0;
      const cpuUsd = parseFloat(p.cost_per_unit_usd) || 0;
      quantity += q;
      totalUzs += q * cpuUzs;
      totalUsd += q * cpuUsd;
    }
    return { quantity, totalUzs, totalUsd };
  }, [packages]);

  const packageHistoryTotals = useMemo(() => {
    let quantityAdded = 0;
    let totalCostUzs = 0;
    let totalCostUsd = 0;
    let sumUzs = 0;
    let sumUsd = 0;
    for (const h of packageHistory) {
      quantityAdded += parseFloat(h.quantity_added) || 0;
      totalCostUzs += parseFloat(h.total_cost_uzs) || 0;
      totalCostUsd += parseFloat(h.total_cost_usd) || 0;
      const isPaid = h.is_paid || h.status === 'paid';
      if (isPaid) {
        sumUzs += (parseFloat(h.payment_uzs_cash) || 0) + (parseFloat(h.payment_uzs_card) || 0);
        sumUsd += (parseFloat(h.payment_usd_cash) || 0) + (parseFloat(h.payment_usd_card) || 0);
      }
    }
    return { quantityAdded, totalCostUzs, totalCostUsd, sumUzs, sumUsd };
  }, [packageHistory]);

  const formatHistoryUzs = (n) => {
    const v = parseFloat(n);
    if (!v || v <= 0) return '—';
    return `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`;
  };
  const formatHistoryUsd = (n) => {
    const v = parseFloat(n);
    if (!v || v <= 0) return '—';
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fetchPackages = async () => {
    try {
      const response = await api.get('/packages/');
      let packagesList = response.data.results || response.data;
      
      // Ensure both M and L packages exist
      const packageTypes = ['M', 'L'];
      const existingTypes = packagesList.map(p => p.package_type);
      
      for (const type of packageTypes) {
        if (!existingTypes.includes(type)) {
          // Create missing package type
          const cost = type === 'M' ? 1.00 : 2.00;
          try {
            await api.post('/packages/', {
              package_type: type,
              quantity: 0,
              cost_per_unit_uzs: 0,
              cost_per_unit_usd: cost,
            });
          } catch (error) {
            console.error(`Error creating package ${type}:`, error);
          }
        }
      }
      
      // Refetch after creating missing packages
      const updatedResponse = await api.get('/packages/');
      setPackages(updatedResponse.data.results || updatedResponse.data);
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const quantity = parseInt(formData.quantity) || 0;
      const defUsd = formData.package_type === 'M' ? 1.0 : 2.0;
      const costUzs = parseFloat(formData.cost_per_unit_uzs) || 0;
      const costUsd =
        formData.cost_per_unit_usd !== '' && formData.cost_per_unit_usd != null
          ? parseFloat(formData.cost_per_unit_usd) || 0
          : defUsd;

      if (editingPackage) {
        await api.put(`/packages/${editingPackage.id}/`, {
          package_type: formData.package_type,
          quantity: parseInt(formData.quantity) || 0,
          cost_per_unit_uzs: costUzs,
          cost_per_unit_usd: costUsd,
        });
      } else {
        const existingPackage = packages.find(p => p.package_type === formData.package_type);
        const packageData = {
          package_type: formData.package_type,
          quantity: existingPackage
            ? (parseInt(existingPackage.quantity) || 0) + quantity
            : quantity,
          cost_per_unit_uzs: costUzs,
          cost_per_unit_usd: costUsd,
        };
        if (existingPackage) {
          await api.put(`/packages/${existingPackage.id}/`, packageData);
        } else {
          await api.post('/packages/', packageData);
        }
      }
      setShowForm(false);
      setEditingPackage(null);
      setFormData({
        package_type: '',
        quantity: '',
        cost_per_unit_uzs: '',
        cost_per_unit_usd: '',
      });
      fetchPackages();
    } catch (error) {
      console.error('Error saving package:', error);
      const d = error.response?.data;
      const msg = formatApiError(d) || error.message;
      alert(msg || 'Error saving package');
    } finally {
      fetchPackageHistory(); // Refresh history after adding stock
    }
  };

  const fetchPackageHistory = async () => {
    try {
      const response = await api.get('/package-history/');
      setPackageHistory(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching package history:', error);
    }
  };

  const handleEdit = (packageItem) => {
    setEditingPackage(packageItem);
    setFormData({
      package_type: packageItem.package_type,
      quantity: packageItem.quantity,
      cost_per_unit_uzs: String(packageItem.cost_per_unit_uzs ?? ''),
      cost_per_unit_usd: String(packageItem.cost_per_unit_usd ?? ''),
    });
    setShowForm(true);
  };

  const handleMarkReceivedAndPay = (historyId) => {
    const historyItem = packageHistory.find(h => h.id === historyId);
    const quantityOrdered = historyItem?.quantity_added || 0;
    const dueUzs = (parseFloat(historyItem?.cost_per_unit_uzs) || 0) * quantityOrdered;
    const dueUsd = (parseFloat(historyItem?.cost_per_unit_usd) || 0) * quantityOrdered;
    setPaymentFormData({
      historyId: historyId,
      quantity_received: quantityOrdered,
      payment_uzs: dueUzs > 0 ? String(dueUzs) : '',
      payment_usd: dueUsd > 0 ? String(dueUsd) : '',
    });
    setShowPaymentForm(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const historyItem = packageHistory.find(h => h.id === paymentFormData.historyId);
      const cpuUzs = parseFloat(historyItem?.cost_per_unit_uzs) || 0;
      const cpuUsd = parseFloat(historyItem?.cost_per_unit_usd) || 0;
      const qty = parseInt(paymentFormData.quantity_received) || 0;
      const dueUzs = qty * cpuUzs;
      const dueUsd = qty * cpuUsd;
      const uzs = parseFloat(paymentFormData.payment_uzs) || 0;
      const usd = parseFloat(paymentFormData.payment_usd) || 0;
      if ((dueUzs > 0 || dueUsd > 0) && uzs + usd <= 0) {
        alert('Enter at least one payment amount (UZS or USD).');
        return;
      }
      await api.post(`/package-history/${paymentFormData.historyId}/mark_received_and_pay/`, {
        quantity_received: paymentFormData.quantity_received,
        payment_uzs: uzs,
        payment_usd: usd,
      });
      setShowPaymentForm(false);
      setPaymentFormData({
        historyId: null,
        quantity_received: '',
        ...defaultPaymentState,
      });
      fetchPackages();
      fetchPackageHistory();
    } catch (error) {
      console.error('Error marking package as received and paid:', error);
      const d = error.response?.data;
      const msg = formatApiError(d) || error.message;
      alert(msg || 'Error marking package as received and paid');
    }
  };

  const pkgStockSort = useClientTableSort(PKG_STOCK_SORT);
  const pkgHistSort = useClientTableSort(PKG_HIST_SORT);
  const displayPackages = useMemo(
    () => pkgStockSort.sortRows(packages),
    [packages, pkgStockSort]
  );
  const displayPackageHistory = useMemo(
    () => pkgHistSort.sortRows(packageHistory),
    [packageHistory, pkgHistSort]
  );

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Packages</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Package Stock'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h2>{editingPackage ? 'Update Package Stock' : 'Add Package Stock'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Package Type</label>
                {editingPackage ? (
                  <input
                    type="text"
                    value={formData.package_type}
                    disabled
                    style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                  />
                ) : (
                  <>
                    <select
                      value={formData.package_type === 'custom' ? 'custom' : (packages.find(p => p.package_type === formData.package_type) ? formData.package_type : 'custom')}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setFormData({ ...formData, package_type: '', cost_per_unit_uzs: '', cost_per_unit_usd: '' });
                        } else {
                          const selectedPackage = packages.find(p => p.package_type === e.target.value);
                          const defUsd = e.target.value === 'M' ? '1.00' : '2.00';
                          setFormData({ 
                            ...formData, 
                            package_type: e.target.value, 
                            cost_per_unit_uzs: selectedPackage
                              ? String(selectedPackage.cost_per_unit_uzs ?? '')
                              : '0',
                            cost_per_unit_usd: selectedPackage
                              ? String(selectedPackage.cost_per_unit_usd ?? '')
                              : defUsd,
                          });
                        }
                      }}
                      required
                    >
                      <option value="custom">+ Add New Package Type</option>
                      {packages.map(pkg => (
                        <option key={pkg.id} value={pkg.package_type}>
                          {pkg.package_type} (UZS {parseFloat(pkg.cost_per_unit_uzs || 0).toLocaleString()} · ${parseFloat(pkg.cost_per_unit_usd || 0).toFixed(2)})
                        </option>
                      ))}
                    </select>
                    {(!formData.package_type || formData.package_type === '' || !packages.find(p => p.package_type === formData.package_type)) && (
                      <input
                        type="text"
                        placeholder="Enter package type name (e.g., M, L, Small Box, etc.)"
                        value={formData.package_type || ''}
                        onChange={(e) => setFormData({ ...formData, package_type: e.target.value })}
                        required
                        style={{ marginTop: '10px' }}
                      />
                    )}
                  </>
                )}
              </div>
              <div className="form-group">
                <label>Quantity to Add</label>
                <input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                  placeholder={editingPackage ? 'New total quantity' : 'Quantity to add'}
                />
              </div>
              <div className="form-group">
                <label>Cost per unit (UZS)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost_per_unit_uzs}
                  onChange={(e) => setFormData({ ...formData, cost_per_unit_uzs: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Cost per unit (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost_per_unit_usd}
                  onChange={(e) => setFormData({ ...formData, cost_per_unit_usd: e.target.value })}
                  placeholder={formData.package_type === 'L' ? '2.00' : '1.00'}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingPackage ? 'Update' : 'Add Stock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPaymentForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Mark Package Purchase #{paymentFormData.historyId} as Received and Pay</h2>
          <form onSubmit={handlePaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Quantity Received</label>
                <input
                  type="number"
                  min="0"
                  value={paymentFormData.quantity_received}
                  onChange={(e) => {
                    const historyItem = packageHistory.find(h => h.id === paymentFormData.historyId);
                    const cpuUzs = parseFloat(historyItem?.cost_per_unit_uzs) || 0;
                    const cpuUsd = parseFloat(historyItem?.cost_per_unit_usd) || 0;
                    const qty = parseInt(e.target.value) || 0;
                    const dueUzs = qty * cpuUzs;
                    const dueUsd = qty * cpuUsd;
                    setPaymentFormData((prev) => ({
                      ...prev,
                      quantity_received: e.target.value,
                      payment_uzs: dueUzs > 0 ? String(dueUzs) : '',
                      payment_usd: dueUsd > 0 ? String(dueUsd) : '',
                    }));
                  }}
                  required
                />
                <small style={{ color: '#666', fontSize: '0.85em' }}>
                  Ordered: {packageHistory.find(h => h.id === paymentFormData.historyId)?.quantity_added || 0}
                </small>
              </div>
              <div className="form-group">
                <label>UZS</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={paymentFormData.payment_uzs}
                  onChange={(e) =>
                    setPaymentFormData({
                      ...paymentFormData,
                      payment_uzs: sanitizePaymentAmountInput(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>USD</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={paymentFormData.payment_usd}
                  onChange={(e) =>
                    setPaymentFormData({
                      ...paymentFormData,
                      payment_usd: sanitizePaymentAmountInput(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Mark as Received and Pay
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowPaymentForm(false);
                  setPaymentFormData({
                    historyId: null,
                    quantity_received: '',
                    ...defaultPaymentState,
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh columnId="package_type" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Package Type
              </SortableTh>
              <SortableTh columnId="quantity" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Quantity
              </SortableTh>
              <SortableTh columnId="cost_uzs_unit" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Cost / unit (UZS)
              </SortableTh>
              <SortableTh columnId="cost_usd_unit" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Cost / unit (USD)
              </SortableTh>
              <SortableTh columnId="total_uzs" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Total (UZS)
              </SortableTh>
              <SortableTh columnId="total_usd" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Total (USD)
              </SortableTh>
              <SortableTh columnId="updated_at" sortCol={pkgStockSort.sortCol} sortDir={pkgStockSort.sortDir} onSort={pkgStockSort.onHeaderClick}>
                Updated
              </SortableTh>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>
                  No packages found
                </td>
              </tr>
            ) : (
              displayPackages.map((packageItem) => (
                <tr key={packageItem.id}>
                  <td><strong>Package {packageItem.package_type}</strong></td>
                  <td>{packageItem.quantity}</td>
                  <td>{parseFloat(packageItem.cost_per_unit_uzs || 0).toLocaleString()}</td>
                  <td>${parseFloat(packageItem.cost_per_unit_usd || 0).toFixed(2)}</td>
                  <td>
                    {(
                      parseFloat(packageItem.quantity) * parseFloat(packageItem.cost_per_unit_uzs || 0)
                    ).toLocaleString()}{' '}
                    UZS
                  </td>
                  <td>
                    $
                    {(
                      parseFloat(packageItem.quantity) * parseFloat(packageItem.cost_per_unit_usd || 0)
                    ).toFixed(2)}
                  </td>
                  <td>{new Date(packageItem.updated_at).toLocaleString()}</td>
                  <td>
                    <button
                      className="btn-edit"
                      onClick={() => handleEdit(packageItem)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
            <tfoot>
            <tr>
              <td style={{ textAlign: 'right' }}>Total</td>
              <td style={{ fontWeight: 600 }}>{packageStockTotals.quantity.toLocaleString()}</td>
              <td>—</td>
              <td>—</td>
              <td style={{ fontWeight: 600 }}>
                {packageStockTotals.totalUzs.toLocaleString()} UZS
              </td>
              <td style={{ fontWeight: 600 }}>
                ${packageStockTotals.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td colSpan="2">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="table-card" style={{ marginTop: '30px' }}>
        <h2>Package Stock History</h2>
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh columnId="id" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                ID
              </SortableTh>
              <SortableTh columnId="package_type" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Package Type
              </SortableTh>
              <SortableTh columnId="quantity_added" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Quantity Added
              </SortableTh>
              <SortableTh columnId="cost_unit_key" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Cost / unit
              </SortableTh>
              <SortableTh columnId="total_cost_key" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Total cost
              </SortableTh>
              <SortableTh columnId="status" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Status
              </SortableTh>
              <SortableTh columnId="uzs_paid" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                UZS Paid
              </SortableTh>
              <SortableTh columnId="usd_paid" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                USD Paid
              </SortableTh>
              <SortableTh columnId="added_by" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Added By
              </SortableTh>
              <SortableTh columnId="date" sortCol={pkgHistSort.sortCol} sortDir={pkgHistSort.sortDir} onSort={pkgHistSort.onHeaderClick}>
                Date
              </SortableTh>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {packageHistory.length === 0 ? (
              <tr>
                <td colSpan="11" style={{ textAlign: 'center' }}>
                  No package history found
                </td>
              </tr>
            ) : (
              displayPackageHistory.map((historyItem) => {
                const showPay = historyItem.is_paid || historyItem.status === 'paid';
                const cpuU = parseFloat(historyItem.cost_per_unit_uzs) || 0;
                const cpuD = parseFloat(historyItem.cost_per_unit_usd) || 0;
                const totU = parseFloat(historyItem.total_cost_uzs) || 0;
                const totD = parseFloat(historyItem.total_cost_usd) || 0;
                return (
                <tr key={historyItem.id}>
                  <td>#{historyItem.id}</td>
                  <td><strong>Package {historyItem.package_detail?.package_type || historyItem.package}</strong></td>
                  <td style={{ color: '#28a745', fontWeight: '600' }}>
                    {historyItem.quantity_received !== null && historyItem.quantity_received !== historyItem.quantity_added ? (
                      <span>
                        +{historyItem.quantity_received} <small style={{ color: '#666', fontSize: '0.85em' }}>(ordered: {historyItem.quantity_added})</small>
                      </span>
                    ) : (
                      `+${historyItem.quantity_added}`
                    )}
                  </td>
                  <td style={{ fontSize: '0.9em' }}>
                    {cpuU > 0 && <div>{cpuU.toLocaleString()} UZS</div>}
                    {cpuD > 0 && <div>${cpuD.toFixed(2)} USD</div>}
                    {cpuU === 0 && cpuD === 0 && '—'}
                  </td>
                  <td style={{ fontWeight: '600', fontSize: '0.9em' }}>
                    {totU > 0 && <div>{totU.toLocaleString()} UZS</div>}
                    {totD > 0 && <div>${totD.toFixed(2)} USD</div>}
                    {totU === 0 && totD === 0 && '—'}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        historyItem.status === 'paid'
                          ? 'completed'
                          : historyItem.status === 'received'
                            ? 'confirmed'
                            : 'pending'
                      }`}
                      title={
                        historyItem.status === 'ordered'
                          ? 'Awaiting receipt and payment (use action when stock arrives)'
                          : historyItem.status === 'paid'
                            ? 'Recorded with payment'
                            : 'Added to stock; no payment line (cost only)'
                      }
                    >
                      {historyItem.status === 'paid'
                        ? 'PAID'
                        : historyItem.status === 'received'
                          ? 'IN STOCK'
                          : 'ORDERED'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.9em' }}>
                    {showPay ? formatHistoryUzs((parseFloat(historyItem.payment_uzs_cash) || 0) + (parseFloat(historyItem.payment_uzs_card) || 0)) : '—'}
                  </td>
                  <td style={{ fontSize: '0.9em' }}>
                    {showPay ? formatHistoryUsd((parseFloat(historyItem.payment_usd_cash) || 0) + (parseFloat(historyItem.payment_usd_card) || 0)) : '—'}
                  </td>
                  <td>{historyItem.created_by_detail?.username || '-'}</td>
                  <td>{new Date(historyItem.created_at).toLocaleString()}</td>
                  <td>
                    {historyItem.status === 'ordered' ? (
                      <button
                        type="button"
                        className="btn-status"
                        onClick={() => handleMarkReceivedAndPay(historyItem.id)}
                      >
                        Mark as Received and Pay
                      </button>
                    ) : (
                      <span style={{ color: '#adb5bd' }}>—</span>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="2" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td style={{ fontWeight: 600 }}>{packageHistoryTotals.quantityAdded.toLocaleString()}</td>
              <td>—</td>
              <td style={{ fontWeight: 600, fontSize: '0.95em' }}>
                {packageHistoryTotals.totalCostUzs > 0 && (
                  <div>
                    {packageHistoryTotals.totalCostUzs.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
                  </div>
                )}
                {packageHistoryTotals.totalCostUsd > 0 && (
                  <div>
                    ${packageHistoryTotals.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
                {packageHistoryTotals.totalCostUzs === 0 && packageHistoryTotals.totalCostUsd === 0 && '—'}
              </td>
              <td>—</td>
              <td style={{ fontSize: '0.9em', fontWeight: 600 }}>
                {formatHistoryUzs(packageHistoryTotals.sumUzs)}
              </td>
              <td style={{ fontSize: '0.9em', fontWeight: 600 }}>
                {formatHistoryUsd(packageHistoryTotals.sumUsd)}
              </td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default Packages;

