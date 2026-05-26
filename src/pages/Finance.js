import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import {
  signedFinanceAmountsByLeg,
  BALANCE_TABLE_LEGS,
  financeRecordLegKey,
} from '../utils/tableTotals';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';

function financeLegHeader(leg) {
  if (leg === 'uzs_cash') return 'UZS';
  if (leg === 'usd_cash') return 'USD';
  return leg;
}

/** Signed value for the leg that matches this record, or null if not applicable. */
function signedForFinanceRecordLeg(record, leg) {
  if (financeRecordLegKey(record) !== leg) return null;
  const raw = parseFloat(record.amount) || 0;
  if (raw === 0) return 0;
  return record.record_type === 'income' ? raw : -raw;
}

function financeRecordRecipientSortKey(record) {
  if (!record.recipient_detail) return '';
  const d = record.recipient_detail;
  const extra = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
  return `${d.username || ''} ${extra}`.trim().toLowerCase();
}

const FINANCE_RECORD_SORT_ACCESSORS = {
  id: (r) => Number(r.id) || 0,
  record_type: (r) => String(r.record_type ?? '').toLowerCase(),
  expense_type: (r) => String(r.expense_type ?? '').replace(/_/g, ' ').toLowerCase(),
  status: (r) => String(r.status ?? '').toLowerCase(),
  related_order: (r) => Number(r.order) || 0,
  related_sale: (r) => Number(r.sale) || 0,
  related_dispatch: (r) => Number(r.dispatch) || 0,
  recipient_key: (r) => financeRecordRecipientSortKey(r),
  notes: (r) => String(r.notes ?? '').toLowerCase(),
  transaction_date: (r) => new Date(r.transaction_date).getTime() || 0,
};
for (const leg of BALANCE_TABLE_LEGS) {
  FINANCE_RECORD_SORT_ACCESSORS[`leg_${leg}`] = (r) => {
    const v = signedForFinanceRecordLeg(r, leg);
    return v === null ? 0 : v;
  };
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
  const { hasPermission } = useAuth();
  const canCreateManual = hasPermission('finance.create_manual');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    expense_type: 'lunch',
    target: '',
    smm: '',
    currency: 'USD',
    amount: '',
    recipient: '',
    notes: '',
    pay_immediately: true,
  });

  const EXPENSE_TARGET_OPTIONS = [
    { value: 'shop', label: 'Shop' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'office', label: 'Office' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'logistics', label: 'Logistics' },
    { value: 'operations', label: 'Operations' },
    { value: 'other', label: 'Other' },
  ];

  const EXPENSE_SMM_OPTIONS = [
    { value: 'instagram', label: 'Instagram' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'other', label: 'Other' },
    { value: 'none', label: 'Not applicable' },
  ];
  const [incomeFormData, setIncomeFormData] = useState({
    currency: 'USD',
    amount: '',
    notes: '',
    pay_immediately: true,
  });
  const [workers, setWorkers] = useState([]);
  const [filter, setFilter] = useState({
    type: '',
    status: '',
    expense_type: '',
    currency: '',
    year: '',
    month: '',
  });

  useEffect(() => {
    fetchWorkers();
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
      params.append('scope', 'other');
      if (filter.type) params.append('type', filter.type);
      if (filter.status) params.append('status', filter.status);
      if (filter.expense_type) params.append('expense_type', filter.expense_type);
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

  const handleSettleRecord = async (record) => {
    if (!window.confirm('Mark this record as paid/received and update Money Balance?')) return;
    try {
      const res = await api.post(`/finance/${record.id}/settle/`);
      alert(res.data?.message || 'Settled.');
      fetchRecords();
    } catch (error) {
      alert(error.response?.data?.error || 'Could not settle record.');
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
        target: expenseFormData.target || null,
        smm: expenseFormData.smm || null,
        amount: expenseFormData.amount || 0,
        currency: expenseFormData.currency,
        payment_type: 'cash',
        recipient: expenseFormData.recipient || null,
        notes: String(expenseFormData.notes || '').trim(),
        pay_immediately: expenseFormData.pay_immediately,
      };

      await api.post('/finance/', payload);
      setShowExpenseForm(false);
      setExpenseFormData({
        expense_type: 'lunch',
        target: '',
        smm: '',
        currency: 'USD',
        amount: '',
        recipient: '',
        notes: '',
        pay_immediately: true,
      });
      fetchRecords();
      fetchWorkers();
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

  const handleIncomeSubmit = async (e) => {
    e.preventDefault();
    if (!String(incomeFormData.notes || '').trim()) {
      alert('Please enter notes describing this income.');
      return;
    }
    try {
      await api.post('/finance/', {
        record_type: 'income',
        amount: incomeFormData.amount || 0,
        currency: incomeFormData.currency,
        payment_type: 'cash',
        notes: String(incomeFormData.notes || '').trim(),
        pay_immediately: incomeFormData.pay_immediately,
      });
      setShowIncomeForm(false);
      setIncomeFormData({ currency: 'USD', amount: '', notes: '', pay_immediately: true });
      fetchRecords();
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.non_field_errors?.[0] ||
        error.response?.data?.error ||
        'Error creating income';
      alert(errorMessage);
    }
  };

  const recordSignedLegTotals = useMemo(
    () => signedFinanceAmountsByLeg(records, { status: 'completed' }),
    [records],
  );

  const financeRecordsSort = useClientTableSort(FINANCE_RECORD_SORT_ACCESSORS);
  const sortedRecords = useMemo(
    () => financeRecordsSort.sortRows(records || []),
    [records, financeRecordsSort],
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

  const netOtherUSD = totalIncomeUSD - totalExpenseUSD;
  const netOtherUZS = totalIncomeUZS - totalExpenseUZS;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Other Financial Records</h1>
        {canCreateManual && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => { setShowIncomeForm(!showIncomeForm); setShowExpenseForm(false); }}>
              {showIncomeForm ? 'Cancel' : '+ Add Income'}
            </button>
            <button className="btn-edit" onClick={() => { setShowExpenseForm(!showExpenseForm); setShowIncomeForm(false); }}>
              {showExpenseForm ? 'Cancel' : '+ Add Expense'}
            </button>
          </div>
        )}
      </div>

      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em', maxWidth: 720 }}>
        Manual other income and expenses only. Sales, inventory, receivables/payables, and Money Balance are tracked on their own tabs.
        Use <strong>Pay later</strong> to create a payable/receivable first; then settle here or from Receivables / Payables.
      </p>

      {showExpenseForm && canCreateManual && (
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
                <label>Target</label>
                <select
                  value={expenseFormData.target}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, target: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {EXPENSE_TARGET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>SMM</label>
                <select
                  value={expenseFormData.smm}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, smm: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {EXPENSE_SMM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
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
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={expenseFormData.pay_immediately}
                    onChange={(e) =>
                      setExpenseFormData({ ...expenseFormData, pay_immediately: e.target.checked })
                    }
                  />{' '}
                  Pay immediately (uncheck to create a payable first)
                </label>
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

      {showIncomeForm && canCreateManual && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Add Other Income</h2>
          <form onSubmit={handleIncomeSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={incomeFormData.currency}
                  onChange={(e) => setIncomeFormData({ ...incomeFormData, currency: e.target.value })}
                  required
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
                  value={incomeFormData.amount}
                  onChange={(e) => setIncomeFormData({ ...incomeFormData, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes *</label>
                <textarea
                  value={incomeFormData.notes}
                  onChange={(e) => setIncomeFormData({ ...incomeFormData, notes: e.target.value })}
                  rows="2"
                  required
                  placeholder="e.g. Service income, bonus, refund from supplier"
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={incomeFormData.pay_immediately}
                    onChange={(e) =>
                      setIncomeFormData({ ...incomeFormData, pay_immediately: e.target.checked })
                    }
                  />{' '}
                  Received immediately (uncheck to create a receivable first)
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">Add Income</button>
            </div>
          </form>
        </div>
      )}

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
            <div className="metric-label">Net other (USD)</div>
            <div className="metric-value" style={{ color: netOtherUSD >= 0 ? '#27ae60' : '#e74c3c' }}>
              {netOtherUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
            <div style={{ fontSize: '0.75em', color: '#888' }}>Completed rows only — see Profit / Loss for sales</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Net other (UZS)</div>
            <div className="metric-value" style={{ color: netOtherUZS >= 0 ? '#27ae60' : '#e74c3c' }}>
              {netOtherUZS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UZS
            </div>
          </div>
        </div>

      {/* Filters */}
      {!showExpenseForm && !showIncomeForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title" style={{ marginBottom: '8px' }}>Filters</h3>
          <div className="filter-toolbar">
              <div className="filter-field">
                <label>Type</label>
                <select
                  value={filter.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setFilter({
                      ...filter,
                      type: newType,
                      expense_type: newType === 'expense' ? filter.expense_type : '',
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
                    <option value="office_supplies">Office Supplies</option>
                    <option value="utilities">Utilities</option>
                    <option value="rent">Rent</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
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
              onClick={() => setFilter({ type: '', status: '', expense_type: '', currency: '', year: '', month: '' })}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
      )}

      <div className="table-card">
          <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="id" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>ID</SortableTh>
                <SortableTh columnId="record_type" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Type</SortableTh>
                <SortableTh columnId="expense_type" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Expense Type</SortableTh>
                {BALANCE_TABLE_LEGS.map((leg) => (
                  <SortableTh key={leg} columnId={`leg_${leg}`} sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>{financeLegHeader(leg)}</SortableTh>
                ))}
                <SortableTh columnId="status" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Status</SortableTh>
                <SortableTh columnId="related_order" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Related Order</SortableTh>
                <SortableTh columnId="related_sale" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Related Sale</SortableTh>
                <SortableTh columnId="related_dispatch" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Related Dispatch</SortableTh>
                <SortableTh columnId="recipient_key" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Recipient</SortableTh>
                <SortableTh columnId="notes" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Notes</SortableTh>
                <SortableTh columnId="transaction_date" sortCol={financeRecordsSort.sortCol} sortDir={financeRecordsSort.sortDir} onSort={financeRecordsSort.onHeaderClick}>Date</SortableTh>
                {canCreateManual && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center' }}>
                    No finance records found
                  </td>
                </tr>
              ) : (
                sortedRecords.map((record) => (
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
                    {BALANCE_TABLE_LEGS.map((leg) => (
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
                    {canCreateManual && (
                      <td>
                        {record.status === 'pending' ? (
                          <button type="button" className="btn-edit" onClick={() => handleSettleRecord(record)}>
                            Settle
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" style={{ textAlign: 'right' }}>
                  Net (completed)
                </td>
                {BALANCE_TABLE_LEGS.map((leg) => (
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
                    ? 'Net (completed): completed rows summed by currency (UZS vs USD); legacy income/expense splits by cash/card appear in their currency column.'
                    : ' '}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
    </div>
  );
};

export default Finance;
