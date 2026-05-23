import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { cashBalanceTotalByCurrency, formatInsufficientLedgerMessage } from '../utils/currencyFormat';
import './TablePage.css';

const CATEGORIES = [
  ['vehicle', 'Vehicle'],
  ['equipment', 'Equipment'],
  ['computer', 'Computer'],
  ['machinery', 'Machinery'],
  ['furniture', 'Furniture'],
  ['building', 'Building'],
  ['office_equipment', 'Office Equipment'],
  ['other', 'Other'],
];

const PURCHASE_STATUS_LABEL = {
  ordered: 'Ordered',
  order_paid: 'Paid',
  received: 'Received',
};

const defaultPaymentState = {
  assetId: null,
  action: 'pay',
  payment_uzs: '',
  payment_usd: '',
  notes: '',
};

const sanitizePaymentAmountInput = (raw) => {
  if (raw === '' || raw == null) return '';
  return String(raw).replace(/[$\s,]/g, '');
};

function formatApiError(data) {
  if (data == null) return null;
  if (typeof data === 'string') return data;
  if (data.error) return String(data.error);
  if (data.detail) return String(data.detail);
  return null;
}

const FixedAssets = () => {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState(defaultPaymentState);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [form, setForm] = useState({
    name: '',
    category: 'other',
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_cost: '',
    currency: 'USD',
    current_value: '',
    depreciation: '',
    notes: '',
    pay_immediately: false,
  });

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 5000);
  };

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/fixed-assets/');
      setAssets(data.results || data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async () => {
    try {
      const { data } = await api.get('/cash-balance/');
      setBalances(data.results || data);
    } catch (e) {
      setBalances([]);
    }
  };

  useEffect(() => {
    fetchAssets();
    fetchBalances();
  }, []);

  const getAvailableBalance = (currency) => cashBalanceTotalByCurrency(balances, currency);

  const prefillPaymentForAsset = (asset, action) => {
    const cost = parseFloat(asset.purchase_cost) || 0;
    const ccy = (asset.currency || 'USD').toUpperCase();
    const uzs = ccy === 'UZS' && cost > 0 ? String(cost) : '';
    const usd = ccy === 'USD' && cost > 0 ? String(cost) : '';
    setPaymentForm({
      assetId: asset.id,
      action,
      payment_uzs: uzs,
      payment_usd: usd,
      notes: '',
    });
    setShowPaymentForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/fixed-assets/', {
        name: form.name,
        category: form.category,
        purchase_date: form.purchase_date,
        purchase_cost: form.purchase_cost || 0,
        currency: form.currency,
        current_value: form.current_value || form.purchase_cost || 0,
        depreciation: form.depreciation || null,
        notes: form.notes,
        pay_immediately: form.pay_immediately,
        payment_uzs: form.pay_immediately && form.currency === 'UZS' ? form.purchase_cost : 0,
        payment_usd: form.pay_immediately && form.currency === 'USD' ? form.purchase_cost : 0,
      });
      setShowForm(false);
      setForm({
        name: '',
        category: 'other',
        purchase_date: new Date().toISOString().slice(0, 10),
        purchase_cost: '',
        currency: 'USD',
        current_value: '',
        depreciation: '',
        notes: '',
        pay_immediately: false,
      });
      fetchAssets();
      fetchBalances();
      showNotification('Fixed asset saved.');
    } catch (err) {
      showNotification(formatApiError(err.response?.data) || 'Failed to save asset', 'error');
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === paymentForm.assetId);
    if (!asset) return;

    const uzs = parseFloat(paymentForm.payment_uzs) || 0;
    const usd = parseFloat(paymentForm.payment_usd) || 0;
    const payload = {
      payment_uzs: uzs,
      payment_usd: usd,
      notes: paymentForm.notes,
    };

    if (paymentForm.action !== 'receive') {
      if (uzs + usd === 0) {
        showNotification('Enter at least one payment amount.', 'error');
        return;
      }
      if (uzs > 0 && getAvailableBalance('UZS') < uzs) {
        showNotification(formatInsufficientLedgerMessage('UZS', getAvailableBalance('UZS'), uzs), 'error');
        return;
      }
      if (usd > 0 && getAvailableBalance('USD') < usd) {
        showNotification(formatInsufficientLedgerMessage('USD', getAvailableBalance('USD'), usd), 'error');
        return;
      }
    }

    try {
      let url = '';
      if (paymentForm.action === 'pay') url = `/fixed-assets/${asset.id}/pay_purchase/`;
      else if (paymentForm.action === 'receive') url = `/fixed-assets/${asset.id}/receive_asset/`;
      else if (paymentForm.action === 'sell') url = `/fixed-assets/${asset.id}/sell_asset/`;

      await api.post(url, payload);
      setShowPaymentForm(false);
      setPaymentForm(defaultPaymentState);
      fetchAssets();
      fetchBalances();
      showNotification('Updated successfully.');
    } catch (err) {
      showNotification(formatApiError(err.response?.data) || 'Action failed', 'error');
    }
  };

  const handleReceive = async (asset) => {
    try {
      await api.post(`/fixed-assets/${asset.id}/receive_asset/`, {});
      fetchAssets();
      showNotification('Asset received onto the balance sheet.');
    } catch (err) {
      showNotification(formatApiError(err.response?.data) || 'Receive failed', 'error');
    }
  };

  const handleWriteOff = async (asset) => {
    const notes = window.prompt('Notes for write-off (optional):', '') ?? '';
    if (!window.confirm(`Write off "${asset.name}"? Remaining book value will be expensed.`)) return;
    try {
      await api.post(`/fixed-assets/${asset.id}/write_off/`, { notes });
      fetchAssets();
      fetchBalances();
      showNotification('Asset written off.');
    } catch (err) {
      showNotification(formatApiError(err.response?.data) || 'Write-off failed', 'error');
    }
  };

  const handleDelete = async (asset) => {
    if (!window.confirm(`Remove purchase order for "${asset.name}"? Payable will be cancelled.`)) return;
    try {
      await api.delete(`/fixed-assets/${asset.id}/`);
      fetchAssets();
      showNotification('Purchase order removed.');
    } catch (err) {
      showNotification(formatApiError(err.response?.data) || 'Delete failed', 'error');
    }
  };

  const paymentTitle = () => {
    const a = assets.find((x) => x.id === paymentForm.assetId);
    if (!a) return 'Payment';
    if (paymentForm.action === 'pay') return `Pay for asset #${a.id} — ${a.name}`;
    if (paymentForm.action === 'receive') return `Receive asset #${a.id} — ${a.name}`;
    if (paymentForm.action === 'sell') return `Sell asset — ${a.name}`;
    return 'Payment';
  };

  if (loading) return <div className="page-container">Loading…</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Fixed Assets</h1>
        {isAdmin && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add asset'}
          </button>
        )}
      </div>

      {notification.show && (
        <div className={`notification ${notification.type}`} style={{ marginBottom: 12 }}>
          {notification.message}
        </div>
      )}

      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em', maxWidth: 820 }}>
        Create a purchase order (payable), pay supplier (cash down — shows as fixed-asset receivable until
        received), then receive onto the balance sheet. You may also receive on credit first (payable stays
        until paid). Sell or write off updates cash and removes the asset from the books.
      </p>

      {showForm && isAdmin && (
        <div className="form-card" style={{ marginBottom: 16 }}>
          <h2>New fixed asset</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Asset name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Purchase date</label>
                <input
                  type="date"
                  required
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Purchase cost *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.purchase_cost}
                  onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Current value (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.current_value}
                  onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Accumulated depreciation (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.depreciation}
                  onChange={(e) => setForm({ ...form, depreciation: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.pay_immediately}
                    onChange={(e) => setForm({ ...form, pay_immediately: e.target.checked })}
                  />
                  Pay immediately from cash (receive separately when the asset arrives)
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {form.pay_immediately ? 'Pay now (receive later)' : 'Create purchase order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPaymentForm && (
        <div className="form-card" style={{ marginBottom: 16 }}>
          <h2>{paymentTitle()}</h2>
          <form onSubmit={handlePaymentSubmit}>
            {paymentForm.action !== 'receive' && (
              <div className="form-grid">
                <div className="form-group">
                  <label>UZS payment</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={paymentForm.payment_uzs}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
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
                    value={paymentForm.payment_usd}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        payment_usd: sanitizePaymentAmountInput(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            )}
            {paymentForm.action === 'sell' && (
              <div className="form-group" style={{ marginTop: 8 }}>
                <label>Notes</label>
                <input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                />
              </div>
            )}
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary">Confirm</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowPaymentForm(false);
                  setPaymentForm(defaultPaymentState);
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
              <th>Name</th>
              <th>Category</th>
              <th>Purchase date</th>
              <th>Cost</th>
              <th>Book value</th>
              <th>Purchase</th>
              <th>Status</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center' }}>
                  No fixed assets
                </td>
              </tr>
            ) : (
              assets.map((a) => {
                const cost = parseFloat(a.purchase_cost) || 0;
                const showPay =
                  !a.is_paid &&
                  cost > 0 &&
                  (a.purchase_status === 'ordered' || a.purchase_status === 'received');
                const showReceive =
                  a.status === 'active' &&
                  a.purchase_status !== 'received' &&
                  (a.purchase_status === 'order_paid' || a.purchase_status === 'ordered');
                const onBooks = a.purchase_status === 'received' && a.status === 'active';
                const canDelete = a.purchase_status === 'ordered' && !a.is_paid;

                return (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.category}</td>
                    <td>{a.purchase_date}</td>
                    <td>
                      {cost.toLocaleString()} {a.currency}
                      {a.payable_status === 'pending' && a.purchase_status === 'received' && (
                        <div style={{ fontSize: '0.8em', color: '#c62828' }}>Payable (on credit)</div>
                      )}
                    </td>
                    <td>
                      {a.book_value_display} {a.currency}
                    </td>
                    <td>
                      <span className={`status-badge ${a.purchase_status}`}>
                        {PURCHASE_STATUS_LABEL[a.purchase_status] || a.purchase_status}
                      </span>
                      {a.is_paid && a.purchase_status !== 'received' && (
                        <span style={{ marginLeft: 6, fontSize: '0.8em', color: '#2e7d32' }}>Paid</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${a.status}`}>{a.status}</span>
                      {a.sale_price != null && a.status === 'sold' && (
                        <div style={{ fontSize: '0.8em' }}>
                          Sold: {parseFloat(a.sale_price).toLocaleString()} {a.sale_currency || a.currency}
                        </div>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {showPay && (
                          <button
                            type="button"
                            className="btn-status"
                            style={{ marginRight: 4 }}
                            onClick={() => prefillPaymentForAsset(a, 'pay')}
                          >
                            Pay
                          </button>
                        )}
                        {showReceive && (
                          <button
                            type="button"
                            className="btn-status"
                            style={{ marginRight: 4 }}
                            onClick={() => handleReceive(a)}
                          >
                            Receive
                          </button>
                        )}
                        {onBooks && (
                          <>
                            <button
                              type="button"
                              className="btn-status"
                              style={{ marginRight: 4, backgroundColor: '#4caf50', color: '#fff' }}
                              onClick={() => prefillPaymentForAsset(a, 'sell')}
                            >
                              Sell
                            </button>
                            <button
                              type="button"
                              className="btn-status"
                              style={{ marginRight: 4 }}
                              onClick={() => handleWriteOff(a)}
                            >
                              Write off
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="btn-status"
                            onClick={() => handleDelete(a)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FixedAssets;
