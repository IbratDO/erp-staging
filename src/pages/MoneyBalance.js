import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

/** Column order: UZS cash, UZS card, USD card, USD cash (matches user layout). */
const BALANCE_LEGS = ['uzs_cash', 'uzs_card', 'usd_card', 'usd_cash'];

function legHeaderLabel(leg) {
  if (leg === 'uzs_cash') return 'UZS — Cash';
  if (leg === 'uzs_card') return 'UZS — Card';
  if (leg === 'usd_card') return 'USD — Card';
  if (leg === 'usd_cash') return 'USD — Cash';
  return leg;
}

function signedForLeg(t, leg) {
  if (t.balance_detail?.balance_type !== leg) return null;
  const raw = parseFloat(t.amount) || 0;
  if (raw === 0) return 0;
  return t.operation === 'add' ? raw : -raw;
}

function LegAmountCell({ transaction, leg }) {
  const v = signedForLeg(transaction, leg);
  if (v === null) {
    return <span style={{ color: '#ced4da' }}>—</span>;
  }
  const isUzs = leg.startsWith('uzs');
  if (v === 0) {
    return <span style={{ color: '#adb5bd' }}>0</span>;
  }
  const color = v > 0 ? '#28a745' : '#dc3545';
  if (isUzs) {
    return (
      <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {v > 0 ? '+' : '−'}
        {Math.abs(v).toLocaleString()}
      </span>
    );
  }
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {v > 0 ? '+$' : v < 0 ? '−$' : '$'}
      {Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function LegTotalCell({ value, leg }) {
  const isUzs = leg.startsWith('uzs');
  if (value === 0) {
    return <span style={{ color: '#adb5bd' }}>0</span>;
  }
  const color = value > 0 ? '#1e5f2a' : '#a71d2a';
  if (isUzs) {
    return (
      <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value > 0 ? '+' : '−'}
        {Math.abs(value).toLocaleString()}
      </span>
    );
  }
  return (
    <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
      {value > 0 ? '+$' : '−$'}
      {Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

const MoneyBalance = () => {
  const { isAdmin } = useAuth();
  const [balances, setBalances] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjustFormData, setAdjustFormData] = useState({
    balance_type: 'usd_cash',
    amount: '',
    operation: 'add',
    notes: '',
  });
  const [filter, setFilter] = useState({
    balance_type: '',
    transaction_type: '',
    currency: '',
    payment_type: '',
    year: '',
    month: '',
  });

  useEffect(() => {
    fetchBalances();
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchBalances = async () => {
    try {
      const response = await api.get('/cash-balance/');
      const balancesList = response.data.results || response.data;
      
      // Ensure all four balance types exist
      const balanceTypes = ['usd_cash', 'uzs_cash', 'usd_card', 'uzs_card'];
      const existingTypes = balancesList.map(b => b.balance_type);
      
      for (const type of balanceTypes) {
        if (!existingTypes.includes(type)) {
          try {
            await api.post('/cash-balance/', {
              balance_type: type,
              balance: 0,
            });
          } catch (error) {
            console.error(`Error creating balance ${type}:`, error);
          }
        }
      }
      
      // Refetch after creating missing balances
      const updatedResponse = await api.get('/cash-balance/');
      setBalances(updatedResponse.data.results || updatedResponse.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
  };

  const transactionAmountTotals = useMemo(() => {
    const byType = { uzs_cash: 0, uzs_card: 0, usd_card: 0, usd_cash: 0 };
    for (const t of transactions) {
      const bt = t.balance_detail?.balance_type;
      if (!bt || !Object.prototype.hasOwnProperty.call(byType, bt)) continue;
      const amt = parseFloat(t.amount) || 0;
      const signed = t.operation === 'add' ? amt : -amt;
      byType[bt] += signed;
    }
    return byType;
  }, [transactions]);

  const fetchTransactions = async () => {
    try {
      let url = '/balance-transactions/';
      const params = new URLSearchParams();
      if (filter.balance_type) params.append('balance_type', filter.balance_type);
      if (filter.payment_type) params.append('payment_type', filter.payment_type);
      if (filter.transaction_type) params.append('transaction_type', filter.transaction_type);
      // balance_type: only from explicit “Balance” filter; do not narrow to one leg when only “Currency” is set
      // Convert year/month to date range
      if (filter.year || filter.month) {
        let dateFrom;
        let dateTo;
        if (filter.year && filter.month) {
          dateFrom = `${filter.year}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(
            parseInt(filter.year, 10),
            parseInt(filter.month, 10),
            0
          ).getDate();
          dateTo = `${filter.year}-${filter.month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else if (filter.year) {
          dateFrom = `${filter.year}-01-01`;
          dateTo = `${filter.year}-12-31`;
        } else if (filter.month) {
          const y = new Date().getFullYear();
          dateFrom = `${y}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(y, parseInt(filter.month, 10), 0).getDate();
          dateTo = `${y}-${filter.month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
      }
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      let list = response.data.results || response.data;

      if (filter.currency && !filter.balance_type) {
        const leg = (bt) => {
          if (filter.currency === 'USD') {
            return bt === 'usd_cash' || bt === 'usd_card';
          }
          if (filter.currency === 'UZS') {
            return bt === 'uzs_cash' || bt === 'uzs_card';
          }
          return true;
        };
        list = list.filter((tx) => leg(tx.balance_detail?.balance_type));
      }

      setTransactions(list);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!String(adjustFormData.notes || '').trim()) {
      alert('Please enter a note for this balance adjustment.');
      return;
    }
    try {
      const balance = balances.find(b => b.balance_type === adjustFormData.balance_type);
      if (!balance) {
        alert('Balance not found');
        return;
      }

      await api.post(`/cash-balance/${balance.id}/adjust/`, {
        amount: adjustFormData.amount,
        operation: adjustFormData.operation,
        notes: String(adjustFormData.notes).trim(),
      });

      setShowAdjustForm(false);
      setAdjustFormData({
        balance_type: 'usd_cash',
        amount: '',
        operation: 'add',
        notes: '',
      });
      
      // Await both fetches to ensure they complete before the UI updates
      await Promise.all([
        fetchBalances(),
        fetchTransactions()
      ]);
    } catch (error) {
      console.error('Error adjusting balance:', error);
      alert(error.response?.data?.error || 'Error adjusting balance');
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  const getBalanceDisplay = (balanceType) => {
    const balance = balances.find(b => b.balance_type === balanceType);
    return balance ? parseFloat(balance.balance).toLocaleString() : '0.00';
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Money Balance</h1>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowAdjustForm(!showAdjustForm)}>
            {showAdjustForm ? 'Cancel' : '+ Adjust Balance'}
          </button>
        )}
      </div>

      {/* Balance Cards */}
      <div className="metrics-grid" style={{ marginBottom: '30px' }}>
        <div className="metric-card" style={{ backgroundColor: '#f8f9fa', border: '2px solid #28a745' }}>
          <div className="metric-label">USD Cash Balance</div>
          <div className="metric-value" style={{ color: '#28a745', fontSize: '2em' }}>
            ${getBalanceDisplay('usd_cash')}
          </div>
        </div>
        <div className="metric-card" style={{ backgroundColor: '#f8f9fa', border: '2px solid #20c997' }}>
          <div className="metric-label">UZS Cash Balance</div>
          <div className="metric-value" style={{ color: '#20c997', fontSize: '2em' }}>
            {getBalanceDisplay('uzs_cash')} UZS
          </div>
        </div>
        <div className="metric-card" style={{ backgroundColor: '#f8f9fa', border: '2px solid #007bff' }}>
          <div className="metric-label">USD Card Balance</div>
          <div className="metric-value" style={{ color: '#007bff', fontSize: '2em' }}>
            ${getBalanceDisplay('usd_card')}
          </div>
        </div>
        <div className="metric-card" style={{ backgroundColor: '#f8f9fa', border: '2px solid #6f42c1' }}>
          <div className="metric-label">UZS Card Balance</div>
          <div className="metric-value" style={{ color: '#6f42c1', fontSize: '2em' }}>
            {getBalanceDisplay('uzs_card')} UZS
          </div>
        </div>
      </div>

      {/* Manual Adjustment Form */}
      {showAdjustForm && isAdmin && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Adjust Balance</h2>
          <form onSubmit={handleAdjust}>
            <div className="form-grid">
              <div className="form-group">
                <label>Balance Type</label>
                <select
                  value={adjustFormData.balance_type}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, balance_type: e.target.value })}
                  required
                >
                  <option value="usd_cash">USD Cash</option>
                  <option value="uzs_cash">UZS Cash</option>
                  <option value="usd_card">USD Card</option>
                  <option value="uzs_card">UZS Card</option>
                </select>
              </div>
              <div className="form-group">
                <label>Operation</label>
                <select
                  value={adjustFormData.operation}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, operation: e.target.value })}
                  required
                >
                  <option value="add">Add Money</option>
                  <option value="subtract">Subtract Money</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjustFormData.amount}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes *</label>
                <textarea
                  value={adjustFormData.notes}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, notes: e.target.value })}
                  rows="2"
                  required
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Adjust Balance
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
        <h3 className="filter-card__title">Filters</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>Balance</label>
            <select
              value={filter.balance_type}
              onChange={(e) => setFilter({ ...filter, balance_type: e.target.value })}
            >
              <option value="">All Balances</option>
              <option value="usd_cash">USD Cash</option>
              <option value="uzs_cash">UZS Cash</option>
              <option value="usd_card">USD Card</option>
              <option value="uzs_card">UZS Card</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Currency</label>
            <select
              value={filter.currency}
              onChange={(e) => {
                const currency = e.target.value;
                setFilter({
                  ...filter,
                  currency,
                });
              }}
            >
              <option value="">All Currencies</option>
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Pay type</label>
            <select
              value={filter.payment_type}
              onChange={(e) => setFilter({ ...filter, payment_type: e.target.value })}
            >
              <option value="">All Payment Types</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Txn type</label>
            <select
              value={filter.transaction_type}
              onChange={(e) => setFilter({ ...filter, transaction_type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="manual_adjustment">Manual Adjustment</option>
              <option value="sale_income">Sale Income</option>
              <option value="order_expense">Order Expense</option>
              <option value="cargo_expense">Cargo Expense</option>
              <option value="delivery_expense">Delivery Expense</option>
              <option value="other_expense">Other Expense</option>
              <option value="other_income">Other Income</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Year</label>
            <select
              value={filter.year}
              onChange={(e) => setFilter({ ...filter, year: e.target.value })}
            >
              <option value="">All Years</option>
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <option key={year} value={year.toString()}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="filter-field">
            <label>Month</label>
            <select
              value={filter.month}
              onChange={(e) => setFilter({ ...filter, month: e.target.value })}
            >
              <option value="">All Months</option>
              <option value="1">January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </div>
          <div className="filter-toolbar__actions">
            <button
              type="button"
              className="btn-edit"
              onClick={() => setFilter({ balance_type: '', transaction_type: '', currency: '', payment_type: '', year: '', month: '' })}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="table-card">
        <h2>Transaction History</h2>
        <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction type</th>
              <th>Op</th>
              {BALANCE_LEGS.map((leg) => (
                <th key={leg} style={{ textAlign: 'right', minWidth: '6.5rem' }}>
                  {legHeaderLabel(leg)}
                </th>
              ))}
              <th>Related sale</th>
              <th>Related order</th>
              <th>Created by</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={3 + BALANCE_LEGS.length + 4} style={{ textAlign: 'center' }}>
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                  <td>{transaction.transaction_type.replace(/_/g, ' ')}</td>
                  <td>
                    <span
                      style={{
                        color: transaction.operation === 'add' ? '#28a745' : '#dc3545',
                        fontWeight: 600,
                      }}
                    >
                      {transaction.operation === 'add' ? 'Add' : 'Sub'}
                    </span>
                  </td>
                  {BALANCE_LEGS.map((leg) => (
                    <td key={leg} style={{ textAlign: 'right' }}>
                      <LegAmountCell transaction={transaction} leg={leg} />
                    </td>
                  ))}
                  <td>
                    {transaction.related_sale ? `Sale #${transaction.related_sale}` : '—'}
                  </td>
                  <td>
                    {transaction.related_order ? `Order #${transaction.related_order}` : '—'}
                  </td>
                  <td>{transaction.created_by_detail?.username || '—'}</td>
                  <td>{transaction.notes || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
          {transactions.length > 0 && (
            <tfoot>
              <tr
                style={{
                  background: '#f0f3f6',
                  borderTop: '2px solid #ced4da',
                }}
              >
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: '10px 12px' }}>
                  Net (this view)
                </td>
                {BALANCE_LEGS.map((leg) => (
                  <td key={leg} style={{ textAlign: 'right', padding: '10px 12px' }}>
                    <LegTotalCell value={transactionAmountTotals[leg]} leg={leg} />
                  </td>
                ))}
                <td colSpan={4} style={{ fontSize: '0.85em', color: '#666' }}>
                  Sums of signed amounts in each column; matches the filter above.
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
};

export default MoneyBalance;

