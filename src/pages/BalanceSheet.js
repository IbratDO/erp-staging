import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import './TablePage.css';

function fmtUsd(n) {
  const v = parseFloat(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LineRow({ label, value, indent = 0, bold = false }) {
  return (
    <tr style={bold ? { fontWeight: 600, backgroundColor: '#f8f9fa' } : undefined}>
      <td style={{ paddingLeft: 12 + indent * 16 }}>{label}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{value}</td>
    </tr>
  );
}

const BalanceSheet = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    as_of: '',
    year: '',
    month: '',
  });

  const fetchBalanceSheet = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.as_of) {
        params.append('as_of', filter.as_of);
      } else if (filter.year && filter.month) {
        params.append('year', filter.year);
        params.append('month', filter.month);
      } else if (filter.year) {
        params.append('year', filter.year);
      }
      const url = params.toString() ? `/finance/balance_sheet/?${params}` : '/finance/balance_sheet/';
      const { data: res } = await api.get(url);
      setData(res);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalanceSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.as_of, filter.year, filter.month]);

  const assets = data?.assets;
  const liabilities = data?.liabilities;
  const equity = data?.equity;
  const eqn = data?.equation;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Balance Sheet</h1>
      </div>

      <p style={{ color: '#666', marginBottom: 12, fontSize: '0.9em', maxWidth: 720 }}>
        Financial position at a point in time (USD). Net profit for the selected month flows into equity
        and links to the Profit / Loss report for the same period. Past dates are recalculated from
        transactions recorded on or before that date.
      </p>

      <div className="form-card filter-card" style={{ marginBottom: 16 }}>
        <h3 className="filter-card__title" style={{ marginBottom: 8 }}>
          As-of date / period
        </h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>As of (date)</label>
            <input
              type="date"
              value={filter.as_of}
              onChange={(e) =>
                setFilter({ as_of: e.target.value, year: '', month: '' })
              }
            />
          </div>
          <div className="filter-field">
            <label>Year</label>
            <select
              value={filter.year}
              onChange={(e) => setFilter({ ...filter, year: e.target.value, as_of: '' })}
            >
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => {
                const y = new Date().getFullYear() - i;
                return (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="filter-field">
            <label>Month</label>
            <select
              value={filter.month}
              onChange={(e) => setFilter({ ...filter, month: e.target.value, as_of: '' })}
            >
              <option value="">—</option>
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1).padStart(2, '0');
                return (
                  <option key={m} value={m}>
                    {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        {data?.as_of && (
          <p style={{ margin: '8px 0 0', fontSize: '0.85em', color: '#888' }}>
            Position as of <strong>{data.as_of}</strong>
            {data.period?.label ? ` · P&L period: ${data.period.label}` : ''}
          </p>
        )}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40 }}>Loading…</p>
      ) : !data ? (
        <p style={{ textAlign: 'center', padding: 40 }}>Could not load balance sheet.</p>
      ) : (
        <>
          {eqn && !eqn.balanced && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                background: '#fff3e0',
                border: '1px solid #ff9800',
                borderRadius: 6,
              }}
            >
              <strong>Balance check:</strong> Assets and liabilities + equity differ by{' '}
              {fmtUsd(Math.abs(eqn.difference_usd))}. This can happen when accrual P&amp;L and
              point-in-time ledger positions use different timing; review notes below.
            </div>
          )}

          {eqn?.balanced && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                background: '#e8f5e9',
                border: '1px solid #4caf50',
                borderRadius: 6,
              }}
            >
              <strong>Balanced:</strong> Assets = Liabilities + Equity ({fmtUsd(eqn.total_assets_usd)})
            </div>
          )}

          <div className="metrics-grid" style={{ marginBottom: 20 }}>
            <div className="metric-card" style={{ border: '2px solid #007bff' }}>
              <div className="metric-label">Total assets</div>
              <div className="metric-value" style={{ color: '#007bff', fontSize: '1.4em' }}>
                {fmtUsd(assets?.total_usd)}
              </div>
            </div>
            <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
              <div className="metric-label">Total liabilities</div>
              <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.4em' }}>
                {fmtUsd(liabilities?.total_usd)}
              </div>
            </div>
            <div className="metric-card" style={{ border: '2px solid #6f42c1' }}>
              <div className="metric-label">Total equity</div>
              <div className="metric-value" style={{ color: '#6f42c1', fontSize: '1.4em' }}>
                {fmtUsd(equity?.total_equity_usd)}
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginBottom: 20 }}>
            <h3>Assets</h3>
            <table className="data-table">
              <tbody>
                <LineRow label="Cash (USD + UZS converted)" value={fmtUsd(assets?.current?.cash?.total_usd)} bold />
                <LineRow label="Bank / card buckets" value={fmtUsd(assets?.current?.cash?.bank_usd)} indent={1} />
                <LineRow
                  label="Accounts receivable"
                  value={fmtUsd(assets?.current?.accounts_receivable?.total_usd)}
                  indent={1}
                />
                <LineRow
                  label="Inventory (FIFO landed cost)"
                  value={fmtUsd(assets?.current?.inventory?.total_usd)}
                  indent={1}
                />
                <LineRow label="Prepaid expenses" value={fmtUsd(assets?.current?.prepaid_expenses_usd)} indent={1} />
                <LineRow label="Total current assets" value={fmtUsd(assets?.current?.total_usd)} bold />
                <LineRow label="Non-current assets" value={fmtUsd(assets?.non_current?.total_usd)} />
                <LineRow label="TOTAL ASSETS" value={fmtUsd(assets?.total_usd)} bold />
              </tbody>
            </table>
          </div>

          <div className="table-card" style={{ marginBottom: 20 }}>
            <h3>Liabilities</h3>
            <table className="data-table">
              <tbody>
                <LineRow
                  label="Accounts payable"
                  value={fmtUsd(liabilities?.current?.accounts_payable?.total_usd)}
                />
                <LineRow
                  label="Customer advances (deposits)"
                  value={fmtUsd(liabilities?.current?.customer_advances?.total_usd)}
                  indent={1}
                />
                <LineRow label="Total current liabilities" value={fmtUsd(liabilities?.current?.total_usd)} bold />
                <LineRow label="Long-term liabilities" value={fmtUsd(liabilities?.long_term?.total_usd)} />
                <LineRow label="TOTAL LIABILITIES" value={fmtUsd(liabilities?.total_usd)} bold />
              </tbody>
            </table>
          </div>

          <div className="table-card" style={{ marginBottom: 20 }}>
            <h3>Equity / Capital</h3>
            <table className="data-table">
              <tbody>
                <LineRow label="Owner capital (net contributions)" value={fmtUsd(equity?.owner_capital_net_usd)} />
                <LineRow
                  label="Retained earnings (prior periods)"
                  value={fmtUsd(equity?.retained_earnings_usd)}
                  indent={1}
                />
                <LineRow
                  label="Current period profit / loss (P&L)"
                  value={fmtUsd(equity?.current_period_profit_usd)}
                  indent={1}
                />
                <LineRow label="TOTAL EQUITY" value={fmtUsd(equity?.total_equity_usd)} bold />
              </tbody>
            </table>
            <p style={{ fontSize: '0.85em', color: '#666', marginTop: 10 }}>
              Current period profit matches{' '}
              <a href="/profit-loss">Profit / Loss</a> for {equity?.period_start} – {equity?.period_end}.
            </p>
          </div>

          {data.notes?.length > 0 && (
            <div className="form-card">
              <h3 style={{ marginTop: 0 }}>Notes</h3>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#555', fontSize: '0.9em' }}>
                {data.notes.map((n, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BalanceSheet;
