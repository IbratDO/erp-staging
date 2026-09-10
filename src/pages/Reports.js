import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import api from '../utils/api';
import PageTitle from '../components/PageTitle';
import SortableTh from '../components/SortableTh';
import TableDownloadButton from '../components/TableDownloadButton';
import useAppTranslation from '../hooks/useAppTranslation';
import { useClientTableSort } from '../utils/tableSort';
import { formatAppDate, formatAppDateTime } from '../utils/localeFormat';
import { formatDisplayAmount } from '../utils/currencyFormat';
import { categoryTypeLabel } from '../utils/productCategoryTypes';
import {
  buildCurrencyTotals,
  buildTotals,
  formatCount,
  formatPercent,
  profitTone,
  reportsForTab,
  sortAccessors,
} from '../utils/reportDefs';
import './TablePage.css';
import './Reports.css';

/**
 * Hisobotlar — the reports module.
 *
 * One shell for every report. The TZ describes the same page four times over — filters, a Summary
 * block, a table with a «Jami» row, an Excel button — so the shape is written once here and the
 * differences live as data in `utils/reportDefs`. Four hand-written pages would drift exactly the
 * way the two dashboards drifted, and for the same reason: a fix only ever gets applied to the
 * copy somebody was looking at.
 *
 * **Nothing loads until it is asked for.** Each report is a whole scan of stock or of the ledger,
 * and the TZ has the user choose filters and press «Hisobotni shakllantirish». Switching tabs
 * costs nothing until then.
 *
 * **Sorting and paging happen in the browser**, as they do everywhere else in this app. The
 * datasets are the right size for it, and it keeps the «Jami» row and the Excel export describing
 * the same rows the table drew — a server-paged total would describe one page or need a second
 * query that could disagree with the first.
 */

const TABS = ['sotuv', 'ombor', 'moliya'];
const PAGE_SIZE = 50;

/** Today, and the first day of the current month, as `YYYY-MM-DD`. */
function defaultPeriod() {
  const now = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) };
}

export default function Reports() {
  // `inventory` is loaded for `categoryTypes.*`, which is where the Uzbek names for
  // sports/casual already live — the same source every other page reads them from.
  const { t } = useAppTranslation(['reports', 'common', 'inventory']);
  const tr = useCallback((key, opts) => t(key, { ns: 'reports', ...opts }), [t]);

  const [tab, setTab] = useState('sotuv');
  const [reportKey, setReportKey] = useState(reportsForTab('sotuv')[0].key);
  const [filters, setFilters] = useState({ ...defaultPeriod(), min_days: '90' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ transaction_types: [], accounts: [] });
  const tableRef = useRef(null);

  const report = useMemo(
    () => reportsForTab(tab).find((r) => r.key === reportKey) || reportsForTab(tab)[0],
    [tab, reportKey],
  );

  const accessors = useMemo(() => sortAccessors(report.columns), [report]);
  const { sort, onHeaderClick, sortRows } = useClientTableSort(accessors);

  useEffect(() => {
    api.get('/reports/meta/').then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  // A report from another tab cannot be shown; switching tabs picks that tab's first report and
  // drops whatever was on screen, which belonged to a different question.
  useEffect(() => {
    const first = reportsForTab(tab)[0];
    if (first && !reportsForTab(tab).some((r) => r.key === reportKey)) {
      setReportKey(first.key);
    }
    setData(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => { setData(null); setError(''); setPage(1); }, [reportKey]);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (report.needsPeriod) {
        params.start = filters.start;
        params.end = filters.end;
      }
      for (const key of ['warehouse', 'min_days', 'metric', 'grouping', 'brand', 'category',
        'model', 'size', 'color', 'account', 'currency', 'transaction_type',
        'status', 'sale_type', 'salesman', 'giveaway', 'limit']) {
        if (filters[key] !== undefined && filters[key] !== '') params[key] = filters[key];
      }
      const res = await api.get(report.endpoint, { params });
      setData(res.data);
      setPage(1);
    } catch (err) {
      const code = err?.response?.data?.error;
      setError(code === 'period_required' ? tr('errPeriod') : tr('errLoad'));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => sortRows(data?.rows || []), [data, sortRows]);
  const totals = useMemo(() => buildTotals(report.columns, rows), [report, rows]);
  const currencyTotals = useMemo(
    () => buildCurrencyTotals(report.columns, rows), [report, rows],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const pair = (usd, uzs) => {
    const parts = [];
    if (Number(usd)) parts.push(formatDisplayAmount(usd, 'USD'));
    if (Number(uzs)) parts.push(formatDisplayAmount(uzs, 'UZS'));
    return parts.length ? parts.join(' + ') : '—';
  };

  /** One table cell, formatted the way its column declares. */
  const cell = (col, row) => {
    const raw = row[col.key];
    switch (col.type) {
      case 'int':
        return formatCount(raw);
      case 'percent':
        return formatPercent(raw);
      case 'money':
        return formatDisplayAmount(raw, col.currency || 'USD');
      case 'rowMoney':
        // The row knows its own currency — a ledger line is som or dollars, never both.
        return Number(raw) ? formatDisplayAmount(raw, row.currency) : '—';
      case 'pair':
        return pair(row[col.usd], row[col.uzs]);
      case 'date':
        return raw ? formatAppDate(raw) : '—';
      case 'datetime':
        return raw ? formatAppDateTime(raw) : '—';
      case 'warehouse':
        return tr(`warehouse.${raw}`, raw);
      case 'groupName':
        // ABC's first column is whatever it grouped by, so it is only a category type some of
        // the time — and only then does it need translating out of English.
        return data?.grouping === 'category_type'
          ? (categoryTypeLabel(raw, t) || '—')
          : (raw || '—');
      case 'txType':
        return tr(`txType.${raw}`, raw);
      case 'bandChip':
        return <span className={`report-band report-band--${raw}`}>{raw}</span>;
      case 'yesNo':
        // A giveaway is the exception worth seeing, so only the "yes" is marked; a column of
        // "no" down every row would be noise.
        return raw ? <span className="report-free">{tr('yes')}</span> : '—';
      case 'saleType':
        return tr(`saleType.${raw}`, raw);
      case 'saleStatus':
        return <span className={`report-status report-status--${raw}`}>{tr(`status.${raw}`, raw)}</span>;
      case 'reason':
        return tr(`reason.${raw}`, raw || '—');
      case 'lastSold':
        // Never sold is the finding, not a gap in the data, so it is named rather than left blank.
        return row.never_sold
          ? <span className="report-never-sold">{tr('aging.neverSoldMark')}</span>
          : (raw ? formatAppDate(raw) : '—');
      default:
        return raw === null || raw === undefined || raw === '' ? '—' : String(raw);
    }
  };

  const summaryCards = () => {
    if (!data?.summary) return null;
    if (report.summary === 'perCurrency') {
      return (data.summary.per_currency || []).map((c) => (
        <div className="report-card report-card--wide" key={c.currency}>
          <div className="report-card__label">{c.currency}</div>
          <div className="report-card__rows">
            <div><span>{tr('cash.opening')}</span><strong>{formatDisplayAmount(c.opening, c.currency)}</strong></div>
            <div><span>{tr('cash.in')}</span><strong>{formatDisplayAmount(c.in_total, c.currency)}</strong></div>
            <div><span>{tr('cash.out')}</span><strong>{formatDisplayAmount(c.out_total, c.currency)}</strong></div>
            <div><span>{tr('cash.net')}</span><strong>{formatDisplayAmount(c.net, c.currency)}</strong></div>
            <div className="report-card__total"><span>{tr('cash.closing')}</span><strong>{formatDisplayAmount(c.closing, c.currency)}</strong></div>
          </div>
        </div>
      ));
    }
    return (report.summary || []).map((card) => {
      let value;
      if (card.type === 'pair') value = pair(data.summary[card.usd], data.summary[card.uzs]);
      else if (card.type === 'band') {
        const band = (data.summary.bands || []).find((b) => b.band === card.band);
        value = band ? `${band.items} · ${(Number(band.share) || 0).toFixed(1)}%` : '—';
      } else if (card.type === 'money') {
        value = formatDisplayAmount(data.summary[card.key], card.currency || 'USD');
      } else if (card.type === 'percent') {
        value = formatPercent(data.summary[card.key]);
      } else {
        // The branch that used to catch everything. A raw `Number()` here is what put
        // 29.930161914131648 on screen where the report meant 29.9%.
        value = formatCount(data.summary[card.key]);
      }
      // A profit card is coloured by what it says, not by being important: green when the shop
      // earned, red when it lost, plain when the two currencies disagree.
      const tone = card.tone === 'profit'
        ? profitTone(data.summary[card.usd], data.summary[card.uzs])
        : '';
      const classes = ['report-card'];
      if (card.emphasis) classes.push('report-card--emphasis');
      if (tone) classes.push(`report-card--${tone}`);
      return (
        <div className={classes.join(' ')} key={card.key}>
          <div className="report-card__label">{tr(card.labelKey)}</div>
          <div className="report-card__value">{value}</div>
        </div>
      );
    });
  };

  const has = (name) => (report.filters || []).includes(name);

  return (
    <div className="page-container">
      <div className="page-header">
        <PageTitle ns="reports" />
      </div>

      <div className="report-tabs">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className={`report-tab${tab === name ? ' report-tab--active' : ''}`}
            onClick={() => setTab(name)}
          >
            {tr(`tab.${name}`)}
          </button>
        ))}
      </div>

      <div className="report-picker">
        {reportsForTab(tab).map((r) => (
          <button
            key={r.key}
            type="button"
            className={`report-pick${report.key === r.key ? ' report-pick--active' : ''}`}
            onClick={() => setReportKey(r.key)}
          >
            {tr(r.titleKey)}
          </button>
        ))}
      </div>

      <p className="report-hint">{tr(report.hintKey)}</p>

      <div className="report-filters">
        {has('period') && (
          <>
            <label>
              {tr('filter.from')}
              <input type="date" value={filters.start || ''} onChange={(e) => set('start', e.target.value)} />
            </label>
            <label>
              {tr('filter.to')}
              <input type="date" value={filters.end || ''} onChange={(e) => set('end', e.target.value)} />
            </label>
          </>
        )}
        {has('minDays') && (
          <label>
            {tr('filter.minDays')}
            <select value={filters.min_days ?? '90'} onChange={(e) => set('min_days', e.target.value)}>
              {['0', '30', '60', '90', '120', '180', '365'].map((d) => (
                <option key={d} value={d}>{d === '0' ? tr('filter.allStock') : tr('filter.days', { d })}</option>
              ))}
            </select>
          </label>
        )}
        {has('warehouse') && (
          <label>
            {tr('filter.warehouse')}
            <select value={filters.warehouse || ''} onChange={(e) => set('warehouse', e.target.value)}>
              <option value="">{tr('warehouse.all')}</option>
              <option value="main">{tr('warehouse.main')}</option>
              <option value="packaging">{tr('warehouse.packaging')}</option>
            </select>
          </label>
        )}
        {has('metric') && (
          <label>
            {tr('filter.metric')}
            <select value={filters.metric || 'revenue'} onChange={(e) => set('metric', e.target.value)}>
              <option value="revenue">{tr('abc.metricRevenue')}</option>
              <option value="profit">{tr('abc.metricProfit')}</option>
            </select>
          </label>
        )}
        {has('grouping') && (
          <label>
            {tr('filter.grouping')}
            <select value={filters.grouping || 'model'} onChange={(e) => set('grouping', e.target.value)}>
              <option value="model">{tr('abc.byModel')}</option>
              <option value="brand">{tr('abc.byBrand')}</option>
              <option value="category">{tr('abc.byCategory')}</option>
              <option value="category_type">{tr('abc.byCategoryType')}</option>
            </select>
          </label>
        )}
        {has('account') && (
          <label>
            {tr('filter.account')}
            <select value={filters.account || ''} onChange={(e) => set('account', e.target.value)}>
              <option value="">{tr('filter.allAccounts')}</option>
              {(meta.accounts || []).map((a) => (
                <option key={a.value} value={a.value}>{a.value}</option>
              ))}
            </select>
          </label>
        )}
        {has('currency') && (
          <label>
            {tr('filter.currency')}
            <select value={filters.currency || ''} onChange={(e) => set('currency', e.target.value)}>
              <option value="">{tr('filter.allCurrencies')}</option>
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
            </select>
          </label>
        )}
        {has('transactionType') && (
          <label>
            {tr('filter.operation')}
            <select
              value={filters.transaction_type || ''}
              onChange={(e) => set('transaction_type', e.target.value)}
            >
              <option value="">{tr('filter.allOperations')}</option>
              {(meta.transaction_types || []).map((x) => (
                <option key={x} value={x}>{tr(`txType.${x}`, x)}</option>
              ))}
            </select>
          </label>
        )}
        {has('status') && (
          <label>
            {tr('filter.status')}
            <select value={filters.status || 'completed'} onChange={(e) => set('status', e.target.value)}>
              <option value="completed">{tr('status.completed')}</option>
              <option value="returned">{tr('status.returned')}</option>
              <option value="all">{tr('filter.allStatuses')}</option>
            </select>
          </label>
        )}
        {has('saleType') && (
          <label>
            {tr('filter.saleType')}
            <select value={filters.sale_type || ''} onChange={(e) => set('sale_type', e.target.value)}>
              <option value="">{tr('filter.allTypes')}</option>
              <option value="bought_from_shop">{tr('saleType.bought_from_shop')}</option>
              <option value="delivery">{tr('saleType.delivery')}</option>
            </select>
          </label>
        )}
        {has('salesman') && (
          <label>
            {tr('filter.salesman')}
            <select value={filters.salesman || ''} onChange={(e) => set('salesman', e.target.value)}>
              <option value="">{tr('filter.allSalesmen')}</option>
              {(meta.salesmen || []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        {has('giveaway') && (
          <label>
            {tr('filter.giveaway')}
            <select value={filters.giveaway || ''} onChange={(e) => set('giveaway', e.target.value)}>
              <option value="">{tr('filter.giveawayInclude')}</option>
              <option value="exclude">{tr('filter.giveawayExclude')}</option>
              <option value="only">{tr('filter.giveawayOnly')}</option>
            </select>
          </label>
        )}
        {has('limit') && (
          <label>
            {tr('filter.topN')}
            <select value={filters.limit || ''} onChange={(e) => set('limit', e.target.value)}>
              <option value="">{tr('filter.allRows')}</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
        )}
        {has('catalogue') && (
          <label>
            {tr('filter.brand')}
            <input
              type="text"
              value={filters.brand || ''}
              placeholder={tr('filter.anyBrand')}
              onChange={(e) => set('brand', e.target.value)}
            />
          </label>
        )}
        <button type="button" className="btn-primary" onClick={run} disabled={loading}>
          {loading ? t('actions.loading', { ns: 'common' }) : tr('build')}
        </button>
      </div>

      {error && <div className="notification error" style={{ marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div className="report-summary">{summaryCards()}</div>

          {/* ABC is the one report that has to combine the currencies to work out a share, so it
              says at what rate rather than leaving the reader to wonder. */}
          {data.rate ? (
            <p className="report-hint">{tr('abc.rateNote', { rate: Number(data.rate).toFixed(2) })}</p>
          ) : null}
          {data.filtered_by_type ? (
            <p className="report-hint report-hint--warn">{tr('cash.filteredNote')}</p>
          ) : null}

          <div className="table-card">
            <div className="table-card__toolbar">
              <TableDownloadButton
                tableRef={tableRef}
                filename={`hisobot-${report.key}`}
                rowCount={rows.length}
              />
            </div>
            <div className="data-table-scroll">
              <table className="data-table" ref={tableRef}>
                <thead>
                  <tr>
                    {report.columns.map((col) => (
                      <SortableTh
                        key={col.key}
                        col={col.key}
                        sort={sort}
                        onClick={onHeaderClick}
                      >
                        {tr(col.labelKey)}
                      </SortableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={report.columns.length} style={{ textAlign: 'center' }}>
                        {tr('noRows')}
                      </td>
                    </tr>
                  ) : visible.map((row) => (
                    <tr key={row.key}>
                      {report.columns.map((col) => (
                        <td key={col.key}>{cell(col, row)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="report-total-row">
                      {report.columns.map((col, i) => {
                        if (i === 0) return <td key={col.key}><strong>{tr('total')}</strong></td>;
                        if (currencyTotals[col.key]) {
                          const v = currencyTotals[col.key];
                          return <td key={col.key}><strong>{pair(v.usd, v.uzs)}</strong></td>;
                        }
                        if (totals[col.key] !== undefined) {
                          // `sumField` adds floats, so even a tidy column of money can total
                          // 12343.879999999999. Rounded by the same rule as the cells above it.
                          const value = col.type === 'money'
                            ? formatDisplayAmount(totals[col.key], col.currency || 'USD')
                            : formatCount(totals[col.key]);
                          return <td key={col.key}><strong>{value}</strong></td>;
                        }
                        return <td key={col.key} />;
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {pageCount > 1 && (
              <div className="report-pager">
                <button type="button" className="btn-edit" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ←
                </button>
                <span>{tr('page', { page, pages: pageCount, rows: rows.length })}</span>
                <button type="button" className="btn-edit" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <p className="report-hint">{tr('pressBuild')}</p>
      )}
    </div>
  );
}
