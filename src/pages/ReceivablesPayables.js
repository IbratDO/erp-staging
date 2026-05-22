import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  sumAmountsByCurrency,
  formatMultiCurrencyAmounts,
} from '../utils/tableTotals';
import { formatDisplayAmount } from '../utils/currencyFormat';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';

const SALE_TYPE_LABELS = {
  bought_from_shop: 'Shop',
  delivery: 'Delivery',
  from_order: 'From order',
  reserved: 'Reserved',
};

/** Pending receivable — sale on-credit remainder or manual other income. */
function canCollectReceivable(receivable) {
  if (!receivable || receivable.status !== 'pending') return false;
  if (receivable.finance_record) return true;
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

function isCustomerDepositPayable(p) {
  return p?.record_kind === 'customer_deposit';
}

function payableKind(p) {
  if (isCustomerDepositPayable(p)) {
    return { kind: 'Customer deposit', ref: `Order #${p.order_detail?.id || p.order || '—'}` };
  }
  if (p.order) return { kind: 'Supplier', ref: `Order #${p.order}` };
  if (p.dispatch) return { kind: 'Dispatch', ref: `#${p.dispatch} (Sale #${p.dispatch_detail?.sale || '—'})` };
  if (p.package_history) return { kind: 'Package', ref: `History #${p.package_history}` };
  if (p.finance_record) return { kind: 'Other expense', ref: `Finance #${p.finance_record}` };
  return { kind: '—', ref: '—' };
}

function formatMoneyAmount(amount, currency) {
  const n = parseFloat(amount) || 0;
  const ccy = String(currency || 'USD').toUpperCase();
  if (ccy === 'UZS') return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function receivableCustomerName(rcv) {
  return rcv.sale_detail?.customer_detail?.name || '—';
}

function payableContext(p) {
  if (isCustomerDepositPayable(p)) {
    return 'On-demand prepayment — cleared when you sell from this order';
  }
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
    const parts = [];
    if (p.order_detail?.order_type === 'on_demand') {
      parts.push('On-demand supplier cost');
    } else if (p.order_detail?.order_type === 'stock') {
      parts.push('Stock order (inventory)');
    }
    return parts.join(' · ');
  }
  if (p.package_history_detail?.package_detail) {
    const t = p.package_history_detail.package_detail.package_type;
    return t ? `Package type ${t}` : 'Package purchase';
  }
  return '—';
}

function receivableSaleProductKey(sd) {
  if (!sd?.product_detail) return '';
  const p = sd.product_detail;
  return `${p.brand || ''} ${p.model || ''}`.trim().toLowerCase();
}

const RECEIVABLE_TABLE_SORT_ACCESSORS = {
  id: (rcv) => Number(rcv.id) || 0,
  customer: (rcv) => receivableCustomerName(rcv).toLowerCase(),
  sale: (rcv) => Number(rcv.sale) || 0,
  product: (rcv) => receivableSaleProductKey(rcv.sale_detail),
  sale_type: (rcv) => String(rcv.sale_detail?.sale_type ?? '').toLowerCase(),
  from_order: (rcv) => Number(rcv.sale_detail?.order) || 0,
  dispatch: (rcv) => receivableDispatchLabel(rcv.sale_detail).toLowerCase(),
  amount: (rcv) => parseFloat(rcv.amount) || 0,
  currency: (rcv) => String(rcv.currency ?? rcv.sale_detail?.sale_currency ?? '').toLowerCase(),
  status: (rcv) => String(rcv.status ?? '').toLowerCase(),
  created_at: (rcv) => new Date(rcv.created_at).getTime() || 0,
  paid_date: (rcv) => {
    const d = rcv.paid_date;
    return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
  },
};

function payableProductSortKey(p) {
  const od = p.order_detail?.product_detail;
  if (od) return `${od.brand || ''} ${od.model || ''}`.trim().toLowerCase();
  const sd = p.dispatch_detail?.sale_detail?.product_detail;
  if (sd) return `${sd.brand || ''} ${sd.model || ''}`.trim().toLowerCase();
  const pkg = p.package_history_detail?.package_detail?.package_type;
  if (pkg) return String(pkg).toLowerCase();
  return '';
}

const PAYABLE_TABLE_SORT_ACCESSORS = {
  id: (p) =>
    isCustomerDepositPayable(p)
      ? -(Number(p.order_detail?.id) || 0)
      : Number(p.id) || 0,
  payable_kind: (p) => payableKind(p).kind.toLowerCase(),
  ref: (p) => payableKind(p).ref.toLowerCase(),
  customer: (p) => payableCustomerName(p).toLowerCase(),
  product: (p) => payableProductSortKey(p),
  context: (p) => payableContext(p).toLowerCase(),
  amount: (p) => parseFloat(p.amount) || 0,
  currency: (p) => String(p.currency ?? '').toLowerCase(),
  status: (p) => String(p.status ?? '').toLowerCase(),
  created_at: (p) => new Date(p.created_at).getTime() || 0,
  paid_date: (p) => {
    const d = p.paid_date;
    return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
  },
};

const ReceivablesPayables = () => {
  const [activeTab, setActiveTab] = useState('receivables');
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collectTarget, setCollectTarget] = useState(null);
  const [collectForm, setCollectForm] = useState({
    amount: '',
    notes: '',
  });
  const [filter, setFilter] = useState({
    status: '',
    currency: '',
    year: '',
    month: '',
  });

  useEffect(() => {
    setLoading(true);
    if (activeTab === 'receivables') {
      fetchReceivables();
    } else {
      fetchPayables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, activeTab]);

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
    const defAmount =
      rem > 0 ? (ccy === 'UZS' ? String(Math.round(rem)) : rem.toFixed(2)) : '';
    setCollectForm({
      amount: defAmount,
      notes: '',
    });
  };

  const handleCollectReceivableSubmit = async (e) => {
    e.preventDefault();
    if (!collectTarget) return;
    const ccy = String(collectTarget.currency || collectTarget.sale_detail?.sale_currency || 'USD').toUpperCase();
    const pay = parseFloat(collectForm.amount) || 0;
    const rem = parseFloat(collectTarget.amount) || 0;
    const tol = 0.02;

    if (pay <= 0) {
      alert('Enter the amount collected (greater than zero).');
      return;
    }
    if (pay > rem + tol) {
      alert(
        `Collected amount cannot exceed remaining balance (${formatDisplayAmount(rem, ccy)}).`,
      );
      return;
    }

    const uzs_cash = ccy === 'UZS' ? pay : 0;
    const usd_cash = ccy === 'USD' ? pay : 0;

    try {
      let res;
      if (collectTarget.finance_record) {
        res = await api.post(`/finance/${collectTarget.finance_record}/settle/`);
      } else {
        res = await api.post(`/receivables/${collectTarget.id}/collect_payment/`, {
          uzs_cash,
          uzs_card: 0,
          usd_cash,
          usd_card: 0,
          notes: String(collectForm.notes || '').trim(),
        });
      }
      alert(res.data?.message || 'Payment recorded.');
      setCollectTarget(null);
      setCollectForm({
        amount: '',
        notes: '',
      });
      await fetchReceivables();
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

  const handleSettleManualPayable = async (payable) => {
    const frId = payable.finance_record;
    if (!frId) return;
    if (!window.confirm('Mark this payable as paid and deduct from Money Balance?')) return;
    try {
      const res = await api.post(`/finance/${frId}/settle/`);
      alert(res.data?.message || 'Paid.');
      fetchPayables();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || 'Could not settle payable.');
    }
  };

  const receivableAmountTotals = useMemo(
    () => sumAmountsByCurrency(receivables.filter((r) => r.status === 'pending')),
    [receivables]
  );
  const payableAmountTotals = useMemo(
    () => sumAmountsByCurrency(payables),
    [payables]
  );
  const customerDepositPayableTotals = useMemo(
    () => sumAmountsByCurrency(payables.filter((p) => isCustomerDepositPayable(p))),
    [payables]
  );
  const supplierPayableTotals = useMemo(
    () => sumAmountsByCurrency(payables.filter((p) => !isCustomerDepositPayable(p) && p.status === 'pending')),
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

  const receivablesSort = useClientTableSort(RECEIVABLE_TABLE_SORT_ACCESSORS);
  const sortedReceivableRows = useMemo(
    () => receivablesSort.sortRows(receivables || []),
    [receivables, receivablesSort],
  );

  const payablesTableSort = useClientTableSort(PAYABLE_TABLE_SORT_ACCESSORS);
  const sortedPayableRows = useMemo(
    () => payablesTableSort.sortRows(payables || []),
    [payables, payablesTableSort],
  );

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Receivables / Payables</h1>
      </div>

      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em', maxWidth: 720 }}>
        Open balances only. Settled items are reflected in Money Balance and removed from this list.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e0e0e0' }}>
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
      </div>

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

      <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title" style={{ marginBottom: '8px' }}>Filters</h3>
          <div className="filter-toolbar">
          <div className="filter-field">
              <label>Status</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              >
                <option value="">Pending only (default)</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
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
              onClick={() => setFilter({ status: '', currency: '', year: '', month: '' })}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

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
                    <label>
                      Amount (
                      {(collectTarget.currency || collectTarget.sale_detail?.sale_currency || 'USD').toUpperCase()}
                      )
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={collectForm.amount}
                      onChange={(e) => setCollectForm({ ...collectForm, amount: e.target.value })}
                      required
                    />
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
                        amount: '',
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
          <p style={{ color: '#666', fontSize: '0.9em', margin: '0 0 10px' }}>
            Outstanding balances on completed sales (after any order advance). Customer prepayments before a sale
            are listed under Payables.
          </p>
          <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="id" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>ID</SortableTh>
                <SortableTh columnId="customer" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Customer</SortableTh>
                <SortableTh columnId="sale" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Sale</SortableTh>
                <SortableTh columnId="product" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Product</SortableTh>
                <SortableTh columnId="sale_type" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Sale type</SortableTh>
                <SortableTh columnId="from_order" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>From order</SortableTh>
                <SortableTh columnId="dispatch" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Delivery (BTS / Dostavshik)</SortableTh>
                <SortableTh columnId="amount" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Amount</SortableTh>
                <SortableTh columnId="currency" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Currency</SortableTh>
                <SortableTh columnId="status" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Status</SortableTh>
                <SortableTh columnId="created_at" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Created</SortableTh>
                <SortableTh columnId="paid_date" sortCol={receivablesSort.sortCol} sortDir={receivablesSort.sortDir} onSort={receivablesSort.onHeaderClick}>Paid date</SortableTh>
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
                sortedReceivableRows.map((receivable) => {
                  const sd = receivable.sale_detail;
                  return (
                  <tr key={receivable.id}>
                    <td>#{receivable.id}</td>
                      <td>{receivableCustomerName(receivable)}</td>
                      <td>{receivable.sale ? `#${receivable.sale}` : receivable.finance_record ? `Fin #${receivable.finance_record}` : '—'}</td>
                      <td>
                        {sd?.product_detail
                          ? `${sd.product_detail.brand} ${sd.product_detail.model}`
                          : '—'}
                      </td>
                      <td>
                        {sd?.sale_type
                          ? SALE_TYPE_LABELS[sd.sale_type] || sd.sale_type
                          : '—'}
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
                      {parseFloat(receivable.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
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
                  Pending balance due
                </td>
                <td style={{ fontWeight: 600, color: '#28a745' }}>
                  {formatMultiCurrencyAmounts(receivableAmountTotals)}
                </td>
                <td colSpan="5">—</td>
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
          <p style={{ color: '#666', fontSize: '0.9em', margin: '0 0 10px' }}>
            Supplier, courier, and package obligations, plus customer prepayments on on-demand orders until you
            sell (deposit rows drop off once the order is sold and the advance is applied).
          </p>
          <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="id" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>ID</SortableTh>
                <SortableTh columnId="payable_kind" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Payable type</SortableTh>
                <SortableTh columnId="ref" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Ref</SortableTh>
                <SortableTh columnId="customer" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Customer</SortableTh>
                <SortableTh columnId="product" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Product</SortableTh>
                <SortableTh columnId="context" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Context</SortableTh>
                <SortableTh columnId="amount" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Amount</SortableTh>
                <SortableTh columnId="currency" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Currency</SortableTh>
                <SortableTh columnId="status" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Status</SortableTh>
                <SortableTh columnId="created_at" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Created</SortableTh>
                <SortableTh columnId="paid_date" sortCol={payablesTableSort.sortCol} sortDir={payablesTableSort.sortDir} onSort={payablesTableSort.onHeaderClick}>Paid date</SortableTh>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payables.length === 0 ? (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center' }}>
                    No payables found
                  </td>
                </tr>
              ) : (
                sortedPayableRows.map((payable) => {
                  const { kind, ref } = payableKind(payable);
                  const isDeposit = isCustomerDepositPayable(payable);
                  const rowKey = isDeposit ? payable.virtual_id : payable.id;
                  return (
                  <tr key={rowKey} style={isDeposit ? { backgroundColor: '#f8f4ff' } : undefined}>
                    <td>{isDeposit ? `Order #${payable.order_detail?.id}` : `#${payable.id}`}</td>
                    <td>
                        <span
                          className="status-badge"
                          style={{ background: isDeposit ? '#5e35b1' : '#6c757d', fontSize: '0.75rem' }}
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
                    <td style={{ fontWeight: '600', color: isDeposit ? '#5e35b1' : '#dc3545' }}>
                      {formatMoneyAmount(payable.amount, payable.currency)}
                      {isDeposit && (
                        <div style={{ fontSize: '0.78em', color: '#666', fontWeight: 400 }}>Prepaid by customer</div>
                      )}
                    </td>
                    <td>{payable.currency || 'USD'}</td>
                    <td>
                      <span className={`status-badge ${payable.status}`}>
                        {isDeposit ? 'prepaid' : payable.status}
                      </span>
                    </td>
                    <td>{new Date(payable.created_at).toLocaleString()}</td>
                    <td>
                      {payable.paid_date
                        ? new Date(payable.paid_date).toLocaleString()
                          : '—'}
                      </td>
                      <td>
                        {payable.finance_record && payable.status === 'pending' ? (
                          <button type="button" className="btn-edit" onClick={() => handleSettleManualPayable(payable)}>
                            Pay
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
                <td colSpan="6" style={{ textAlign: 'right' }}>
                  Supplier / courier / package (pending)
                </td>
                <td style={{ fontWeight: 600, color: '#dc3545' }}>
                  {formatMultiCurrencyAmounts(supplierPayableTotals)}
                </td>
                <td colSpan="4">—</td>
              </tr>
              {(customerDepositPayableTotals.USD > 0 || customerDepositPayableTotals.UZS > 0) && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'right', color: '#666' }}>
                    Customer deposits (on-demand, not sold yet)
                  </td>
                  <td style={{ fontWeight: 600, color: '#5e35b1' }}>
                    {formatMultiCurrencyAmounts(customerDepositPayableTotals)}
                  </td>
                  <td colSpan="4">—</td>
                </tr>
              )}
            </tfoot>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivablesPayables;
