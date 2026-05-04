import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import {
  sumAmountsByCurrency,
  formatMultiCurrencyAmounts,
  signedFinanceAmountsByLeg,
  BALANCE_FOUR_LEGS,
  financeRecordLegKey,
} from '../utils/tableTotals';
import './TablePage.css';

const SALE_TYPE_LABELS = {
  bought_from_shop: 'Shop',
  delivery: 'Delivery',
  from_order: 'From order',
  reserved: 'Reserved',
};

/** Pending receivable on a completed sale (e.g. on-credit remainder) — can record follow-up payment. */
function canCollectReceivable(receivable) {
  if (!receivable || receivable.status !== 'pending') return false;
  const sd = receivable.sale_detail;
  return !!(sd && sd.status === 'completed');
}

function receivableDispatchLabel(saleDetail) {
  const d = saleDetail?.dispatch_info;
  if (!d) return '—';
  if (d.dispatch_type === 'bts') {
    return d.dispatcher_name ? `BTS · ${d.dispatcher_name}` : 'BTS';
  }
  if (d.dispatch_type === 'dostavshik') {
    return d.dispatcher_name ? `Dostavshik · ${d.dispatcher_name}` : 'Dostavshik';
  }
  return d.dispatcher_name || d.dispatch_type || '—';
}

function payableCustomerName(p) {
  if (p.order_detail?.customer_detail?.name) return p.order_detail.customer_detail.name;
  if (p.dispatch_detail?.sale_detail?.customer_detail?.name) {
    return p.dispatch_detail.sale_detail.customer_detail.name;
  }
  return '—';
}

function payableKind(p) {
  if (p.order) return { kind: 'Order', ref: `#${p.order}` };
  if (p.dispatch) return { kind: 'Dispatch', ref: `#${p.dispatch} (Sale #${p.dispatch_detail?.sale || '—'})` };
  if (p.package_history) return { kind: 'Package', ref: `History #${p.package_history}` };
  return { kind: '—', ref: '—' };
}

function payableContext(p) {
  if (p.dispatch) {
    const d = p.dispatch_detail;
    if (!d) return '—';
    if (d.dispatch_type === 'bts') {
      return d.dispatcher_detail?.name ? `BTS · ${d.dispatcher_detail.name}` : 'BTS';
    }
    if (d.dispatch_type === 'dostavshik') {
      return d.dispatcher_detail?.name ? `Dostavshik · ${d.dispatcher_detail.name}` : 'Dostavshik';
    }
    return d.dispatcher_detail?.name || d.dispatch_type || '—';
  }
  if (p.order) {
    if (p.order_detail?.order_type === 'on_demand') {
      return 'On-demand (supplier order)';
    }
    if (p.order_detail?.order_type === 'stock') {
      return 'Stock order (inventory)';
    }
  }
  if (p.package_history_detail?.package_detail) {
    const t = p.package_history_detail.package_detail.package_type;
    return t ? `Package type ${t}` : 'Package purchase';
  }
  return '—';
}

function financeLegHeader(leg) {
  if (leg === 'uzs_cash') return 'UZS — Cash';
  if (leg === 'uzs_card') return 'UZS — Card';
  if (leg === 'usd_card') return 'USD — Card';
  if (leg === 'usd_cash') return 'USD — Cash';
  return leg;
}

/** Signed value for the leg that matches this record, or null if not applicable. */
function signedForFinanceRecordLeg(record, leg) {
  if (financeRecordLegKey(record) !== leg) return null;
  const raw = parseFloat(record.amount) || 0;
  if (raw === 0) return 0;
  return record.record_type === 'income' ? raw : -raw;
}

function FinanceLegCell({ record, leg }) {
  const v = signedForFinanceRecordLeg(record, leg);
  if (v === null) {
    return <span style={{ color: '#ced4da' }}>—</span>;
  }
  const isUzs = leg.startsWith('uzs');
  if (v === 0) {
    return <span style={{ color: '#adb5bd' }}>0</span>;
  }
  const color = v > 0 ? '#27ae60' : '#e74c3c';
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

function FinanceLegTotal({ value, leg }) {
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

const Finance = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('records'); // 'records', 'receivables', 'payables', 'profit_loss'
  const [records, setRecords] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [profitLoss, setProfitLoss] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collectTarget, setCollectTarget] = useState(null);
  const [collectForm, setCollectForm] = useState({
    uzs_cash: '',
    uzs_card: '',
    usd_cash: '',
    usd_card: '',
    notes: '',
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    expense_type: 'lunch',
    currency: 'USD',
    payment_type: 'cash',
    amount: '',
    recipient: '',
    notes: '',
  });
  const [workers, setWorkers] = useState([]);
  const [filter, setFilter] = useState({
    type: '',
    status: '',
    expense_type: '',
    currency: '',
    payment_type: '',
    year: '',
    month: '',
  });

  useEffect(() => {
    fetchWorkers(); // Always fetch workers when component mounts or updates
    if (activeTab === 'records') {
      fetchRecords();
    } else if (activeTab === 'receivables') {
      fetchReceivables();
    } else if (activeTab === 'payables') {
      fetchPayables();
    } else if (activeTab === 'profit_loss') {
      fetchProfitLoss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, activeTab]);

  const fetchWorkers = async () => {
    try {
      const response = await api.get('/workers/');
      setWorkers(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching workers:', error);
    }
  };

  const fetchRecords = async () => {
    try {
      let url = '/finance/';
      const params = new URLSearchParams();
      if (filter.type) params.append('type', filter.type);
      if (filter.status) params.append('status', filter.status);
      if (filter.expense_type) params.append('expense_type', filter.expense_type);
      if (filter.currency) params.append('currency', filter.currency);
      if (filter.payment_type) params.append('payment_type', filter.payment_type);
      
      // Convert year/month to date range
      if (filter.year || filter.month) {
        let dateFrom, dateTo;
        if (filter.year && filter.month) {
          // Specific year and month
          dateFrom = `${filter.year}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(parseInt(filter.year), parseInt(filter.month), 0).getDate();
          dateTo = `${filter.year}-${filter.month.padStart(2, '0')}-${lastDay}`;
        } else if (filter.year) {
          // Entire year
          dateFrom = `${filter.year}-01-01`;
          dateTo = `${filter.year}-12-31`;
        } else if (filter.month) {
          // Current year, specific month
          const currentYear = new Date().getFullYear();
          dateFrom = `${currentYear}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(currentYear, parseInt(filter.month), 0).getDate();
          dateTo = `${currentYear}-${filter.month.padStart(2, '0')}-${lastDay}`;
        }
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
      }
      
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      setRecords(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching finance records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReceivables = async () => {
    try {
      let url = '/receivables/';
      const params = new URLSearchParams();
      // By default, backend only returns pending, but allow override
      if (filter.status) params.append('status', filter.status);
      
      // Convert year/month to date range
      if (filter.year || filter.month) {
        let dateFrom, dateTo;
        if (filter.year && filter.month) {
          dateFrom = `${filter.year}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(parseInt(filter.year), parseInt(filter.month), 0).getDate();
          dateTo = `${filter.year}-${filter.month.padStart(2, '0')}-${lastDay}`;
        } else if (filter.year) {
          dateFrom = `${filter.year}-01-01`;
          dateTo = `${filter.year}-12-31`;
        } else if (filter.month) {
          const currentYear = new Date().getFullYear();
          dateFrom = `${currentYear}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(currentYear, parseInt(filter.month), 0).getDate();
          dateTo = `${currentYear}-${filter.month.padStart(2, '0')}-${lastDay}`;
        }
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
      }
      
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      setReceivables(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching receivables:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayables = async () => {
    try {
      let url = '/payables/';
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      
      // Convert year/month to date range
      if (filter.year || filter.month) {
        let dateFrom, dateTo;
        if (filter.year && filter.month) {
          dateFrom = `${filter.year}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(parseInt(filter.year), parseInt(filter.month), 0).getDate();
          dateTo = `${filter.year}-${filter.month.padStart(2, '0')}-${lastDay}`;
        } else if (filter.year) {
          dateFrom = `${filter.year}-01-01`;
          dateTo = `${filter.year}-12-31`;
        } else if (filter.month) {
          const currentYear = new Date().getFullYear();
          dateFrom = `${currentYear}-${filter.month.padStart(2, '0')}-01`;
          const lastDay = new Date(currentYear, parseInt(filter.month), 0).getDate();
          dateTo = `${currentYear}-${filter.month.padStart(2, '0')}-${lastDay}`;
        }
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
      }
      
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      setPayables(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching payables:', error);
    } finally {
      setLoading(false);
    }
  };

  const beginCollectReceivable = (receivable) => {
    setCollectTarget(receivable);
    const ccy = String(receivable.currency || receivable.sale_detail?.sale_currency || 'USD').toUpperCase();
    const rem = parseFloat(receivable.amount) || 0;
    const defUzsCash = ccy === 'UZS' && rem > 0 ? String(Math.round(rem)) : '';
    const defUsdCash = ccy === 'USD' && rem > 0 ? rem.toFixed(2) : '';
    setCollectForm({
      uzs_cash: defUzsCash,
      uzs_card: '',
      usd_cash: defUsdCash,
      usd_card: '',
      notes: '',
    });
  };

  const handleCollectReceivableSubmit = async (e) => {
    e.preventDefault();
    if (!collectTarget) return;
    const ccy = String(collectTarget.currency || collectTarget.sale_detail?.sale_currency || 'USD').toUpperCase();
    const uzs_cash = parseFloat(collectForm.uzs_cash) || 0;
    const uzs_card = parseFloat(collectForm.uzs_card) || 0;
    const usd_cash = parseFloat(collectForm.usd_cash) || 0;
    const usd_card = parseFloat(collectForm.usd_card) || 0;
    const rem = parseFloat(collectTarget.amount) || 0;
    const tol = 0.02;

    let paySum;
    if (ccy === 'USD') {
      if (uzs_cash > 0 || uzs_card > 0) {
        alert('This receivable is in USD — use USD cash/card fields only.');
        return;
      }
      paySum = usd_cash + usd_card;
    } else {
      if (usd_cash > 0 || usd_card > 0) {
        alert('This receivable is in UZS — use UZS cash/card fields only.');
        return;
      }
      paySum = uzs_cash + uzs_card;
    }

    if (paySum <= 0) {
      alert('Enter the amount collected (greater than zero).');
      return;
    }
    if (paySum > rem + tol) {
      alert(
        `Collected amount cannot exceed remaining balance (${rem.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${ccy}).`,
      );
      return;
    }

    try {
      const res = await api.post(`/receivables/${collectTarget.id}/collect_payment/`, {
        uzs_cash,
        uzs_card,
        usd_cash,
        usd_card,
        notes: String(collectForm.notes || '').trim(),
      });
      alert(res.data?.message || 'Payment recorded.');
      setCollectTarget(null);
      setCollectForm({
        uzs_cash: '',
        uzs_card: '',
        usd_cash: '',
        usd_card: '',
        notes: '',
      });
      await fetchReceivables();
      await fetchRecords();
    } catch (error) {
      console.error('Error collecting receivable:', error);
      const d = error.response?.data;
      const msg =
        d?.detail ||
        d?.error ||
        (typeof d?.detail === 'string' ? d.detail : null) ||
        (Array.isArray(d) ? d[0] : null) ||
        (typeof d === 'object' && d !== null
          ? Object.entries(d)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : String(v)}`)
              .join(' ')
          : null) ||
        'Error recording payment';
      alert(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  const fetchProfitLoss = async () => {
    setLoading(true);
    try {
      let url = '/finance/profit_loss/';
      const params = new URLSearchParams();
      
      // Convert year/month to date range
      if (filter.year || filter.month) {
        if (filter.year && filter.month) {
          params.append('year', filter.year);
          params.append('month', filter.month);
        } else if (filter.year) {
          params.append('year', filter.year);
        } else if (filter.month) {
          const currentYear = new Date().getFullYear();
          params.append('year', currentYear);
          params.append('month', filter.month);
        }
      }
      
      if (params.toString()) url += `?${params.toString()}`;

      const response = await api.get(url);
      setProfitLoss(response.data);
    } catch (error) {
      console.error('Error fetching profit/loss:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (
      expenseFormData.expense_type === 'other' &&
      !String(expenseFormData.notes || '').trim()
    ) {
      alert('Please enter notes when expense type is Other.');
      return;
    }
    try {
      const payload = {
        record_type: 'expense',
        expense_type: expenseFormData.expense_type,
        amount: expenseFormData.amount || 0,
        currency: expenseFormData.currency,
        payment_type: expenseFormData.payment_type,
        recipient: expenseFormData.recipient || null,
        notes: String(expenseFormData.notes || '').trim(),
        status: 'completed',
      };

      await api.post('/finance/', payload);
      setShowExpenseForm(false);
      setExpenseFormData({
        expense_type: 'lunch',
        currency: 'USD',
        payment_type: 'cash',
        amount: '',
        recipient: '',
        notes: '',
      });
      fetchRecords();
      fetchWorkers(); // Refresh workers list after creating expense
    } catch (error) {
      console.error('Error creating expense:', error);
      // Handle validation errors from DRF
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.non_field_errors?.[0] ||
                          (Array.isArray(error.response?.data) ? error.response.data[0] : null) ||
                          'Error creating expense';
      alert(errorMessage);
    }
  };

  /* Footer totals: completed only, four-way legs; rows with no payment/currency leg show — and are excluded from these sums. */
  const recordSignedLegTotals = useMemo(
    () => signedFinanceAmountsByLeg(records, { status: 'completed' }),
    [records]
  );
  const receivableAmountTotals = useMemo(
    () => sumAmountsByCurrency(receivables),
    [receivables]
  );
  const payableAmountTotals = useMemo(
    () => sumAmountsByCurrency(payables),
    [payables]
  );
  const receivablePendingByCurrency = useMemo(
    () => sumAmountsByCurrency(receivables.filter((r) => r.status === 'pending')),
    [receivables]
  );
  const payablePendingByCurrency = useMemo(
    () => sumAmountsByCurrency(payables.filter((p) => p.status === 'pending')),
    [payables]
  );

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  // Calculate statistics separately for USD and UZS
  const totalIncomeUSD = records
    .filter((r) => r.record_type === 'income' && r.status === 'completed' && r.currency === 'USD')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const totalIncomeUZS = records
    .filter((r) => r.record_type === 'income' && r.status === 'completed' && r.currency === 'UZS')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const totalExpenseUSD = records
    .filter((r) => r.record_type === 'expense' && r.status === 'completed' && r.currency === 'USD')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const totalExpenseUZS = records
    .filter((r) => r.record_type === 'expense' && r.status === 'completed' && r.currency === 'UZS')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const netProfitUSD = totalIncomeUSD - totalExpenseUSD;
  const netProfitUZS = totalIncomeUZS - totalExpenseUZS;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Finance</h1>
        {isAdmin && activeTab === 'records' && (
          <button className="btn-primary" onClick={() => setShowExpenseForm(!showExpenseForm)}>
            {showExpenseForm ? 'Cancel' : '+ Add Expense'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e0e0e0' }}>
        <button
          onClick={() => setActiveTab('records')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'records' ? '#007bff' : 'transparent',
            color: activeTab === 'records' ? 'white' : '#666',
            cursor: 'pointer',
            borderBottom: activeTab === 'records' ? '3px solid #007bff' : '3px solid transparent',
            fontWeight: activeTab === 'records' ? '600' : '400',
          }}
        >
          Financial Records
        </button>
        <button
          onClick={() => setActiveTab('receivables')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'receivables' ? '#28a745' : 'transparent',
            color: activeTab === 'receivables' ? 'white' : '#666',
            cursor: 'pointer',
            borderBottom: activeTab === 'receivables' ? '3px solid #28a745' : '3px solid transparent',
            fontWeight: activeTab === 'receivables' ? '600' : '400',
          }}
        >
          Receivables
        </button>
        <button
          onClick={() => setActiveTab('payables')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'payables' ? '#dc3545' : 'transparent',
            color: activeTab === 'payables' ? 'white' : '#666',
            cursor: 'pointer',
            borderBottom: activeTab === 'payables' ? '3px solid #dc3545' : '3px solid transparent',
            fontWeight: activeTab === 'payables' ? '600' : '400',
          }}
        >
          Payables
        </button>
        <button
          onClick={() => setActiveTab('profit_loss')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'profit_loss' ? '#ff9800' : 'transparent',
            color: activeTab === 'profit_loss' ? 'white' : '#666',
            cursor: 'pointer',
            borderBottom: activeTab === 'profit_loss' ? '3px solid #ff9800' : '3px solid transparent',
            fontWeight: activeTab === 'profit_loss' ? '600' : '400',
          }}
        >
          Profit/Loss
        </button>
      </div>

      {showExpenseForm && isAdmin && activeTab === 'records' && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Add New Expense</h2>
          <form onSubmit={handleExpenseSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Expense Type</label>
                <select
                  value={expenseFormData.expense_type}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, expense_type: e.target.value })}
                  required
                >
                  <option value="salary">Salary</option>
                  <option value="lunch">Lunch</option>
                  <option value="taxi">Taxi</option>
                  <option value="office_supplies">Office Supplies</option>
                  <option value="utilities">Utilities</option>
                  <option value="rent">Rent</option>
                  <option value="delivery">Delivery</option>
                  <option value="cargo">Cargo</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={expenseFormData.currency}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, currency: e.target.value })}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Payment Type</label>
                <select
                  value={expenseFormData.payment_type}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, payment_type: e.target.value })}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseFormData.amount}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: e.target.value })}
                  required
                />
              </div>
              {(expenseFormData.expense_type === 'salary' || expenseFormData.expense_type === 'lunch') && (
                <div className="form-group">
                  <label>Recipient *</label>
                  <select
                    value={expenseFormData.recipient}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, recipient: e.target.value })}
                    required
                  >
                    <option value="">Select recipient</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.name} {worker.telephone ? `(${worker.telephone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes{expenseFormData.expense_type === 'other' ? ' *' : ''}</label>
                <textarea
                  value={expenseFormData.notes}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                  rows="2"
                  required={expenseFormData.expense_type === 'other'}
                  placeholder={
                    expenseFormData.expense_type === 'salary'
                      ? 'e.g., Prepayment, Monthly salary, etc.'
                      : expenseFormData.expense_type === 'other'
                        ? 'Describe this expense'
                        : 'Optional unless type is Other'
                  }
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Add Expense
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary Cards - Only for Records tab */}
      {activeTab === 'records' && (
        <div className="metrics-grid" style={{ marginBottom: '20px' }}>
          <div className="metric-card">
            <div className="metric-label">Total Income (USD)</div>
            <div className="metric-value" style={{ color: '#27ae60' }}>
              {totalIncomeUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Income (UZS)</div>
            <div className="metric-value" style={{ color: '#27ae60' }}>
              {totalIncomeUZS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UZS
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Expenses (USD)</div>
            <div className="metric-value" style={{ color: '#e74c3c' }}>
              {totalExpenseUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Expenses (UZS)</div>
            <div className="metric-value" style={{ color: '#e74c3c' }}>
              {totalExpenseUZS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UZS
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Net Profit (USD)</div>
            <div className="metric-value" style={{ color: netProfitUSD >= 0 ? '#27ae60' : '#e74c3c' }}>
              {netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Net Profit (UZS)</div>
            <div className="metric-value" style={{ color: netProfitUZS >= 0 ? '#27ae60' : '#e74c3c' }}>
              {netProfitUZS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UZS
            </div>
          </div>
        </div>
      )}

      {/* Receivables Summary (by currency; do not mix UZS and USD in one number) */}
      {activeTab === 'receivables' && (
        <div className="metrics-grid" style={{ marginBottom: '20px' }}>
          <div className="metric-card" style={{ border: '2px solid #28a745' }}>
            <div className="metric-label">Receivables — Pending (USD)</div>
            <div className="metric-value" style={{ color: '#28a745', fontSize: '1.75em' }}>
              {(receivablePendingByCurrency.USD || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USD
            </div>
          </div>
          <div className="metric-card" style={{ border: '2px solid #28a745' }}>
            <div className="metric-label">Receivables — Pending (UZS)</div>
            <div className="metric-value" style={{ color: '#28a745', fontSize: '1.75em' }}>
              {(receivablePendingByCurrency.UZS || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              UZS
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Receivables — All (USD)</div>
            <div className="metric-value">
              {(receivableAmountTotals.USD || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USD
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Receivables — All (UZS)</div>
            <div className="metric-value">
              {(receivableAmountTotals.UZS || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              UZS
            </div>
          </div>
        </div>
      )}

      {/* Payables Summary (by currency) */}
      {activeTab === 'payables' && (
        <div className="metrics-grid" style={{ marginBottom: '20px' }}>
          <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
            <div className="metric-label">Payables — Pending (USD)</div>
            <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.75em' }}>
              {(payablePendingByCurrency.USD || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USD
            </div>
          </div>
          <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
            <div className="metric-label">Payables — Pending (UZS)</div>
            <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.75em' }}>
              {(payablePendingByCurrency.UZS || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              UZS
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Payables — All (USD)</div>
            <div className="metric-value">
              {(payableAmountTotals.USD || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USD
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Payables — All (UZS)</div>
            <div className="metric-value">
              {(payableAmountTotals.UZS || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              UZS
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {!showExpenseForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title" style={{ marginBottom: '8px' }}>Filters</h3>
          <div className="filter-toolbar">
          {activeTab === 'records' && (
            <>
              <div className="filter-field">
                <label>Type</label>
                <select
                  value={filter.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setFilter({ 
                      ...filter, 
                      type: newType,
                      expense_type: newType === 'expense' ? filter.expense_type : ''
                    });
                  }}
                >
                  <option value="">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              {(filter.type === 'expense' || filter.type === '') && (
                <div className="filter-field">
                  <label>Expense Type</label>
                  <select
                    value={filter.expense_type}
                    onChange={(e) => setFilter({ ...filter, expense_type: e.target.value })}
                  >
                    <option value="">All Expense Types</option>
                    <option value="salary">Salary</option>
                    <option value="lunch">Lunch</option>
                    <option value="taxi">Taxi</option>
                    <option value="delivery">Delivery</option>
                    <option value="cargo">Cargo</option>
                    <option value="office_supplies">Office Supplies</option>
                    <option value="utilities">Utilities</option>
                    <option value="rent">Rent</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
            </>
          )}
          {(activeTab === 'receivables' || activeTab === 'payables') && (
            <div className="filter-field">
              <label>Status</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          {activeTab === 'records' && (
            <div className="filter-field">
              <label>Status</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
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
              onClick={() => setFilter({ type: '', status: '', expense_type: '', currency: '', payment_type: '', year: '', month: '' })}
            >
              Clear all
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Financial Records Table */}
      {activeTab === 'records' && (
        <div className="table-card">
          <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Expense Type</th>
                {BALANCE_FOUR_LEGS.map((leg) => (
                  <th key={leg}>{financeLegHeader(leg)}</th>
                ))}
                <th>Status</th>
                <th>Related Order</th>
                <th>Related Sale</th>
                <th>Related Dispatch</th>
                <th>Recipient</th>
                <th>Notes</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center' }}>
                    No finance records found
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>#{record.id}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          record.record_type === 'income' ? 'confirmed' : 'pending'
                        }`}
                      >
                        {record.record_type}
                      </span>
                    </td>
                    <td>
                      {record.expense_type ? record.expense_type.replace('_', ' ') : '-'}
                    </td>
                    {BALANCE_FOUR_LEGS.map((leg) => (
                      <td key={leg}>
                        <FinanceLegCell record={record} leg={leg} />
                      </td>
                    ))}
                    <td>
                      <span className={`status-badge ${record.status}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>
                      {record.order ? `Order #${record.order}` : '-'}
                    </td>
                    <td>
                      {record.sale ? `Sale #${record.sale}` : '-'}
                    </td>
                    <td>
                      {record.dispatch ? `Dispatch #${record.dispatch}` : '-'}
                    </td>
                    <td>
                      {record.recipient_detail ? (
                        `${record.recipient_detail.username}${record.recipient_detail.first_name || record.recipient_detail.last_name ? ` (${record.recipient_detail.first_name} ${record.recipient_detail.last_name})`.trim() : ''}`
                      ) : '-'}
                    </td>
                    <td style={{ fontSize: '0.9em', maxWidth: '240px' }}>
                      {(() => {
                        const idLabel = `Record #${record.id}`;
                        const text = record.notes && String(record.notes).trim() ? String(record.notes).trim() : '';
                        const full = text ? `${idLabel} — ${text}` : idLabel;
                        return (
                          <span title={full}>
                            {full.length > 58 ? `${full.slice(0, 58)}…` : full}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{new Date(record.transaction_date).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" style={{ textAlign: 'right' }}>
                  Net (completed)
                </td>
                {BALANCE_FOUR_LEGS.map((leg) => (
                  <td key={leg}>
                    {records.length > 0 ? (
                      <FinanceLegTotal value={recordSignedLegTotals[leg] || 0} leg={leg} />
                    ) : (
                      <span style={{ color: '#adb5bd' }}>—</span>
                    )}
                  </td>
                ))}
                <td
                  colSpan="7"
                  style={{ fontSize: '0.85em', color: '#666', textAlign: 'right' }}
                >
                  {records.length > 0
                    ? 'Net (completed) per leg: only rows with currency and cash or card. Same sign as Type (income +, expense −). If cash and card were both used on one receipt, Notes show the split; Money Balance sums each bucket accurately.'
                    : ' '}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {/* Receivables Table */}
      {activeTab === 'receivables' && (
        <>
          {collectTarget && (
            <div className="form-card" style={{ marginBottom: '20px' }}>
              <h2>
                Collect payment — receivable #{collectTarget.id}{' '}
                <small style={{ color: '#555', fontWeight: 400 }}>(Sale #{collectTarget.sale})</small>
              </h2>
              <p style={{ color: '#666', marginBottom: '12px', fontSize: '0.92rem' }}>
                Enter what the customer paid now toward this open balance. Remaining{' '}
                <strong>{parseFloat(collectTarget.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                {(collectTarget.currency || collectTarget.sale_detail?.sale_currency || 'USD').toUpperCase()}</strong>
                {' — '}you can collect in partial payments until the balance is cleared.
              </p>
              <form onSubmit={handleCollectReceivableSubmit}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>UZS — Cash</label>
                    <input type="number" step="0.01" min="0" placeholder="0" value={collectForm.uzs_cash} onChange={(e) => setCollectForm({ ...collectForm, uzs_cash: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>UZS — Card</label>
                    <input type="number" step="0.01" min="0" placeholder="0" value={collectForm.uzs_card} onChange={(e) => setCollectForm({ ...collectForm, uzs_card: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>USD — Cash</label>
                    <input type="number" step="0.01" min="0" placeholder="0" value={collectForm.usd_cash} onChange={(e) => setCollectForm({ ...collectForm, usd_cash: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>USD — Card</label>
                    <input type="number" step="0.01" min="0" placeholder="0" value={collectForm.usd_card} onChange={(e) => setCollectForm({ ...collectForm, usd_card: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes (optional)</label>
                    <textarea rows={2} value={collectForm.notes} onChange={(e) => setCollectForm({ ...collectForm, notes: e.target.value })} />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary">Record collection</button>
                  <button
                    type="button"
                    className="btn-edit"
                    onClick={() => {
                      setCollectTarget(null);
                      setCollectForm({
                        uzs_cash: '',
                        uzs_card: '',
                        usd_cash: '',
                        usd_card: '',
                        notes: '',
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
          <h2>Accounts Receivable</h2>
          <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Sale</th>
                <th>Product</th>
                <th>Sale type</th>
                <th>From order</th>
                <th>Delivery (BTS / Dostavshik)</th>
                <th>Amount</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Created</th>
                <th>Paid date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {receivables.length === 0 ? (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center' }}>
                    No receivables found
                  </td>
                </tr>
              ) : (
                receivables.map((receivable) => {
                  const sd = receivable.sale_detail;
                  return (
                    <tr key={receivable.id}>
                      <td>#{receivable.id}</td>
                      <td>{sd?.customer_detail?.name || '—'}</td>
                      <td>#{receivable.sale}</td>
                      <td>
                        {sd?.product_detail
                          ? `${sd.product_detail.brand} ${sd.product_detail.model}`
                          : '—'}
                      </td>
                      <td>
                        {sd?.sale_type ? (SALE_TYPE_LABELS[sd.sale_type] || sd.sale_type) : '—'}
                      </td>
                      <td>
                        {sd?.order ? (
                          <span>Order #{sd.order}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        style={{ fontSize: '0.9rem', maxWidth: '200px' }}
                        title={sd?.dispatch_info?.logistics_notes || undefined}
                      >
                        {receivableDispatchLabel(sd)}
                      </td>
                      <td style={{ fontWeight: '600', color: '#28a745' }}>
                        {parseFloat(receivable.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>{receivable.currency || 'USD'}</td>
                      <td>
                        <span className={`status-badge ${receivable.status}`}>
                          {receivable.status}
                        </span>
                      </td>
                      <td>{new Date(receivable.created_at).toLocaleString()}</td>
                      <td>
                        {receivable.paid_date
                          ? new Date(receivable.paid_date).toLocaleString()
                          : '—'}
                      </td>
                      <td>
                        {canCollectReceivable(receivable) ? (
                          <button
                            type="button"
                            className="btn-edit"
                            onClick={() => beginCollectReceivable(receivable)}
                          >
                            Collect
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="7" style={{ textAlign: 'right' }}>
                  Total
                </td>
                <td style={{ fontWeight: 600, color: '#28a745' }}>
                  {formatMultiCurrencyAmounts(receivableAmountTotals)}
                </td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
          </div>
          </div>
        </>
      )}

      {/* Payables Table */}
      {activeTab === 'payables' && (
        <div className="table-card">
          <h2>Accounts Payable</h2>
          <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Payable type</th>
                <th>Ref</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Context</th>
                <th>Amount</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Created</th>
                <th>Paid date</th>
              </tr>
            </thead>
            <tbody>
              {payables.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center' }}>
                    No payables found
                  </td>
                </tr>
              ) : (
                payables.map((payable) => {
                  const { kind, ref } = payableKind(payable);
                  return (
                    <tr key={payable.id}>
                      <td>#{payable.id}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{ background: '#6c757d', fontSize: '0.75rem' }}
                        >
                          {kind}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.9rem' }}>{ref}</td>
                      <td>{payableCustomerName(payable)}</td>
                      <td>
                        {payable.order_detail?.product_detail
                          ? `${payable.order_detail.product_detail.brand} ${payable.order_detail.product_detail.model}`
                          : payable.dispatch_detail?.sale_detail?.product_detail
                            ? `${payable.dispatch_detail.sale_detail.product_detail.brand} ${payable.dispatch_detail.sale_detail.product_detail.model}`
                            : payable.package_history_detail?.package_detail
                              ? `Packages · type ${payable.package_history_detail.package_detail.package_type}`
                              : '—'}
                      </td>
                      <td style={{ fontSize: '0.9rem', maxWidth: '220px' }}>{payableContext(payable)}</td>
                      <td style={{ fontWeight: '600', color: '#dc3545' }}>
                        {parseFloat(payable.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>{payable.currency || 'USD'}</td>
                      <td>
                        <span className={`status-badge ${payable.status}`}>
                          {payable.status}
                        </span>
                      </td>
                      <td>{new Date(payable.created_at).toLocaleString()}</td>
                      <td>
                        {payable.paid_date
                          ? new Date(payable.paid_date).toLocaleString()
                          : '—'}
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
                <td style={{ fontWeight: 600, color: '#dc3545' }}>
                  {formatMultiCurrencyAmounts(payableAmountTotals)}
                </td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {activeTab === 'profit_loss' && (
        <div>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            Amounts stay in their original currency. Net profit is shown separately for USD and for UZS — they are not added together.
          </p>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
          ) : profitLoss ? (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '20px' }}>
                <div className="metric-card" style={{ border: '2px solid #28a745' }}>
                  <div className="metric-label">Total income (USD)</div>
                  <div className="metric-value" style={{ color: '#28a745', fontSize: '1.6em' }}>
                    ${(profitLoss.totals.total_income_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="metric-card" style={{ border: '2px solid #28a745' }}>
                  <div className="metric-label">Total income (UZS)</div>
                  <div className="metric-value" style={{ color: '#28a745', fontSize: '1.6em' }}>
                    {(profitLoss.totals.total_income_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
                  </div>
                </div>
                <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
                  <div className="metric-label">Total COGS (USD)</div>
                  <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.6em' }}>
                    ${(profitLoss.totals.total_cogs_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
                  <div className="metric-label">Total COGS (UZS)</div>
                  <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.6em' }}>
                    {(profitLoss.totals.total_cogs_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
                  </div>
                </div>
                <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
                  <div className="metric-label">Operating expenses (USD)</div>
                  <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.6em' }}>
                    ${(profitLoss.totals.total_operating_expenses_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
                  <div className="metric-label">Operating expenses (UZS)</div>
                  <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.6em' }}>
                    {(profitLoss.totals.total_operating_expenses_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
                  </div>
                </div>
                <div className="metric-card" style={{ border: `2px solid ${(profitLoss.totals.net_profit_usd || 0) >= 0 ? '#28a745' : '#dc3545'}` }}>
                  <div className="metric-label">Net profit (USD)</div>
                  <div className="metric-value" style={{ color: (profitLoss.totals.net_profit_usd || 0) >= 0 ? '#28a745' : '#dc3545', fontSize: '1.6em' }}>
                    ${(profitLoss.totals.net_profit_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="metric-card" style={{ border: `2px solid ${(profitLoss.totals.net_profit_uzs || 0) >= 0 ? '#28a745' : '#dc3545'}` }}>
                  <div className="metric-label">Net profit (UZS)</div>
                  <div className="metric-value" style={{ color: (profitLoss.totals.net_profit_uzs || 0) >= 0 ? '#28a745' : '#dc3545', fontSize: '1.6em' }}>
                    {(profitLoss.totals.net_profit_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
                  </div>
                </div>
              </div>

              <div className="table-card" style={{ marginBottom: '20px' }}>
                <h3>Sales (by currency — no conversion)</h3>
                <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sale ID</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Income USD</th>
                      <th>Income UZS</th>
                      <th>COGS USD</th>
                      <th>COGS UZS</th>
                      <th>Profit USD</th>
                      <th>Profit UZS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitLoss.sales.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center' }}>No sales completed in this period</td>
                      </tr>
                    ) : (
                      profitLoss.sales.map((item, idx) => (
                        <tr key={idx}>
                          <td>#{item.sale_id}</td>
                          <td>{item.product}</td>
                          <td>{item.quantity}</td>
                          <td>${item.income_usd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>{(item.income_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td>${item.total_cogs_usd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>{(item.total_cogs_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td style={{ color: item.profit_usd >= 0 ? '#28a745' : '#dc3545', fontWeight: '600' }}>
                            ${item.profit_usd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ color: item.profit_uzs >= 0 ? '#28a745' : '#dc3545', fontWeight: '600' }}>
                            {(item.profit_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                      <td colSpan="3">Totals</td>
                      <td>${(profitLoss.totals.total_income_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{(profitLoss.totals.total_income_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>${(profitLoss.totals.total_cogs_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{(profitLoss.totals.total_cogs_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td style={{ color: profitLoss.totals.net_profit_usd >= 0 ? '#28a745' : '#dc3545' }}>
                        ${(profitLoss.totals.net_profit_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: profitLoss.totals.net_profit_uzs >= 0 ? '#28a745' : '#dc3545' }}>
                        {(profitLoss.totals.net_profit_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>

              <div className="table-card">
                <h3>Operating expenses</h3>
                <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount (USD)</th>
                      <th>Amount (UZS)</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitLoss.operating_expenses.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center' }}>No operating expenses in this period</td>
                      </tr>
                    ) : (
                      profitLoss.operating_expenses.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.type}</td>
                          <td>${(item.amount_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>{(item.amount_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td>{item.date}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                      <td>Total operating</td>
                      <td>${(profitLoss.totals.total_operating_expenses_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{(profitLoss.totals.total_operating_expenses_uzs || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>—</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px' }}>No data available</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Finance;
