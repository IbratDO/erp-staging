import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

/** Table columns: one per currency (legacy *_cash and *_card ledger buckets roll up here). */
const CURRENCY_COLS = [
  {
    key: 'usd',
    label: 'USD',
    isUzs: false,
    matchBalanceType: (bt) => bt === 'usd_cash' || bt === 'usd_card',
    sumBalances: (rows) =>
      rows
        .filter((b) => b.balance_type === 'usd_cash' || b.balance_type === 'usd_card')
        .reduce((s, b) => s + (parseFloat(b.balance) || 0), 0),
  },
  {
    key: 'uzs',
    label: 'UZS',
    isUzs: true,
    matchBalanceType: (bt) => bt === 'uzs_cash' || bt === 'uzs_card',
    sumBalances: (rows) =>
      rows
        .filter((b) => b.balance_type === 'uzs_cash' || b.balance_type === 'uzs_card')
        .reduce((s, b) => s + (parseFloat(b.balance) || 0), 0),
  },
];

function signedForCurrencyColumn(t, col) {
  const bt = t.balance_detail?.balance_type;
  if (!bt || !col.matchBalanceType(bt)) return null;
  const raw = parseFloat(t.amount) || 0;
  if (raw === 0) return 0;
  return t.operation === 'add' ? raw : -raw;
}

function CurrencyAmountCell({ transaction, col }) {
  const v = signedForCurrencyColumn(transaction, col);
  if (v === null) {
    return <span style={{ color: '#ced4da' }}>—</span>;
  }
  if (v === 0) {
    return <span style={{ color: '#adb5bd' }}>0</span>;
  }
  const color = v > 0 ? '#28a745' : '#dc3545';
  if (col.isUzs) {
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

function CurrencyTotalCell({ value, col }) {
  if (value === 0) {
    return <span style={{ color: '#adb5bd' }}>0</span>;
  }
  const color = value > 0 ? '#1e5f2a' : '#a71d2a';
  if (col.isUzs) {
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

const MONEY_BALANCE_TX_SORT_ACCESSORS = (() => {
  const o = {
    timestamp: (t) => new Date(t.timestamp).getTime() || 0,
    transaction_type: (t) => String(t.transaction_type ?? '').toLowerCase(),
    bucket: (t) => String(t.balance_detail?.balance_type ?? '').toLowerCase(),
    operation: (t) => String(t.operation ?? '').toLowerCase(),
    related_sale: (t) => Number(t.related_sale) || 0,
    related_order: (t) => Number(t.related_order) || 0,
    created_by: (t) => String(t.created_by_detail?.username ?? '').toLowerCase(),
    notes: (t) => String(t.notes ?? '').toLowerCase(),
  };
  for (const col of CURRENCY_COLS) {
    o[`amt_${col.key}`] = (t) => {
      const v = signedForCurrencyColumn(t, col);
      return v === null ? -Number.MAX_VALUE : v;
    };
  }
  return o;
})();

/** Build API date_from / date_to from year / month / day filters. */
function buildTransactionDateRange({ year, month, day }) {
  if (!year && !month && !day) return null;

  const yNum = year ? parseInt(year, 10) : new Date().getFullYear();
  const y = String(yNum);

  if (day) {
    const mNum = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const mm = String(mNum).padStart(2, '0');
    const lastDay = new Date(yNum, mNum, 0).getDate();
    const d = Math.min(parseInt(day, 10) || 1, lastDay);
    const dd = String(d).padStart(2, '0');
    const date = `${y}-${mm}-${dd}`;
    return { dateFrom: date, dateTo: date };
  }

  if (year && month) {
    const mNum = parseInt(month, 10);
    const mm = String(mNum).padStart(2, '0');
    const lastDay = new Date(yNum, mNum, 0).getDate();
    return {
      dateFrom: `${y}-${mm}-01`,
      dateTo: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  if (year) {
    return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
  }

  if (month) {
    const mNum = parseInt(month, 10);
    const mm = String(mNum).padStart(2, '0');
    const lastDay = new Date(yNum, mNum, 0).getDate();
    return {
      dateFrom: `${y}-${mm}-01`,
      dateTo: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  return null;
}

const MoneyBalance = () => {
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('cash.adjust');
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
    year: '',
    month: '',
    day: '',
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

      /** Option A: new money uses *_cash buckets; card rows are legacy-only — do not auto-create all four. */
      const balanceTypes = ['usd_cash', 'uzs_cash'];
      const existingTypes = balancesList.map((b) => b.balance_type);

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

      const updatedResponse = await api.get('/cash-balance/');
      setBalances(updatedResponse.data.results || updatedResponse.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
  };

  const transactionAmountTotals = useMemo(() => {
    const out = Object.fromEntries(CURRENCY_COLS.map((c) => [c.key, 0]));
    for (const t of transactions) {
      const bt = t.balance_detail?.balance_type;
      for (const col of CURRENCY_COLS) {
        if (!col.matchBalanceType(bt)) continue;
        const amt = parseFloat(t.amount) || 0;
        const signed = t.operation === 'add' ? amt : -amt;
        out[col.key] += signed;
      }
    }
    return out;
  }, [transactions]);

  const fetchTransactions = async () => {
    try {
      let url = '/balance-transactions/';
      const params = new URLSearchParams();
      if (filter.balance_type) params.append('balance_type', filter.balance_type);
      if (filter.transaction_type) params.append('transaction_type', filter.transaction_type);
      const dateRange = buildTransactionDateRange(filter);
      if (dateRange?.dateFrom) params.append('date_from', dateRange.dateFrom);
      if (dateRange?.dateTo) params.append('date_to', dateRange.dateTo);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      let list = response.data.results || response.data;

      if (filter.currency && !filter.balance_type) {
        const curCol = CURRENCY_COLS.find((c) => c.label === filter.currency);
        list = curCol ? list.filter((tx) => curCol.matchBalanceType(tx.balance_detail?.balance_type)) : list;
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
      const balance = balances.find((b) => b.balance_type === adjustFormData.balance_type);
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

      await Promise.all([fetchBalances(), fetchTransactions()]);
    } catch (error) {
      console.error('Error adjusting balance:', error);
      alert(error.response?.data?.error || 'Error adjusting balance');
    }
  };

  const mbSort = useClientTableSort(MONEY_BALANCE_TX_SORT_ACCESSORS);
  const displayTransactions = useMemo(
    () => mbSort.sortRows(transactions),
    [transactions, mbSort]
  );

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

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

      <div className="metrics-grid" style={{ marginBottom: '30px' }}>
        {CURRENCY_COLS.map((col) => (
          <div
            key={col.key}
            className="metric-card"
            style={{
              backgroundColor: '#f8f9fa',
              border: `2px solid ${col.key === 'usd' ? '#28a745' : '#20c997'}`,
            }}
          >
            <div className="metric-label">{col.label} (total)</div>
            <div
              className="metric-value"
              style={{ color: col.key === 'usd' ? '#28a745' : '#20c997', fontSize: '2em' }}
            >
              {col.isUzs
                ? `${col.sumBalances(balances).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
                : `$${col.sumBalances(balances).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </div>
          </div>
        ))}
      </div>

      {showAdjustForm && isAdmin && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Adjust Balance</h2>
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '12px' }}>
            New entries post to the cash ledger bucket for that currency (card buckets are legacy-only).
          </p>
          <form onSubmit={handleAdjust}>
            <div className="form-grid">
              <div className="form-group">
                <label>Balance</label>
                <select
                  value={adjustFormData.balance_type}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, balance_type: e.target.value })}
                  required
                >
                  <option value="usd_cash">USD</option>
                  <option value="uzs_cash">UZS</option>
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

      <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
        <h3 className="filter-card__title">Filters</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>Ledger bucket</label>
            <select
              value={filter.balance_type}
              onChange={(e) => setFilter({ ...filter, balance_type: e.target.value })}
            >
              <option value="">All buckets</option>
              <option value="usd_cash">USD (cash)</option>
              <option value="uzs_cash">UZS (cash)</option>
              <option value="usd_card">USD (legacy card)</option>
              <option value="uzs_card">UZS (legacy card)</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Currency (view)</label>
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
              <option value="">All</option>
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Transaction type</label>
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
          <div className="filter-field">
            <label>Day</label>
            <select
              value={filter.day}
              onChange={(e) => setFilter({ ...filter, day: e.target.value })}
            >
              <option value="">All Days</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-toolbar__actions">
            <button
              type="button"
              className="btn-edit"
              onClick={() =>
                setFilter({
                  balance_type: '',
                  transaction_type: '',
                  currency: '',
                  year: '',
                  month: '',
                  day: '',
                })
              }
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      <div className="table-card">
        <h2>Transaction History</h2>
        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="timestamp" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Date
                </SortableTh>
                <SortableTh columnId="transaction_type" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Transaction type
                </SortableTh>
                <SortableTh columnId="bucket" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Bucket
                </SortableTh>
                <SortableTh columnId="operation" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Op
                </SortableTh>
                {CURRENCY_COLS.map((col) => (
                  <SortableTh
                    key={col.key}
                    columnId={`amt_${col.key}`}
                    sortCol={mbSort.sortCol}
                    sortDir={mbSort.sortDir}
                    onSort={mbSort.onHeaderClick}
                    align="right"
                    style={{ minWidth: '6.5rem' }}
                  >
                    {col.label}
                  </SortableTh>
                ))}
                <SortableTh columnId="related_sale" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Related sale
                </SortableTh>
                <SortableTh columnId="related_order" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Related order
                </SortableTh>
                <SortableTh columnId="created_by" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Created by
                </SortableTh>
                <SortableTh columnId="notes" sortCol={mbSort.sortCol} sortDir={mbSort.sortDir} onSort={mbSort.onHeaderClick}>
                  Notes
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={4 + CURRENCY_COLS.length + 4} style={{ textAlign: 'center' }}>
                    No transactions found
                  </td>
                </tr>
              ) : (
                displayTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                    <td>{transaction.transaction_type.replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: '0.85em', color: '#555' }}>
                      {transaction.balance_detail?.balance_type?.replace(/_/g, ' ') || '—'}
                    </td>
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
                    {CURRENCY_COLS.map((col) => (
                      <td key={col.key} style={{ textAlign: 'right' }}>
                        <CurrencyAmountCell transaction={transaction} col={col} />
                      </td>
                    ))}
                    <td>{transaction.related_sale ? `Sale #${transaction.related_sale}` : '—'}</td>
                    <td>{transaction.related_order ? `Order #${transaction.related_order}` : '—'}</td>
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
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, padding: '10px 12px' }}>
                    Net (this view)
                  </td>
                  {CURRENCY_COLS.map((col) => (
                    <td key={col.key} style={{ textAlign: 'right', padding: '10px 12px' }}>
                      <CurrencyTotalCell value={transactionAmountTotals[col.key]} col={col} />
                    </td>
                  ))}
                  <td colSpan={4} style={{ fontSize: '0.85em', color: '#666' }}>
                    Amounts roll up by currency; bucket column shows the underlying ledger row.
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
