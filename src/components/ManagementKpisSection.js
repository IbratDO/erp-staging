import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_PALETTE } from '../utils/dashboardAnalytics';

const MONTH_OPTIONS = [
  { value: '', label: 'All months' },
  ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
    (label, i) => ({ value: String(i + 1), label }),
  ),
];

function fmtUsd(n) {
  return `$${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return 'N/A';
  return `${n.toFixed(1)}%`;
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="mgmt-toggle-group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'mgmt-toggle active' : 'mgmt-toggle'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MgmtCard({ label, value, sub }) {
  return (
    <div className="mgmt-kpi-card">
      <div className="mgmt-kpi-label">{label}</div>
      <div className="mgmt-kpi-value">{value}</div>
      {sub ? <div className="mgmt-kpi-sub">{sub}</div> : null}
    </div>
  );
}

function MgmtChart({ title, children, controls }) {
  return (
    <div className="mgmt-chart-card">
      <div className="mgmt-chart-head">
        <h4>{title}</h4>
        {controls || null}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 13,
};

export default function ManagementKpisSection({ roleCode, availableYears, active }) {
  const show = roleCode === 'admin' || roleCode === 'ceo';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnoverLoading, setTurnoverLoading] = useState(false);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [expensesGranularity, setExpensesGranularity] = useState('monthly');
  const [marketingGranularity, setMarketingGranularity] = useState('weekly');

  const load = useCallback(async () => {
    if (!show || !active) return;
    setLoading(true);
    setTurnoverLoading(true);
    setError(null);
    const params = {
      year,
      month: month || undefined,
      expenses_granularity: expensesGranularity,
      marketing_sold_granularity: marketingGranularity,
    };
    try {
      const res = await api.get('/dashboard/management-kpis/', {
        params: { ...params, include_turnover: false },
      });
      setData(res.data);
      setLoading(false);

      api
        .get('/dashboard/management-kpis/', { params: { ...params, turnover_only: true } })
        .then((turnRes) => {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  capital_turnover_monthly: turnRes.data.capital_turnover_monthly,
                  roi_monthly: turnRes.data.roi_monthly,
                  snapshot: turnRes.data.snapshot,
                  turnover_pending: false,
                }
              : turnRes.data,
          );
        })
        .catch((e) => console.error('Turnover KPIs load failed', e))
        .finally(() => setTurnoverLoading(false));
    } catch (e) {
      console.error(e);
      setError('Failed to load management KPIs');
      setLoading(false);
      setTurnoverLoading(false);
    }
  }, [year, month, expensesGranularity, marketingGranularity, show, active]);

  useEffect(() => {
    if (show && active) load();
    else setLoading(false);
  }, [load, show, active]);

  const managerSeries = data?.manager_margin_monthly;
  const managerKeys = managerSeries?.months || [];
  const managerChartData = useMemo(() => {
    if (!managerSeries?.series?.length || !managerKeys.length) return [];
    return managerKeys.map((ml, idx) => {
      const row = { monthLabel: ml };
      managerSeries.series.forEach((s) => {
        row[s.manager] = s[ml] ?? 0;
      });
      return row;
    });
  }, [managerSeries, managerKeys]);

  const managerNames = managerSeries?.series?.map((s) => s.manager) || [];

  const snapshot = data?.snapshot;

  if (!show || !active) return null;

  if (loading && !data) {
    return (
      <section className="mgmt-section">
        <p className="mgmt-loading">Loading management KPIs…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mgmt-section">
        <p className="mgmt-error">{error}</p>
      </section>
    );
  }

  return (
    <section className="mgmt-section">
      <div className="mgmt-section-header">
        <div className="mgmt-filters">
          <label>
            Year
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {(availableYears || [year]).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTH_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mgmt-cards-row">
        <MgmtCard
          label="Total USD balance"
          value={fmtUsd(data?.money_balance?.total_usd)}
          sub="Same as Money Balance tab"
        />
        <MgmtCard
          label="Total UZS balance"
          value={(data?.money_balance?.total_uzs ?? 0).toLocaleString()}
          sub="Native UZS ledger total"
        />
        <MgmtCard
          label="Paid, not received"
          value={(data?.paid_not_received_units ?? 0).toLocaleString()}
          sub="Prepaid order units awaiting stock"
        />
        <MgmtCard
          label="Capital turnover"
          value={
            turnoverLoading || data?.turnover_pending
              ? '…'
              : snapshot?.capital_turnover?.value_na
                ? 'N/A'
                : (snapshot?.capital_turnover?.value ?? 0).toFixed(2)
          }
          sub={
            turnoverLoading || data?.turnover_pending
              ? 'Loading asset-based metrics…'
              : snapshot?.capital_turnover?.month_label || 'Latest month'
          }
        />
        <MgmtCard
          label="ROI"
          value={
            turnoverLoading || data?.turnover_pending
              ? '…'
              : snapshot?.roi?.value_na
                ? 'N/A'
                : fmtPct(snapshot?.roi?.value)
          }
          sub={
            turnoverLoading || data?.turnover_pending
              ? 'Loading asset-based metrics…'
              : snapshot?.roi?.month_label || 'Latest month'
          }
        />
      </div>

      <div className="mgmt-grid">
        <MgmtChart title="Monthly net profit (USD)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data?.net_profit_monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtUsd(v)} />
              <Line
                type="monotone"
                dataKey="net_profit_usd"
                name="Net profit"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart title="Sales manager gross margin (USD)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={managerChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {managerNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart
          title="Other financial expenses (USD equiv.)"
          controls={
            <ToggleGroup
              value={expensesGranularity}
              onChange={setExpensesGranularity}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data?.other_expenses_trend?.points || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload;
                  return (
                    <div style={tooltipStyle}>
                      <div>
                        <strong>{label}</strong>
                      </div>
                      <div>Total (USD equiv.): {fmtUsd(p?.total_usd)}</div>
                      {(p?.usd_native ?? 0) > 0 && (
                        <div>USD expenses: {fmtUsd(p.usd_native)}</div>
                      )}
                      {(p?.uzs_native ?? 0) > 0 && (
                        <div>
                          UZS expenses: {p.uzs_native.toLocaleString()} UZS
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="total_usd"
                name="Total USD"
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart title="Shop vs delivery (units sold)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.shop_vs_delivery_monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="shop" name="Shop" stackId="a" fill="#0ea5e9" />
              <Bar dataKey="delivery" name="Delivery" stackId="a" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart title="Slow-moving inventory (units)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.inventory_aging_monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="age_3_5" name="3–5 mo" stackId="age" fill="#f59e0b" />
              <Bar dataKey="age_5_8" name="5–8 mo" stackId="age" fill="#ea580c" />
              <Bar dataKey="age_8_plus" name="8+ mo" stackId="age" fill="#b91c1c" />
            </BarChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart
          title="Marketing expense per sold item"
          controls={
            <ToggleGroup
              value={marketingGranularity}
              onChange={setMarketingGranularity}
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.marketing_per_sold_item?.points || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload;
                  return (
                    <div style={tooltipStyle} className="mgmt-tooltip">
                      <div>
                        <strong>{label}</strong>
                      </div>
                      <div>Marketing: {fmtUsd(p?.marketing_expenses_usd)}</div>
                      <div>Sold units: {p?.sold_units}</div>
                      <div>
                        Per item:{' '}
                        {p?.value_na ? 'N/A' : fmtUsd(p?.value)}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" name="USD / unit" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart title="Marketing expense per new customer (weekly)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.marketing_per_new_customer_weekly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload;
                  return (
                    <div style={tooltipStyle}>
                      <div>
                        <strong>{label}</strong>
                      </div>
                      <div>Marketing: {fmtUsd(p?.marketing_expenses_usd)}</div>
                      <div>New customers: {p?.new_customers}</div>
                      <div>Per customer: {p?.value_na ? 'N/A' : fmtUsd(p?.value)}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" name="USD / customer" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart title="Capital turnover (monthly)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data?.capital_turnover_monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="value"
                name="Turnover"
                stroke="#0891b2"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </MgmtChart>

        <MgmtChart title="ROI % (monthly)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data?.roi_monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" />
              <Tooltip
                contentStyle={tooltipStyle}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload;
                  return (
                    <div style={tooltipStyle}>
                      <div>
                        <strong>{label}</strong>
                      </div>
                      <div>Net profit: {fmtUsd(p?.net_profit_usd)}</div>
                      <div>Beginning assets: {fmtUsd(p?.beginning_assets_usd)}</div>
                      <div>ROI: {p?.value_na ? 'N/A' : fmtPct(p?.value)}</div>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="value" name="ROI %" stroke="#7c3aed" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </MgmtChart>

        <div className="mgmt-chart-card mgmt-top-products">
          <h4>Top 5 products (selected period)</h4>
          {!data?.top_products?.length ? (
            <p className="mgmt-empty">No sales in period</p>
          ) : (
            <ol className="mgmt-product-list">
              {data.top_products.map((p, i) => (
                <li key={`${p.brand}-${p.model}-${i}`}>
                  <span className="mgmt-rank">{i + 1}</span>
                  <span className="mgmt-product-detail">
                    {[p.category_type, p.brand, p.model, p.color].filter(Boolean).join(' · ')}
                  </span>
                  <span className="mgmt-product-units">{p.units} units</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
