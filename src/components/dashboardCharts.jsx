import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_PALETTE, OTHERS_SLOT, slotKey } from '../utils/dashboardAnalytics';

/**
 * The chart cards the dashboards draw with, in one place.
 *
 * These lived inside `DashboardModern` while `DashboardLegacy` kept its own copy of `ChartPanel`,
 * and the two drifted exactly as you would expect: every improvement made to the charts — the
 * top-5-per-bar category grouping, dropping the sold-nothing rows from a hover, the granularity
 * toggle in the card head — landed on the modern page alone. The Founder and the Investor got the
 * corrected charts; the CEO, the Senior Sales Manager, the Sales Manager and the Targetolog went
 * on reading the old ones, with no sign on screen that the two disagreed.
 *
 * So the components are shared and the pages only decide *which* charts to show and to whom. A
 * future fix to how a chart is drawn now reaches every role that has that chart, which is the
 * only way this stays true without somebody remembering to copy it across.
 */

/**
 * The hover box, with the empty rows left out.
 *
 * A stacked chart draws one series per person, and Recharts names every one of them on hover —
 * including everybody who sold nothing that day. On a weekday chart with a dozen salesmen that is
 * eleven lines of "0" hiding the one number the reader wanted.
 *
 * Only the rows are dropped, never a series: the colours, the legend and the stack order stay
 * exactly as they are, so the same person keeps the same colour on every bar.
 */
export function nonZeroTooltip({ active, payload, label }, tooltipStyle) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((entry) => Number(entry?.value) !== 0);
  // Nothing at all on this bar. An empty box reads as a glitch, so show none.
  if (!rows.length) return null;
  return (
    <div style={{ ...tooltipStyle, padding: '8px 10px' }}>
      <div style={{ marginBottom: 4 }}>{label}</div>
      {rows.map((entry) => (
        <div key={entry.dataKey ?? entry.name} style={{ color: entry.color }}>
          {entry.name}
          {' : '}
          {typeof entry.value === 'number'
            ? Math.round(entry.value * 100) / 100
            : entry.value}
        </div>
      ))}
    </div>
  );
}

export function ChartPanel({
  title,
  data,
  seriesKeys,
  xKey,
  chartType,
  onLegendClick,
  activeCross,
  emptyLabel = '',
  hideZeroSeries = false,
  controls = null,
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

  // The head keeps its controls even with no data: the toggle is how a reader gets *out* of an
  // empty view, so hiding it there would strand them.
  const head = (
    <div className="dash-chart-head">
      <h3>{title}</h3>
      {controls}
    </div>
  );

  if (!data?.length) {
    return (
      <div className="dash-chart-card">
        {head}
        <p className="dash-empty">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="dash-chart-card">
      {head}
      <ResponsiveContainer width="100%" height={height}>
        {chartType === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              {...(hideZeroSeries
                ? { content: (props) => nonZeroTooltip(props, tooltipStyle) }
                : {})}
            />
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
            <Tooltip
              contentStyle={tooltipStyle}
              {...(hideZeroSeries
                ? { content: (props) => nonZeroTooltip(props, tooltipStyle) }
                : {})}
            />
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

/** The leftover group is grey on purpose: it is a remainder, not a category to read into. */
const OTHERS_FILL = '#94a3b8';

/**
 * Units by category, where each bar shows only its own biggest sellers.
 *
 * Drives both category charts on the Sotuv tab — the monthly totals and the weekday averages.
 * They differ only in which field labels the bar and whether the values are whole numbers, so
 * `xKey` and `allowDecimals` carry that and the rest is shared.
 *
 * Its own component rather than a `ChartPanel` variant, because it is drawn on a different
 * principle. `ChartPanel` renders one series per category, which fixes the segment order for
 * the whole chart and puts every category — including the ones that sold nothing — into every
 * bar's tooltip. Here the series are positional slots, so each bar can be ordered biggest-at-
 * the-bottom on its own figures and can leave out whatever did not sell.
 *
 * That trade costs two things, and both are rebuilt by hand below:
 *
 * * **The tooltip**, because Recharts would name the series, and the series are called `slot0`.
 *   The real category travels beside each value in the row and is read from there.
 * * **The legend**, for the same reason, and because a slot has no colour of its own — colour
 *   belongs to the category, which is what stops a colour meaning two different things in two
 *   different bars.
 */
export function CategoryTopSlotsChart({
  title,
  emptyLabel,
  series,
  labels,
  onLegendClick,
  activeCross,
  xKey = 'monthLabel',
  allowDecimals = false,
}) {
  const { data, slotCount, hasOthers, categoryColors, namedCategories } = series;

  const dimFor = (name) => (activeCross && activeCross !== name ? 0.3 : 0.9);

  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    const entries = [];
    for (let i = 0; i < slotCount; i += 1) {
      const name = row[`${slotKey(i)}Name`];
      const value = row[slotKey(i)];
      // A slot this month did not fill, or a category that sold none: neither belongs on hover.
      if (name && value > 0) entries.push({ name, value, fill: categoryColors[name] });
    }
    const others = row[OTHERS_SLOT] || 0;
    if (others > 0) {
      entries.push({
        name: labels.othersCount(row.othersNames?.length || 0),
        value: others,
        fill: OTHERS_FILL,
      });
    }
    if (!entries.length) return null;
    // Weekday values are averages, so the total is rounded rather than printed raw.
    const total = Math.round(entries.reduce((sum, e) => sum + e.value, 0) * 100) / 100;

    return (
      <div className="dash-chart-tooltip">
        <div className="dash-chart-tooltip__month">{row[xKey]}</div>
        {entries.map((e) => (
          <div className="dash-chart-tooltip__row" key={e.name}>
            <span className="dash-chart-legend__swatch" style={{ background: e.fill }} />
            <span className="dash-chart-tooltip__name">{e.name}</span>
            <span className="dash-chart-tooltip__value">{e.value}</span>
          </div>
        ))}
        <div className="dash-chart-tooltip__row dash-chart-tooltip__total">
          <span className="dash-chart-tooltip__name">{labels.total}</span>
          <span className="dash-chart-tooltip__value">{total}</span>
        </div>
      </div>
    );
  };

  if (!data?.length || slotCount === 0) {
    return (
      <div className="dash-chart-card">
        <h3>{title}</h3>
        <p className="dash-empty">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="dash-chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={allowDecimals} />
          <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
          {/* slot0 first, so Recharts puts the bar's biggest seller at the base. */}
          {Array.from({ length: slotCount }, (_, i) => (
            <Bar key={slotKey(i)} dataKey={slotKey(i)} stackId="stack">
              {data.map((row, rowIndex) => {
                const name = row[`${slotKey(i)}Name`];
                return (
                  <Cell
                    key={row.month_key || row[xKey] || rowIndex}
                    fill={categoryColors[name] || 'transparent'}
                    fillOpacity={dimFor(name)}
                  />
                );
              })}
            </Bar>
          ))}
          {hasOthers ? (
            <Bar
              dataKey={OTHERS_SLOT}
              stackId="stack"
              fill={OTHERS_FILL}
              fillOpacity={activeCross ? 0.3 : 0.9}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
      <div className="dash-chart-legend">
        {namedCategories.map((name) => (
          <button
            key={name}
            type="button"
            className={
              'dash-chart-legend__item dash-chart-legend__item--clickable'
              + (activeCross && activeCross !== name ? ' dash-chart-legend__item--dim' : '')
            }
            onClick={() => onLegendClick && onLegendClick(name)}
          >
            <span
              className="dash-chart-legend__swatch"
              style={{ background: categoryColors[name] }}
            />
            {name}
          </button>
        ))}
        {hasOthers ? (
          // Not clickable: it is a different set of categories in each bar, so there is
          // nothing single to filter the rest of the dashboard down to.
          <span className="dash-chart-legend__item">
            <span className="dash-chart-legend__swatch" style={{ background: OTHERS_FILL }} />
            {labels.others}
          </span>
        ) : null}
      </div>
    </div>
  );
}
