import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

const Equity = () => {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    equity_type: 'contribution',
    amount: '',
    currency: 'USD',
    balance_type: 'usd_cash',
    notes: '',
  });

  const fetchRows = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/equity-transactions/');
      setRows(data.results || data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/equity-transactions/', {
        ...form,
        amount: form.amount || 0,
      });
      setShowForm(false);
      setForm({
        equity_type: 'contribution',
        amount: '',
        currency: 'USD',
        balance_type: 'usd_cash',
        notes: '',
      });
      fetchRows();
    } catch (err) {
      alert(err.response?.data?.detail || err.response?.data?.error || 'Failed to save');
    }
  };

  const totals = rows.reduce(
    (acc, r) => {
      const amt = parseFloat(r.amount) || 0;
      if (r.equity_type === 'contribution') acc.in += amt;
      else acc.out += amt;
      return acc;
    },
    { in: 0, out: 0 },
  );

  if (loading) return <div className="page-container">Loading…</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Equity</h1>
        {isAdmin && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Owner transaction'}
          </button>
        )}
      </div>
      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em', maxWidth: 720 }}>
        Owner capital and withdrawals update Money Balance and the Balance Sheet equity section.
        Operating profit flows via Profit / Loss into retained earnings.
      </p>

      <div className="metrics-grid" style={{ marginBottom: 16 }}>
        <div className="metric-card">
          <div className="metric-label">Contributions (listed)</div>
          <div className="metric-value" style={{ color: '#28a745' }}>
            {totals.in.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Withdrawals (listed)</div>
          <div className="metric-value" style={{ color: '#dc3545' }}>
            {totals.out.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {showForm && isAdmin && (
        <div className="form-card" style={{ marginBottom: 16 }}>
          <h2>Record owner transaction</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.equity_type}
                  onChange={(e) => setForm({ ...form, equity_type: e.target.value })}
                >
                  <option value="contribution">Contribution (cash in)</option>
                  <option value="withdrawal">Withdrawal (cash out)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      currency: e.target.value,
                      balance_type: e.target.value === 'UZS' ? 'uzs_cash' : 'usd_cash',
                    })
                  }
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Date</th>
              <th>Notes</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>
                  No equity transactions yet
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.equity_type}</td>
                  <td>{parseFloat(r.amount).toLocaleString()}</td>
                  <td>{r.currency}</td>
                  <td>{new Date(r.transaction_date).toLocaleString()}</td>
                  <td>{r.notes || '—'}</td>
                  <td>{r.created_by_username || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Equity;
