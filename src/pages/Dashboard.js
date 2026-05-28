import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildMonthlyStacked,
  buildWeekdayAveragesFixed,
  CHART_PALETTE,
  crossFilterSummary,
  EMPTY_CROSS_FILTER,
  filterFacts,
  toggleCrossFilter,
} from '../utils/dashboardAnalytics';
import ManagementKpisSection from '../components/ManagementKpisSection';
import PenaltyDashboardCard from '../components/PenaltyDashboardCard';
import { usePermissions } from '../hooks/usePermissions';
import './Dashboard.css';

const MONTH_OPTIONS = [
  { value: '', label: 'All months' },
  ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
    (label, i) => ({ value: String(i + 1), label }),
  ),
];

function KpiCard({ label, value, sub }) {
  return (
    <div className="dash-kpi-card">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub ? <div className="dash-kpi-sub">{sub}</div> : null}
    </div>
  );
}

function ChartPanel({
  title,
  data,
  seriesKeys,
  xKey,
  chartType,
  onLegendClick,
  activeCross,
}) {
  const height = 280;

  const legendProps = {
    onClick: (e) => {
      const key = e?.value;
      if (!key || !onLegendClick) return;
      onLegendClick(key);
    },
    wrapperStyle: { cursor: 'pointer', fontSize: 12 },
  };

  const tooltipStyle = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
  };

  if (!data?.length) {
    return (
      <div className="dash-chart-card">
        <h3>{title}</h3>
        <p className="dash-empty">No data for current filters</p>
      </div>
    );
  }

  return (
    <div className="dash-chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        {chartType === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend {...legendProps} />
            {seriesKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                fillOpacity={activeCross && activeCross !== key ? 0.25 : 0.75}
                strokeWidth={activeCross === key ? 2.5 : 1}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={chartType === 'weekday'} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend {...legendProps} />
            {seriesKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="stack"
                fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                fillOpacity={activeCross && activeCross !== key ? 0.35 : 0.9}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const DASH_TAB_SALES = 'sales';
const DASH_TAB_MANAGEMENT = 'management';

const Dashboard = () => {
  const { hasPermission } = usePermissions();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [crossFilter, setCrossFilter] = useState(EMPTY_CROSS_FILTER);
  const [activeTab, setActiveTab] = useState(DASH_TAB_SALES);

  const loadAnalytics = useCallback(async (y) => {
    try {
      const res = await api.get('/dashboard/analytics/', { params: { year: y } });
      setAnalytics(res.data);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAnalytics(year);
  }, [year, loadAnalytics]);

  const monthNum = month ? parseInt(month, 10) : null;

  const filteredFacts = useMemo(() => {
    if (!analytics?.facts) return [];
    return filterFacts(analytics.facts, {
      year: analytics.year,
      month: monthNum,
      crossFilter,
    });
  }, [analytics, monthNum, crossFilter]);

  const monthlyUsers = useMemo(
    () => buildMonthlyStacked(filteredFacts, 'salesman_name'),
    [filteredFacts],
  );
  const monthlyCategories = useMemo(
    () => buildMonthlyStacked(filteredFacts, 'category'),
    [filteredFacts],
  );
  const monthlyCustomers = useMemo(
    () => buildMonthlyStacked(filteredFacts, 'customer_type'),
    [filteredFacts],
  );

  const weekdayUsers = useMemo(
    () => buildWeekdayAveragesFixed(filteredFacts, 'salesman_name'),
    [filteredFacts],
  );
  const weekdayCategories = useMemo(
    () => buildWeekdayAveragesFixed(filteredFacts, 'category'),
    [filteredFacts],
  );
  const weekdayCustomers = useMemo(
    () => buildWeekdayAveragesFixed(filteredFacts, 'customer_type'),
    [filteredFacts],
  );

  const handleLegendUser = (name) => {
    setCrossFilter((c) => toggleCrossFilter(c, { salesman: name }));
  };
  const handleLegendCategory = (name) => {
    setCrossFilter((c) => toggleCrossFilter(c, { category: name }));
  };
  const handleLegendCustomer = (name) => {
    setCrossFilter((c) => toggleCrossFilter(c, { customerType: name }));
  };

  const clearCrossFilter = () => setCrossFilter(EMPTY_CROSS_FILTER);

  const kpis = analytics?.kpis;
  const filterHint = crossFilterSummary(crossFilter);
  const canToggleDashboardTabs = hasPermission('dashboard.ceo');
  const isExecutiveView = canToggleDashboardTabs || Boolean(analytics?.company_wide);

  if (loading) {
    return <div className="page-container">Loading dashboard…</div>;
  }
  if (error) {
    return <div className="page-container error">{error}</div>;
  }

  return (
    <div className="dashboard dash-bi">
      <header className="dash-header dash-header-page">
        <div>
          <h1>Dashboard</h1>
          <p className="dash-subtitle">
            {isExecutiveView
              ? 'Executive overview'
              : analytics?.company_wide
                ? 'Company-wide insights'
                : 'Your performance · today'}
            {activeTab === DASH_TAB_SALES && filterHint ? ` · Filtered: ${filterHint}` : ''}
          </p>
        </div>
      </header>

      {canToggleDashboardTabs ? (
        <div className="dash-tab-bar" role="tablist" aria-label="Dashboard views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === DASH_TAB_MANAGEMENT}
            className={
              activeTab === DASH_TAB_MANAGEMENT ? 'dash-tab active' : 'dash-tab'
            }
            onClick={() => setActiveTab(DASH_TAB_MANAGEMENT)}
          >
            Management KPIs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === DASH_TAB_SALES}
            className={activeTab === DASH_TAB_SALES ? 'dash-tab active' : 'dash-tab'}
            onClick={() => setActiveTab(DASH_TAB_SALES)}
          >
            Sales analytics
          </button>
        </div>
      ) : null}

      {canToggleDashboardTabs && activeTab === DASH_TAB_MANAGEMENT ? (
        <ManagementKpisSection
          roleCode={analytics?.role_code}
          availableYears={analytics?.available_years}
          active
        />
      ) : null}

      {(!canToggleDashboardTabs || activeTab === DASH_TAB_SALES) && (
        <>
      <PenaltyDashboardCard />
      <header className="dash-header">
        <div>
          <p className="dash-subtitle dash-subtitle-section">
            Today&apos;s KPIs and chart filters
          </p>
        </div>
        <div className="dash-filters">
          <label>
            Year
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
            >
              {(analytics?.available_years || [year]).map((y) => (
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
          {filterHint ? (
            <button type="button" className="dash-clear-filter" onClick={clearCrossFilter}>
              Clear chart filters
            </button>
          ) : null}
        </div>
      </header>

      <section className="dash-kpi-row">
        <KpiCard
          label="Sold units (today)"
          value={(kpis?.sold_units ?? 0).toLocaleString()}
          sub={kpis?.scope === 'own' ? 'Your sales only' : 'All users'}
        />
        <KpiCard
          label="Sales revenue (today)"
          value={`$${(kpis?.revenue_usd ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`}
          sub={
            (kpis?.revenue_uzs ?? 0) > 0
              ? `${kpis.revenue_uzs.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
              : null
          }
        />
        <KpiCard
          label="Orders (today)"
          value={(kpis?.total_orders ?? 0).toLocaleString()}
        />
        <KpiCard
          label="Returns (today)"
          value={(kpis?.total_returns ?? 0).toLocaleString()}
          sub="Returned units"
        />
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Monthly performance</h2>
        <p className="dash-section-hint">
          Click a legend item to cross-filter all charts. Month/year filters apply here only.
        </p>
        <div className="dash-charts-row">
          <ChartPanel
            title="Units sold by user"
            data={monthlyUsers.data}
            seriesKeys={monthlyUsers.keys}
            xKey="monthLabel"
            chartType="bar"
            onLegendClick={handleLegendUser}
            activeCross={crossFilter.salesman}
          />
          <ChartPanel
            title="Units sold by category"
            data={monthlyCategories.data}
            seriesKeys={monthlyCategories.keys}
            xKey="monthLabel"
            chartType="bar"
            onLegendClick={handleLegendCategory}
            activeCross={crossFilter.category}
          />
          <ChartPanel
            title="New vs existing customers"
            data={monthlyCustomers.data}
            seriesKeys={monthlyCustomers.keys}
            xKey="monthLabel"
            chartType="area"
            onLegendClick={handleLegendCustomer}
            activeCross={crossFilter.customerType}
          />
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Weekday averages</h2>
        <p className="dash-section-hint">
          Average units per weekday within the selected period (respects cross-filters).
        </p>
        <div className="dash-charts-row">
          <ChartPanel
            title="Avg units by user"
            data={weekdayUsers.data}
            seriesKeys={weekdayUsers.keys}
            xKey="weekday_label"
            chartType="weekday"
            onLegendClick={handleLegendUser}
            activeCross={crossFilter.salesman}
          />
          <ChartPanel
            title="Avg units by category"
            data={weekdayCategories.data}
            seriesKeys={weekdayCategories.keys}
            xKey="weekday_label"
            chartType="weekday"
            onLegendClick={handleLegendCategory}
            activeCross={crossFilter.category}
          />
          <ChartPanel
            title="Avg units · customer type"
            data={weekdayCustomers.data}
            seriesKeys={weekdayCustomers.keys}
            xKey="weekday_label"
            chartType="bar"
            onLegendClick={handleLegendCustomer}
            activeCross={crossFilter.customerType}
          />
        </div>
      </section>
        </>
      )}

    </div>
  );
};

export default Dashboard;
