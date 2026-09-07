import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import i18n from '../i18n';
import {
  buildMonthlyStacked,
  buildNetMonthlyStacked,
  buildNetWeekdayAverages,
  buildTopSlots,
  filterReturnFacts,
  crossFilterSummary,
  EMPTY_CROSS_FILTER,
  filterFacts,
  toggleCrossFilter,
} from '../utils/dashboardAnalytics';
import { CategoryTopSlotsChart, ChartPanel } from '../components/dashboardCharts';
import ManagementKpisSectionLegacy, { ToggleGroup } from '../components/ManagementKpisSectionLegacy';
import PenaltyDashboardCard from '../components/PenaltyDashboardCard';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';
import { formatAppDate } from '../utils/localeFormat';
import './Dashboard.css';

function KpiCard({ label, value, sub }) {
  return (
    <div className="dash-kpi-card">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub ? <div className="dash-kpi-sub">{sub}</div> : null}
    </div>
  );
}

const DASH_TAB_SALES = 'sales';
const DASH_TAB_MANAGEMENT = 'management';

const DashboardLegacy = () => {
  const { hasPermission, roleCode, isTargetolog, isAdmin } = usePermissions();
  const { t, monthOptions } = useAppTranslation(['dashboard', 'common']);
  const td = (key, opts) => t(key, { ns: 'dashboard', ...opts });
  const targetologView = isTargetolog || roleCode === 'targetolog';
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [crossFilter, setCrossFilter] = useState(EMPTY_CROSS_FILTER);
  // Changes what each weekday bar is an average *of* — months, or single weeks. The bars
  // stay the seven weekdays either way.
  const [weekdayGranularity, setWeekdayGranularity] = useState('monthly');
  const [activeTab, setActiveTab] = useState(DASH_TAB_SALES);
  const [cbuRate, setCbuRate] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      setActiveTab(DASH_TAB_MANAGEMENT);
    }
  }, [isAdmin]);

  const loadAnalytics = useCallback(async (y) => {
    try {
      const res = await api.get('/dashboard/analytics/', { params: { year: y } });
      setAnalytics(res.data);
      setError(null);
    } catch (err) {
      setError(i18n.t('analyticsLoadError', { ns: 'dashboard' }));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAnalytics(year);
  }, [year, loadAnalytics]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/exchange-rate/')
      .then((res) => {
        if (!cancelled) setCbuRate(res.data || null);
      })
      .catch(() => {
        if (!cancelled) setCbuRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const monthNum = month ? parseInt(month, 10) : null;

  const filteredFacts = useMemo(() => {
    if (!analytics?.facts) return [];
    return filterFacts(analytics.facts, {
      year: analytics.year,
      month: monthNum,
      crossFilter,
    });
  }, [analytics, monthNum, crossFilter]);

  const filteredReturnFacts = useMemo(() => {
    if (!analytics?.return_facts) return [];
    return filterReturnFacts(analytics.return_facts, {
      year: analytics.year,
      month: monthNum,
      crossFilter,
    });
  }, [analytics, monthNum, crossFilter]);

  const monthlyUsers = useMemo(
    () => buildNetMonthlyStacked(filteredFacts, filteredReturnFacts, 'salesman_name'),
    [filteredFacts, filteredReturnFacts],
  );
  const monthlyOrdersByUser = useMemo(
    () => buildMonthlyStacked(filteredFacts, 'salesman_name', () => 1),
    [filteredFacts],
  );
  const monthlyCategories = useMemo(
    () => buildNetMonthlyStacked(filteredFacts, filteredReturnFacts, 'category'),
    [filteredFacts, filteredReturnFacts],
  );
  // Each bar keeps its own biggest five and groups the rest. Without this the chart draws one
  // series per category that has ever sold, so a bar names the whole catalogue on hover with
  // most of it at zero.
  const monthlyCategoryTop = useMemo(
    () => buildTopSlots(monthlyCategories, 5),
    [monthlyCategories],
  );
  const monthlyCustomers = useMemo(
    () => buildNetMonthlyStacked(filteredFacts, filteredReturnFacts, 'customer_type'),
    [filteredFacts, filteredReturnFacts],
  );

  const weekdayUsers = useMemo(
    () => buildNetWeekdayAverages(
      filteredFacts, filteredReturnFacts, 'salesman_name', weekdayGranularity,
    ),
    [filteredFacts, filteredReturnFacts, weekdayGranularity],
  );
  const weekdayCategories = useMemo(
    () => buildNetWeekdayAverages(filteredFacts, filteredReturnFacts, 'category'),
    [filteredFacts, filteredReturnFacts],
  );
  const weekdayCategoryTop = useMemo(
    () => buildTopSlots(weekdayCategories, 5),
    [weekdayCategories],
  );
  const weekdayCustomers = useMemo(
    () => buildNetWeekdayAverages(filteredFacts, filteredReturnFacts, 'customer_type'),
    [filteredFacts, filteredReturnFacts],
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
  const canToggleDashboardTabs = hasPermission('dashboard.ceo') && !targetologView;
  const isExecutiveView = canToggleDashboardTabs || Boolean(analytics?.company_wide);
  const canViewMarketingKpis = hasPermission('marketing_analytics.view');

  const cbuRateLine = useMemo(() => {
    if (!cbuRate?.rate) return null;
    const rateNum = Number(cbuRate.rate);
    if (!Number.isFinite(rateNum)) return null;
    const dateLabel = cbuRate.rate_date ? formatAppDate(cbuRate.rate_date) : '';
    return t('cbuRateLine', {
      ns: 'dashboard',
      rate: rateNum.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      date: dateLabel,
    });
  }, [cbuRate, t]);

  if (loading) {
    return <div className="page-container">{td('loading')}</div>;
  }
  if (error) {
    return <div className="page-container error">{error}</div>;
  }

  const chartEmpty = td('noChartData');
  const categoryChartLabels = {
    others: td('chartOthers'),
    othersCount: (count) => td('chartOthersCount', { count }),
    total: td('chartMonthTotal'),
  };

  const formatRefundSummary = (usd, uzs) => {
    const parts = [];
    if ((usd ?? 0) > 0) {
      parts.push(
        `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      );
    }
    if ((uzs ?? 0) > 0) {
      parts.push(`${uzs.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`);
    }
    return parts.join(' · ');
  };

  return (
    <div className="dashboard dash-bi">
      <header className="dash-header dash-header-page">
        <div>
          <h1>{td('title')}</h1>
          <p className="dash-subtitle">
            {isExecutiveView
              ? td('subtitleExecutive')
              : analytics?.company_wide
                ? td('subtitleCompany')
                : td('subtitleOwn')}
            {activeTab === DASH_TAB_SALES && filterHint
              ? ` · ${td('filtered')}: ${filterHint}`
              : ''}
          </p>
          {cbuRateLine ? <p className="dash-subtitle">{cbuRateLine}</p> : null}
        </div>
      </header>

      {canToggleDashboardTabs ? (
        <div className="dash-tab-bar" role="tablist" aria-label={td('title')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === DASH_TAB_MANAGEMENT}
            className={
              activeTab === DASH_TAB_MANAGEMENT ? 'dash-tab active' : 'dash-tab'
            }
            onClick={() => setActiveTab(DASH_TAB_MANAGEMENT)}
          >
            {td('tabManagementLegacy')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === DASH_TAB_SALES}
            className={activeTab === DASH_TAB_SALES ? 'dash-tab active' : 'dash-tab'}
            onClick={() => setActiveTab(DASH_TAB_SALES)}
          >
            {td('tabSalesLegacy')}
          </button>
        </div>
      ) : null}

      {canToggleDashboardTabs && activeTab === DASH_TAB_MANAGEMENT ? (
        <ManagementKpisSectionLegacy
          roleCode={analytics?.role_code}
          availableYears={analytics?.available_years}
          active
        />
      ) : null}

      {(!canToggleDashboardTabs || activeTab === DASH_TAB_SALES) && (
        <>
      <header className="dash-header">
        <div>
          <p className="dash-subtitle dash-subtitle-section">
            {targetologView ? td('salesAnalyticsTitle') : td('kpisToday')}
          </p>
        </div>
        <div className="dash-filters">
          <label>
            {t('filters.year', { ns: 'common' })}
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
            {t('filters.month', { ns: 'common' })}
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {filterHint ? (
            <button type="button" className="dash-clear-filter" onClick={clearCrossFilter}>
              {td('clearChartFilters')}
            </button>
          ) : null}
        </div>
      </header>

      <section className="dash-kpi-row">
        <KpiCard
          label={td('soldUnitsToday')}
          value={(kpis?.net_sold_units ?? kpis?.sold_units ?? 0).toLocaleString()}
          sub={
            // Same-day returns only — see the note on the matching card in DashboardModern.
            !targetologView && (kpis?.same_day_return_units ?? 0) > 0
              ? td('netUnitsSub', {
                  gross: (kpis?.sold_units ?? 0).toLocaleString(),
                  returned: (kpis?.same_day_return_units ?? 0).toLocaleString(),
                })
              : kpis?.scope === 'own'
                ? td('scopeOwn')
                : td('scopeAll')
          }
        />
        {!targetologView ? (
        <KpiCard
          label={td('salesRevenueToday')}
          value={`$${(kpis?.net_revenue_usd ?? kpis?.revenue_usd ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`}
          sub={
            (kpis?.refunds_usd ?? 0) > 0 || (kpis?.refunds_uzs ?? 0) > 0
              ? td('netRevenueSub', {
                  refunds: formatRefundSummary(kpis?.refunds_usd, kpis?.refunds_uzs),
                })
              : (kpis?.net_revenue_uzs ?? kpis?.revenue_uzs ?? 0) > 0
                ? `${(kpis.net_revenue_uzs ?? kpis.revenue_uzs).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
                : null
          }
        />
        ) : null}
        <KpiCard
          label={td('ordersToday')}
          value={(kpis?.total_orders ?? 0).toLocaleString()}
        />
        <KpiCard
          label={td('returnsToday')}
          value={(kpis?.total_returns ?? 0).toLocaleString()}
          sub={
            !targetologView && ((kpis?.refunds_usd ?? 0) > 0 || (kpis?.refunds_uzs ?? 0) > 0)
              ? td('returnsRefundSub', {
                  refunds: formatRefundSummary(kpis?.refunds_usd, kpis?.refunds_uzs),
                })
              : td('returnedUnits')
          }
        />
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">{td('monthlyPerformance')}</h2>
        <p className="dash-section-hint">{td('monthlyHint')}</p>
        <p className="dash-section-hint">{td('returnsChartHint')}</p>
        <div className="dash-charts-row">
          {!targetologView ? (
          <ChartPanel
            emptyLabel={chartEmpty}
            title={td('chartUnitsByUser')}
            data={monthlyUsers.data}
            seriesKeys={monthlyUsers.keys}
            xKey="monthLabel"
            chartType="bar"
            onLegendClick={handleLegendUser}
            activeCross={crossFilter.salesman}
          />
          ) : null}
          {!targetologView ? (
          <CategoryTopSlotsChart
            emptyLabel={chartEmpty}
            title={td('chartUnitsByCategory')}
            series={monthlyCategoryTop}
            labels={categoryChartLabels}
            onLegendClick={handleLegendCategory}
            activeCross={crossFilter.category}
          />
          ) : null}
          <ChartPanel
            emptyLabel={chartEmpty}
            title={td('chartNewVsExisting')}
            data={monthlyCustomers.data}
            seriesKeys={monthlyCustomers.keys}
            xKey="monthLabel"
            chartType="area"
            onLegendClick={handleLegendCustomer}
            activeCross={crossFilter.customerType}
          />
          {!targetologView ? (
          <ChartPanel
            emptyLabel={chartEmpty}
            title={td('chartOrdersByUser')}
            data={monthlyOrdersByUser.data}
            seriesKeys={monthlyOrdersByUser.keys}
            xKey="monthLabel"
            chartType="bar"
            onLegendClick={handleLegendUser}
            activeCross={crossFilter.salesman}
          />
          ) : null}
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">{td('weekdayAverages')}</h2>
        <p className="dash-section-hint">{td('weekdayHint')}</p>
        <div className="dash-charts-row">
          {!targetologView ? (
          <ChartPanel
            emptyLabel={chartEmpty}
            title={td('chartAvgByUser')}
            data={weekdayUsers.data}
            seriesKeys={weekdayUsers.keys}
            xKey="weekday_label"
            chartType="weekday"
            // Everyone who sold nothing on that weekday is left out of the hover, so the
            // people who did sell are not buried under a column of zeroes.
            hideZeroSeries
            onLegendClick={handleLegendUser}
            activeCross={crossFilter.salesman}
            controls={
              <ToggleGroup
                value={weekdayGranularity}
                onChange={setWeekdayGranularity}
                options={[
                  { value: 'weekly', label: td('mgmt.weekly') },
                  { value: 'monthly', label: td('mgmt.monthly') },
                ]}
              />
            }
          />
          ) : null}
          {!targetologView ? (
          <CategoryTopSlotsChart
            emptyLabel={chartEmpty}
            title={td('chartAvgByCategory')}
            series={weekdayCategoryTop}
            labels={categoryChartLabels}
            xKey="weekday_label"
            allowDecimals
            onLegendClick={handleLegendCategory}
            activeCross={crossFilter.category}
          />
          ) : null}
          <ChartPanel
            emptyLabel={chartEmpty}
            title={td('chartAvgByCustomer')}
            data={weekdayCustomers.data}
            seriesKeys={weekdayCustomers.keys}
            xKey="weekday_label"
            chartType="bar"
            onLegendClick={handleLegendCustomer}
            activeCross={crossFilter.customerType}
          />
        </div>
      </section>
      {!targetologView ? <PenaltyDashboardCard /> : null}
        </>
      )}

      {targetologView && canViewMarketingKpis ? (
        <ManagementKpisSectionLegacy
          roleCode={analytics?.role_code || roleCode}
          availableYears={analytics?.available_years}
          active
          marketingOnly
        />
      ) : null}

    </div>
  );
};

export default DashboardLegacy;
