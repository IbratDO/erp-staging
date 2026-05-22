import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { cashBalanceTotalByCurrency, formatInsufficientLedgerMessage } from '../utils/currencyFormat';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

const PKG_INV_SORT = {
  package_type: (r) => String(r.package_type ?? '').toLowerCase(),
  quantity: (r) => Number(r.quantity) || 0,
  cost_uzs_unit: (r) => parseFloat(r.cost_per_unit_uzs) || 0,
  cost_usd_unit: (r) => parseFloat(r.cost_per_unit_usd) || 0,
  total_uzs: (r) => (parseFloat(r.quantity) || 0) * (parseFloat(r.cost_per_unit_uzs) || 0),
  total_usd: (r) => (parseFloat(r.quantity) || 0) * (parseFloat(r.cost_per_unit_usd) || 0),
  batch_ref: (r) => Number(r.historyId) || Number(r.batchId) || 0,
  received_at: (r) => new Date(r.received_at).getTime() || 0,
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
  const [packageBatches, setPackageBatches] = useState([]);
  const [packageHistory, setPackageHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [formData, setFormData] = useState({
    package_type: 'M',
    quantity: '',
    cost_per_unit_uzs: '',
    cost_per_unit_usd: '',
    pay_immediately: false,
  });
  const [paymentFormData, setPaymentFormData] = useState({
    historyId: null,
    action: 'pay_receive',
    quantity_received: '',
    ...defaultPaymentState,
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [balances, setBalances] = useState([]);
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success',
  });

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 5000);
  };

  useEffect(() => {
    fetchPackages();
    fetchPackageBatches();
    fetchPackageHistory();
    fetchBalances();
  }, []);

  const refreshInventory = () => {
    fetchPackages();
    fetchPackageBatches();
    fetchPackageHistory();
  };

  const fetchBalances = async () => {
    try {
      const response = await api.get('/cash-balance/');
      setBalances(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  const fetchPackageBatches = async () => {
    try {
      const response = await api.get('/package-batches/');
      setPackageBatches(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching package batches:', error);
    }
  };

  const inventoryRows = useMemo(() => {
    return packageBatches
      .filter((b) => (parseInt(b.quantity_remaining, 10) || 0) > 0)
      .map((b) => ({
        rowKey: `batch-${b.id}`,
        batchId: b.id,
        historyId: b.purchase_id || b.source_history,
        package_type: b.package_type,
        quantity: parseInt(b.quantity_remaining, 10) || 0,
        cost_per_unit_uzs: parseFloat(b.unit_cost_uzs) || 0,
        cost_per_unit_usd: parseFloat(b.unit_cost_usd) || 0,
        received_at: b.received_at,
      }));
  }, [packageBatches]);

  const inventoryTotals = useMemo(() => {
    let quantity = 0;
    let totalUzs = 0;
    let totalUsd = 0;
    for (const r of inventoryRows) {
      const q = r.quantity || 0;
      quantity += q;
      totalUzs += q * (r.cost_per_unit_uzs || 0);
      totalUsd += q * (r.cost_per_unit_usd || 0);
    }
    return { quantity, totalUzs, totalUsd };
  }, [inventoryRows]);

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

      const toAdd = editingPackage
        ? parseInt(formData.quantity, 10) || 0
        : quantity;
      const delta = toAdd;
      const payImmediately = Boolean(formData.pay_immediately);
      if (delta > 0 && payImmediately) {
        const totalUzs = delta * costUzs;
        const totalUsd = delta * costUsd;
        let freshBalances = balances;
        try {
          const balancesRes = await api.get('/cash-balance/');
          freshBalances = balancesRes.data.results || balancesRes.data;
          setBalances(freshBalances);
        } catch (balanceErr) {
          console.error('Error refreshing balances:', balanceErr);
        }
        if (totalUzs > 0) {
          const available = cashBalanceTotalByCurrency(freshBalances, 'UZS');
          if (available < totalUzs) {
            showNotification(formatInsufficientLedgerMessage('UZS', available, totalUzs, { topUpSuffix: true }), 'error');
            return;
          }
        }
        if (totalUsd > 0) {
          const available = cashBalanceTotalByCurrency(freshBalances, 'USD');
          if (available < totalUsd) {
            showNotification(formatInsufficientLedgerMessage('USD', available, totalUsd, { topUpSuffix: true }), 'error');
            return;
          }
        }
      }
      if (editingPackage) {
        const currentQty = parseInt(editingPackage.quantity, 10) || 0;
        await api.put(`/packages/${editingPackage.id}/`, {
          package_type: formData.package_type,
          quantity: currentQty + toAdd,
          cost_per_unit_uzs: costUzs,
          cost_per_unit_usd: costUsd,
          pay_immediately: payImmediately,
        });
      } else {
        const existingPackage = packages.find((p) => p.package_type === formData.package_type);
        const packageData = {
          package_type: formData.package_type,
          quantity: toAdd,
          cost_per_unit_uzs: costUzs,
          cost_per_unit_usd: costUsd,
          pay_immediately: payImmediately,
        };
        if (existingPackage) {
          const currentQty = parseInt(existingPackage.quantity, 10) || 0;
          await api.put(`/packages/${existingPackage.id}/`, {
            ...packageData,
            quantity: currentQty + toAdd,
          });
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
        pay_immediately: false,
      });
      refreshInventory();
    } catch (error) {
      console.error('Error saving package:', error);
      const d = error.response?.data;
      const msg = formatApiError(d) || error.message;
      showNotification(msg || 'Error saving package', 'error');
    } finally {
      fetchPackageHistory();
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

  const openPaymentForm = (historyId, action) => {
    const historyItem = packageHistory.find((h) => h.id === historyId);
    const quantityOrdered = historyItem?.quantity_added || 0;
    const dueUzs = (parseFloat(historyItem?.cost_per_unit_uzs) || 0) * quantityOrdered;
    const dueUsd = (parseFloat(historyItem?.cost_per_unit_usd) || 0) * quantityOrdered;
    setPaymentFormData({
      historyId,
      action,
      quantity_received: quantityOrdered,
      payment_uzs: action === 'receive' ? '' : dueUzs > 0 ? String(dueUzs) : '',
      payment_usd: action === 'receive' ? '' : dueUsd > 0 ? String(dueUsd) : '',
    });
    setShowPaymentForm(true);
  };

  const statusLabel = (status) => {
    if (status === 'paid' || status === 'in_stock') return 'IN STOCK';
    if (status === 'order_paid') return 'PAID · AWAITING RECEIPT';
    if (status === 'ordered') return 'ORDERED';
    if (status === 'received') return 'IN STOCK';
    return String(status || '').toUpperCase();
  };

  const statusClass = (status) => {
    if (status === 'paid' || status === 'in_stock' || status === 'received') return 'completed';
    if (status === 'order_paid') return 'confirmed';
    return 'pending';
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
      if (
        paymentFormData.action !== 'receive' &&
        (dueUzs > 0 || dueUsd > 0) &&
        uzs + usd <= 0
      ) {
        showNotification('Enter at least one payment amount (UZS or USD).', 'error');
        return;
      }
      let freshBalances = balances;
      try {
        const balancesRes = await api.get('/cash-balance/');
        freshBalances = balancesRes.data.results || balancesRes.data;
        setBalances(freshBalances);
      } catch (balanceErr) {
        console.error('Error refreshing balances:', balanceErr);
      }
      if (paymentFormData.action !== 'receive') {
        if (uzs > 0) {
          const available = cashBalanceTotalByCurrency(freshBalances, 'UZS');
          if (available < uzs) {
            showNotification(formatInsufficientLedgerMessage('UZS', available, uzs, { topUpSuffix: true }), 'error');
            return;
          }
        }
        if (usd > 0) {
          const available = cashBalanceTotalByCurrency(freshBalances, 'USD');
          if (available < usd) {
            showNotification(formatInsufficientLedgerMessage('USD', available, usd, { topUpSuffix: true }), 'error');
            return;
          }
        }
      }
      const payload = {
        quantity_received: paymentFormData.quantity_received,
        payment_uzs: uzs,
        payment_usd: usd,
      };
      const hid = paymentFormData.historyId;
      if (paymentFormData.action === 'pay') {
        await api.post(`/package-history/${hid}/mark_paid/`, payload);
      } else if (paymentFormData.action === 'receive') {
        await api.post(`/package-history/${hid}/mark_received/`, payload);
      } else {
        await api.post(`/package-history/${hid}/mark_received_and_pay/`, payload);
      }
      setShowPaymentForm(false);
      setPaymentFormData({
        historyId: null,
        quantity_received: '',
        ...defaultPaymentState,
      });
      refreshInventory();
    } catch (error) {
      console.error('Error completing package purchase step:', error);
      const d = error.response?.data;
      const msg = formatApiError(d) || error.message;
      showNotification(msg || 'Error marking package as received and paid', 'error');
    }
  };

  const pkgInvSort = useClientTableSort(PKG_INV_SORT);
  const pkgHistSort = useClientTableSort(PKG_HIST_SORT);
  const displayInventory = useMemo(
    () => pkgInvSort.sortRows(inventoryRows),
    [inventoryRows, pkgInvSort]
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
      {notification.show && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '16px 20px',
            borderRadius: '8px',
            backgroundColor: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          <span style={{ fontSize: '20px' }}>
            {notification.type === 'success' ? '✓' : notification.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification({ show: false, message: '', type: 'success' })}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1',
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="page-header">
        <h1>Packages</h1>
        <button
          className="btn-primary"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setEditingPackage(null);
            } else {
              setEditingPackage(null);
              setShowForm(true);
            }
          }}
        >
          {showForm ? 'Cancel' : '+ Order Package Stock'}
        </button>
      </div>

      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em', maxWidth: 820 }}>
        Each purchase at a different unit price is a separate FIFO layer. Default flow: order → pay (payable) →
        receive into inventory. Payables appear under Receivables / Payables. Package stock is included on the
        balance sheet; COGS on sales uses oldest layers first.
      </p>

      {showForm && (
        <div className="form-card">
          <h2>{editingPackage ? `Add Stock — Package ${editingPackage.package_type}` : 'Order Package Stock'}</h2>
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
                <label>Quantity to order</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                  placeholder="Units in this purchase"
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.pay_immediately)}
                    onChange={(e) =>
                      setFormData({ ...formData, pay_immediately: e.target.checked })
                    }
                  />
                  Pay and receive immediately (skip payable; deduct cash now)
                </label>
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
                {formData.pay_immediately ? 'Pay, receive & add stock' : 'Create purchase order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPaymentForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>
            {paymentFormData.action === 'pay'
              ? `Pay package purchase #${paymentFormData.historyId}`
              : paymentFormData.action === 'receive'
                ? `Receive stock — purchase #${paymentFormData.historyId}`
                : `Pay & receive — purchase #${paymentFormData.historyId}`}
          </h2>
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
              {paymentFormData.action !== 'receive' && (
                <>
                  <div className="form-group">
                    <label>UZS payment</label>
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
                    <label>USD payment</label>
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
                </>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {paymentFormData.action === 'pay'
                  ? 'Record payment'
                  : paymentFormData.action === 'receive'
                    ? 'Receive into inventory'
                    : 'Pay & receive'}
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
        <h2 style={{ marginTop: 0 }}>Package inventory (on hand by batch)</h2>
        <p style={{ color: '#666', fontSize: '0.85em', marginTop: 0 }}>
          Current stock only — one row per purchase price layer. Purchases and payments are in the history table below.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh columnId="package_type" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Package type
              </SortableTh>
              <SortableTh columnId="batch_ref" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Batch / purchase #
              </SortableTh>
              <SortableTh columnId="quantity" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Qty on hand
              </SortableTh>
              <SortableTh columnId="cost_uzs_unit" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Cost / unit (UZS)
              </SortableTh>
              <SortableTh columnId="cost_usd_unit" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Cost / unit (USD)
              </SortableTh>
              <SortableTh columnId="total_uzs" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Total (UZS)
              </SortableTh>
              <SortableTh columnId="total_usd" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Total (USD)
              </SortableTh>
              <SortableTh columnId="received_at" sortCol={pkgInvSort.sortCol} sortDir={pkgInvSort.sortDir} onSort={pkgInvSort.onHeaderClick}>
                Received
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {displayInventory.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>
                  No package stock on hand
                </td>
              </tr>
            ) : (
              displayInventory.map((row) => {
                const totUzs = row.quantity * (row.cost_per_unit_uzs || 0);
                const totUsd = row.quantity * (row.cost_per_unit_usd || 0);
                return (
                  <tr key={row.rowKey}>
                    <td><strong>Package {row.package_type}</strong></td>
                    <td>{row.historyId ? `#${row.historyId}` : `Layer ${row.batchId}`}</td>
                    <td>{row.quantity}</td>
                    <td>{row.cost_per_unit_uzs > 0 ? row.cost_per_unit_uzs.toLocaleString() : '—'}</td>
                    <td>${row.cost_per_unit_usd.toFixed(2)}</td>
                    <td>{totUzs > 0 ? `${totUzs.toLocaleString()} UZS` : '—'}</td>
                    <td>{totUsd > 0 ? `$${totUsd.toFixed(2)}` : '—'}</td>
                    <td>{row.received_at ? new Date(row.received_at).toLocaleString() : '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="2" style={{ textAlign: 'right' }}>On hand total</td>
              <td style={{ fontWeight: 600 }}>{inventoryTotals.quantity.toLocaleString()}</td>
              <td>—</td>
              <td>—</td>
              <td style={{ fontWeight: 600 }}>
                {inventoryTotals.totalUzs.toLocaleString()} UZS
              </td>
              <td style={{ fontWeight: 600 }}>
                ${inventoryTotals.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td>—</td>
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
                      className={`status-badge ${statusClass(historyItem.status)}`}
                      title={
                        historyItem.status === 'ordered'
                          ? 'Awaiting payment and receipt'
                          : historyItem.status === 'order_paid'
                            ? 'Paid; receive when stock arrives'
                            : historyItem.status === 'paid'
                              ? 'Paid and in inventory'
                              : 'In stock'
                      }
                    >
                      {statusLabel(historyItem.status)}
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
                    {historyItem.status === 'ordered' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button
                          type="button"
                          className="btn-status"
                          onClick={() => openPaymentForm(historyItem.id, 'pay')}
                        >
                          Pay
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: '0.85em', padding: '4px 8px' }}
                          onClick={() => openPaymentForm(historyItem.id, 'pay_receive')}
                        >
                          Pay & receive
                        </button>
                      </div>
                    )}
                    {historyItem.status === 'order_paid' && (
                      <button
                        type="button"
                        className="btn-status"
                        onClick={() => openPaymentForm(historyItem.id, 'receive')}
                      >
                        Receive stock
                      </button>
                    )}
                    {(historyItem.status === 'paid' || historyItem.status === 'received') && (
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

