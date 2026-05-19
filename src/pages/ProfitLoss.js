import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';

const PROFIT_LOSS_SALE_SORT_ACCESSORS = {
  sale_id: (item) => Number(item.sale_id) || 0,
  product: (item) => String(item.product ?? '').toLowerCase(),
  quantity: (item) => Number(item.quantity) || 0,
  completed_at: (item) => {
    const s = item.completed_at;
    if (!s) return 0;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : 0;
  },
  income_usd: (item) => Number(item.income_usd) || 0,
  cogs_usd: (item) => Number(item.total_cogs_usd) || 0,
  profit_usd: (item) => Number(item.profit_usd) || 0,
};

const OPERATING_EXPENSE_SORT_ACCESSORS = {
  expense_type_label: (item) => String(item.type ?? '').toLowerCase(),
  amount_usd: (item) => Number(item.amount_usd) || 0,
  date: (item) => {
    const s = item.date;
    if (s == null || s === '') return 0;
    const t = new Date(`${s}T12:00:00`).getTime();
    return Number.isFinite(t) ? t : String(s).toLowerCase();
  },
};

const ProfitLoss = () => {
  const [profitLoss, setProfitLoss] = useState(null);
  const [expandedPlSaleId, setExpandedPlSaleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    year: '',
    month: '',
  });

  const fetchProfitLoss = async () => {
    setLoading(true);
    try {
      let url = '/finance/profit_loss/';
      const params = new URLSearchParams();

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
      setExpandedPlSaleId(null);
    } catch (error) {
      console.error('Error fetching profit/loss:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfitLoss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.year, filter.month]);

  const profitLossSalesSort = useClientTableSort(PROFIT_LOSS_SALE_SORT_ACCESSORS);
  const sortedProfitLossSales = useMemo(
    () => profitLossSalesSort.sortRows(profitLoss?.sales || []),
    [profitLoss?.sales, profitLossSalesSort],
  );

  const operatingExpenseSort = useClientTableSort(OPERATING_EXPENSE_SORT_ACCESSORS);
  const sortedOperatingExpenses = useMemo(
    () => operatingExpenseSort.sortRows(profitLoss?.operating_expenses || []),
    [profitLoss?.operating_expenses, operatingExpenseSort],
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Profit / Loss</h1>
      </div>

      <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
        <h3 className="filter-card__title" style={{ marginBottom: '8px' }}>
          Filters
        </h3>
        <div className="filter-toolbar">
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
              {Array.from({ length: 12 }, (_, i) => {
                const month = (i + 1).toString();
                return (
                  <option key={month} value={month.padStart(2, '0')}>
                    {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      <p style={{ color: '#666', marginBottom: '8px', fontSize: '0.9em' }}>
        All amounts are reported in USD. UZS entries are converted using the CBU exchange rate for each
        transaction date.
      </p>
      {profitLoss?.exchange_rate?.label && (
        <p style={{ color: '#888', marginBottom: '16px', fontSize: '0.75em' }}>
          {profitLoss.exchange_rate.label}
        </p>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      ) : profitLoss ? (
        <div>
          <div className="metrics-grid" style={{ marginBottom: '20px' }}>
            <div className="metric-card" style={{ border: '2px solid #28a745' }}>
              <div className="metric-label">Net revenue</div>
              <div className="metric-value" style={{ color: '#28a745', fontSize: '1.6em' }}>
                ${(profitLoss.totals.total_income_usd || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
              <div className="metric-label">Net COGS</div>
              <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.6em' }}>
                ${(profitLoss.totals.total_cogs_usd || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="metric-card" style={{ border: '2px solid #dc3545' }}>
              <div className="metric-label">Operating expenses</div>
              <div className="metric-value" style={{ color: '#dc3545', fontSize: '1.6em' }}>
                ${(profitLoss.totals.total_operating_expenses_usd || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div
              className="metric-card"
              style={{
                border: `2px solid ${(profitLoss.totals.net_profit_usd || 0) >= 0 ? '#28a745' : '#dc3545'}`,
              }}
            >
              <div className="metric-label">Net profit / loss</div>
              <div
                className="metric-value"
                style={{
                  color: (profitLoss.totals.net_profit_usd || 0) >= 0 ? '#28a745' : '#dc3545',
                  fontSize: '1.6em',
                }}
              >
                ${(profitLoss.totals.net_profit_usd || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginBottom: '20px' }}>
            <h3>Sales (USD, UZS converted at transaction-date rate)</h3>
            <p style={{ color: '#888', fontSize: '0.85em', margin: '0 0 8px' }}>
              Click a row to see how net profit was calculated for that sale.
            </p>
            <div className="data-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh
                      columnId="sale_id"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      Sale ID
                    </SortableTh>
                    <SortableTh
                      columnId="product"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      Product
                    </SortableTh>
                    <SortableTh
                      columnId="quantity"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      Qty
                    </SortableTh>
                    <SortableTh
                      columnId="completed_at"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      Completed
                    </SortableTh>
                    <SortableTh
                      columnId="income_usd"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      Income (USD)
                    </SortableTh>
                    <SortableTh
                      columnId="cogs_usd"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      COGS (USD)
                    </SortableTh>
                    <SortableTh
                      columnId="profit_usd"
                      sortCol={profitLossSalesSort.sortCol}
                      sortDir={profitLossSalesSort.sortDir}
                      onSort={profitLossSalesSort.onHeaderClick}
                    >
                      Profit (USD)
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {profitLoss.sales.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center' }}>
                        No sales completed in this period
                      </td>
                    </tr>
                  ) : (
                    sortedProfitLossSales.map((item) => {
                      const expanded = expandedPlSaleId === item.sale_id;
                      const bd = item.cogs_breakdown || {};
                      const fmtUsd = (n) =>
                        `$${(n || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`;
                      return (
                        <React.Fragment key={item.sale_id}>
                          <tr
                            onClick={() => setExpandedPlSaleId(expanded ? null : item.sale_id)}
                            style={{ cursor: 'pointer', backgroundColor: expanded ? '#f0f7ff' : undefined }}
                            title="Click to show profit calculation"
                          >
                            <td>#{item.sale_id}</td>
                            <td>{item.product}</td>
                            <td>
                              {item.quantity}
                              {item.quantity_returned > 0 && (
                                <span style={{ color: '#888', fontSize: '0.85em' }}>
                                  {' '}
                                  ({item.quantity_returned} returned)
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: '0.9em' }}>
                              {item.completed_at ? new Date(item.completed_at).toLocaleString() : '—'}
                            </td>
                            <td>{fmtUsd(item.income_usd)}</td>
                            <td>{fmtUsd(item.total_cogs_usd)}</td>
                            <td
                              style={{
                                color: item.profit_usd >= 0 ? '#28a745' : '#dc3545',
                                fontWeight: '600',
                              }}
                            >
                              {fmtUsd(item.profit_usd)}
                            </td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan="7" style={{ backgroundColor: '#fafafa', padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.9em', lineHeight: 1.7 }}>
                                  <strong>Net profit breakdown (USD)</strong>
                                  <div
                                    style={{
                                      marginTop: '8px',
                                      display: 'grid',
                                      gridTemplateColumns: '1fr auto',
                                      maxWidth: '480px',
                                      gap: '4px 24px',
                                    }}
                                  >
                                    {(item.gross_income_usd || 0) > 0 && (
                                      <>
                                        <span>Gross sale revenue</span>
                                        <span style={{ textAlign: 'right' }}>{fmtUsd(item.gross_income_usd)}</span>
                                      </>
                                    )}
                                    {(item.refunds_usd || 0) > 0 && (
                                      <>
                                        <span style={{ paddingLeft: '12px', color: '#666' }}>
                                          − Refunds paid (actual)
                                        </span>
                                        <span style={{ textAlign: 'right', color: '#dc3545' }}>
                                          {fmtUsd(item.refunds_usd)}
                                        </span>
                                      </>
                                    )}
                                    <span>Net revenue</span>
                                    <span style={{ textAlign: 'right' }}>{fmtUsd(item.income_usd)}</span>
                                    {(item.cogs_reversal_usd || 0) > 0 && (
                                      <>
                                        <span style={{ paddingLeft: '12px', color: '#666' }}>
                                          + COGS restored (returns)
                                        </span>
                                        <span style={{ textAlign: 'right', color: '#28a745' }}>
                                          {fmtUsd(item.cogs_reversal_usd)}
                                        </span>
                                      </>
                                    )}
                                    {(item.other_profit_usd || 0) > 0 && (
                                      <>
                                        <span style={{ paddingLeft: '12px', color: '#5e35b1' }}>
                                          Other profit (refund &lt; attributed)
                                        </span>
                                        <span style={{ textAlign: 'right', color: '#5e35b1' }}>
                                          {fmtUsd(item.other_profit_usd)}
                                        </span>
                                      </>
                                    )}
                                    {(item.other_loss_usd || 0) > 0 && (
                                      <>
                                        <span style={{ paddingLeft: '12px', color: '#c62828' }}>
                                          Other loss (refund &gt; attributed)
                                        </span>
                                        <span style={{ textAlign: 'right', color: '#c62828' }}>
                                          {fmtUsd(item.other_loss_usd)}
                                        </span>
                                      </>
                                    )}
                                    <span style={{ paddingLeft: '12px', color: '#666' }}>
                                      − Purchase COGS (supplier + cargo)
                                    </span>
                                    <span style={{ textAlign: 'right' }}>{fmtUsd(bd.purchase_cogs_usd)}</span>
                                    <span style={{ paddingLeft: '24px', color: '#888', fontSize: '0.92em' }}>
                                      Supplier
                                    </span>
                                    <span style={{ textAlign: 'right', color: '#888' }}>
                                      {fmtUsd(bd.supplier_cogs_usd)}
                                    </span>
                                    <span style={{ paddingLeft: '24px', color: '#888', fontSize: '0.92em' }}>
                                      Allocated cargo
                                    </span>
                                    <span style={{ textAlign: 'right', color: '#888' }}>
                                      {fmtUsd(bd.cargo_cogs_usd)}
                                    </span>
                                    <span style={{ paddingLeft: '12px', color: '#666' }}>− Package COGS</span>
                                    <span style={{ textAlign: 'right' }}>{fmtUsd(bd.package_cogs_usd)}</span>
                                    <span style={{ paddingLeft: '12px', color: '#666' }}>− Delivery COGS</span>
                                    <span style={{ textAlign: 'right' }}>{fmtUsd(bd.delivery_cogs_usd)}</span>
                                    <span
                                      style={{
                                        borderTop: '1px solid #ddd',
                                        paddingTop: '6px',
                                        fontWeight: 600,
                                      }}
                                    >
                                      = Net profit (this sale)
                                    </span>
                                    <span
                                      style={{
                                        borderTop: '1px solid #ddd',
                                        paddingTop: '6px',
                                        textAlign: 'right',
                                        fontWeight: 600,
                                        color: item.profit_usd >= 0 ? '#28a745' : '#dc3545',
                                      }}
                                    >
                                      {fmtUsd(item.profit_usd)}
                                    </span>
                                  </div>
                                  <p style={{ margin: '10px 0 0', color: '#888', fontSize: '0.82em' }}>
                                    Operating expenses are not allocated per sale; see the summary cards and
                                    operating expenses table.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                    <td colSpan="4">Totals</td>
                    <td>
                      $
                      {(profitLoss.totals.total_income_usd || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      $
                      {(profitLoss.totals.total_cogs_usd || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td style={{ color: profitLoss.totals.net_profit_usd >= 0 ? '#28a745' : '#dc3545' }}>
                      $
                      {(profitLoss.totals.net_profit_usd || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
                    <SortableTh
                      columnId="expense_type_label"
                      sortCol={operatingExpenseSort.sortCol}
                      sortDir={operatingExpenseSort.sortDir}
                      onSort={operatingExpenseSort.onHeaderClick}
                    >
                      Type
                    </SortableTh>
                    <SortableTh
                      columnId="amount_usd"
                      sortCol={operatingExpenseSort.sortCol}
                      sortDir={operatingExpenseSort.sortDir}
                      onSort={operatingExpenseSort.onHeaderClick}
                    >
                      Amount (USD)
                    </SortableTh>
                    <SortableTh
                      columnId="date"
                      sortCol={operatingExpenseSort.sortCol}
                      sortDir={operatingExpenseSort.sortDir}
                      onSort={operatingExpenseSort.onHeaderClick}
                    >
                      Date
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {profitLoss.operating_expenses.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center' }}>
                        No operating expenses in this period
                      </td>
                    </tr>
                  ) : (
                    sortedOperatingExpenses.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.type}</td>
                        <td>
                          $
                          {(item.amount_usd || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td>{item.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                    <td>Total operating</td>
                    <td>
                      $
                      {(profitLoss.totals.total_operating_expenses_usd || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
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
  );
};

export default ProfitLoss;
