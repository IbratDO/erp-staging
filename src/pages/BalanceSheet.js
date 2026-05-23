import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import './TablePage.css';

function fmtUsd(n) {
  const v = parseFloat(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SectionHeader({ number, title }) {
  return (
    <tr className="balance-sheet-section-header">
      <td colSpan={2}>
        {number}. {title}
      </td>
    </tr>
  );
}

function LineRow({ label, value, indent = 0 }) {
  return (
    <tr className="balance-sheet-line">
      <td style={{ paddingLeft: 20 + indent * 16 }}>{label}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{value}</td>
    </tr>
  );
}

function TotalRow({ label, value }) {
  return (
    <tr className="balance-sheet-total-row">
      <td>{label}</td>
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

  const cashBlock = assets?.current?.cash;
  const cashUsd = parseFloat(cashBlock?.cash_usd) || 0;
  const bankUsd = parseFloat(cashBlock?.bank_usd) || 0;

  const customerRecv =
    assets?.current?.customer_receivables?.total_usd
    ?? assets?.current?.accounts_receivable?.total_usd
    ?? 0;
  const productRecv =
    assets?.current?.product_receivables?.total_usd
    ?? assets?.current?.supplier_advances_usd
    ?? 0;
  const fixedAssetRecv = assets?.current?.fixed_asset_receivables?.total_usd ?? 0;

  const inv = assets?.current?.inventory;
  const invTotal = parseFloat(inv?.total_usd) || 0;
  const packageUsd = parseFloat(inv?.package_value_usd) || 0;
  const productInvUsd = Math.max(invTotal - packageUsd, 0);

  const faNonCurrent =
    assets?.non_current?.fixed_assets_usd
    ?? assets?.fixed_assets?.non_current_usd
    ?? assets?.non_current?.fixed_assets?.total_usd
    ?? 0;

  const payableExpenses =
    liabilities?.current?.payable_expenses?.total_usd
    ?? liabilities?.current?.accounts_payable?.total_usd
    ?? 0;
  const customerAdvances = liabilities?.current?.customer_advances?.total_usd ?? 0;

  const prepaid = parseFloat(assets?.current?.prepaid_expenses_usd) || 0;

  const totalLiabEquity =
    (parseFloat(liabilities?.total_usd) || 0) + (parseFloat(equity?.total_equity_usd) || 0);

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

          <div className="metrics-grid metrics-grid--balance-sheet-summary">
            <div className="metric-card" style={{ border: '2px solid #007bff' }}>
              <div className="metric-label">Total assets</div>
              <div className="metric-value" style={{ color: '#007bff', fontSize: '1.4em' }}>
                {fmtUsd(assets?.total_usd)}
              </div>
            </div>
            <div className="metric-card" style={{ border: '2px solid #6f42c1' }}>
              <div className="metric-label">Equity + liabilities</div>
              <div className="metric-value" style={{ color: '#6f42c1', fontSize: '1.4em' }}>
                {fmtUsd(totalLiabEquity)}
              </div>
            </div>
          </div>

          <div className="balance-sheet-layout">
            <div className="balance-sheet-panel balance-sheet-panel--assets">
              <div className="table-card balance-sheet-card balance-sheet-card--fill">
                <h3 style={{ borderBottom: '3px solid #007bff', paddingBottom: 8, marginTop: 0 }}>
                  Assets
                </h3>
                <table className="data-table balance-sheet-table">
                  <tbody>
                    <SectionHeader number={1} title="Money" />
                    <LineRow label="Cash" value={fmtUsd(cashUsd)} indent={1} />
                    <LineRow label="Bank" value={fmtUsd(bankUsd)} indent={1} />

                    <SectionHeader number={2} title="Receivables" />
                    <LineRow
                      label="Customer receivables (unpaid sales)"
                      value={fmtUsd(customerRecv)}
                      indent={1}
                    />
                    <LineRow
                      label="Product receivables (prepaid orders, goods in transit)"
                      value={fmtUsd(productRecv)}
                      indent={1}
                    />
                    <LineRow
                      label="Fixed asset receivables (paid, not yet received)"
                      value={fmtUsd(fixedAssetRecv)}
                      indent={1}
                    />

                    <SectionHeader number={3} title="Inventory" />
                    <LineRow label="Products" value={fmtUsd(productInvUsd)} indent={1} />
                    <LineRow
                      label={
                        inv?.package_units
                          ? `Packages (${inv.package_units} units)`
                          : 'Packages'
                      }
                      value={fmtUsd(packageUsd)}
                      indent={1}
                    />

                    {prepaid > 0.005 && (
                      <LineRow label="Prepaid expenses" value={fmtUsd(prepaid)} indent={1} />
                    )}

                    <SectionHeader number={4} title="Fixed assets" />
                    <LineRow
                      label="Fixed assets (on the books)"
                      value={fmtUsd(faNonCurrent)}
                      indent={1}
                    />

                    <TotalRow label="TOTAL ASSETS" value={fmtUsd(assets?.total_usd)} />
                  </tbody>
                </table>
              </div>
            </div>

            <div className="balance-sheet-panel balance-sheet-panel--right">
              <div className="table-card balance-sheet-card">
                <h3 style={{ borderBottom: '3px solid #dc3545', paddingBottom: 8, marginTop: 0 }}>
                  Liabilities
                </h3>
                <table className="data-table balance-sheet-table">
                  <tbody>
                    <SectionHeader number={1} title="Payables" />
                    <LineRow label="Payable expenses" value={fmtUsd(payableExpenses)} indent={1} />
                    <LineRow
                      label="Customer advances (deposits)"
                      value={fmtUsd(customerAdvances)}
                      indent={1}
                    />
                    <TotalRow
                      label="TOTAL LIABILITIES"
                      value={fmtUsd(liabilities?.total_usd)}
                    />
                  </tbody>
                </table>
              </div>

              <div className="table-card balance-sheet-card balance-sheet-card--fill">
                <h3 style={{ borderBottom: '3px solid #6f42c1', paddingBottom: 8, marginTop: 0 }}>
                  Equity
                </h3>
                <table className="data-table balance-sheet-table">
                  <tbody>
                    <LineRow
                      label="Owner capital (net contributions)"
                      value={fmtUsd(equity?.owner_capital_net_usd)}
                    />
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
                    <TotalRow label="TOTAL EQUITY" value={fmtUsd(equity?.total_equity_usd)} />
                  </tbody>
                </table>
              </div>
            </div>
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
