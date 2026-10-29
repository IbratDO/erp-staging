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

import { CHART_PALETTE, OTHERS_SLOT, round1, slotKey } from '../utils/dashboardAnalytics';

export { round1 };

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
 * Whether the charts are being read on a phone.
 *
 * A media query rather than a width measurement, and subscribed to rather than sampled once: a
 * tablet turned on its side crosses this line without remounting anything, and a chart that kept
 * its phone sizing in landscape would waste half the screen.
 *
 * **Above the breakpoint this returns `false` and every chart renders exactly as it always has.**
 * That is the point — the desktop figures are the ones people have been reading for a year, and
 * none of the sizing below should touch them.
 */
const NARROW_QUERY = '(max-width: 600px)';

export function useNarrowCharts() {
  const [narrow, setNarrow] = React.useState(
    () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(NARROW_QUERY).matches,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    // `addListener` is the deprecated spelling; Safari before 14 has only that one, and a till
    // or a dashboard opened on an older iPad is not a hypothetical here.
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return narrow;
}

/**
 * What a chart's furniture costs on each screen.
 *
 * The axes are the problem on a phone, not the plot. Recharts reserves a fixed 60px for the Y
 * axis, which on a 300px-wide card is a fifth of the chart given over to four numbers; and the
 * left margin of 0 means the first X label hangs off the edge. Shrinking both is what gives the
 * bars room, so the chart is readable rather than merely present.
 *
 * The X axis thins its own labels — Recharts drops colliding category ticks on its own — so there
 * is nothing to do there beyond making them smaller.
 */
const DESKTOP = {
  height: 280, tick: 12, yWidth: undefined, legendFont: 12,
  margin: { top: 8, right: 8, left: 0, bottom: 0 },
};

/** Never taller on a phone than it was on a desktop — a handset has less height, not more. */
export function chartHeight(narrow, desktop) {
  return narrow ? Math.min(desktop, 240) : desktop;
}

export function axisTick(narrow, desktop = 12) {
  return { fontSize: narrow ? 10 : desktop };
}

/**
 * **The single biggest win on a phone**, and the one that is invisible in a stylesheet.
 *
 * Recharts reserves a flat 60px for a Y axis whatever is in it. On a ~310px card that is a fifth
 * of the chart handed to four numbers before a bar is drawn; 34px fits the figures these axes
 * actually carry and gives the rest back to the plot. `undefined` on a desktop means "whatever it
 * was", so a chart that had set its own width keeps it.
 */
export function axisWidth(narrow, desktop) {
  return narrow ? 34 : desktop;
}

export function chartSizing(narrow, desktop = {}) {
  const desk = { ...DESKTOP, ...desktop };
  if (!narrow) return desk;
  return {
    height: chartHeight(true, desk.height),
    tick: 10,
    yWidth: axisWidth(true, desk.yWidth),
    legendFont: 10,
    margin: { top: 8, right: 4, left: 0, bottom: 0 },
  };
}

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
export function seriesTooltip({ active, payload, label }, tooltipStyle, options = {}) {
  const { hideZero = false, reverse = false } = options;
  if (!active || !payload?.length) return null;
  // Copied either way. `reverse()` mutates in place, and this array belongs to Recharts —
  // reordering it during a render would quietly reorder the chart's own book-keeping.
  const kept = hideZero
    ? payload.filter((entry) => Number(entry?.value) !== 0)
    : [...payload];
  // Nothing at all on this bar. An empty box reads as a glitch, so show none.
  if (!kept.length) return null;
  // Recharts lists series in the order they were declared, which on a stacked chart is the
  // *bottom* band first. Reversed, the hover reads top-down in the order the bands are drawn.
  const rows = reverse ? kept.reverse() : kept;
  return (
    <div style={{ ...tooltipStyle, padding: '8px 10px' }}>
      <div style={{ marginBottom: 4 }}>{label}</div>
      {rows.map((entry) => (
        <div key={entry.dataKey ?? entry.name} style={{ color: entry.color }}>
          {entry.name}
          {' : '}
          {round1(entry.value)}
        </div>
      ))}
    </div>
  );
}

/**
 * The hover box with the sold-nothing rows dropped — the long-standing behaviour, unchanged.
 *
 * A thin wrapper now, so that filtering and ordering are one piece of code rather than two
 * near-copies that could disagree about how a row is drawn.
 */
export function nonZeroTooltip(props, tooltipStyle) {
  return seriesTooltip(props, tooltipStyle, { hideZero: true });
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
  /**
   * List the hover rows top band first instead of bottom band first.
   *
   * Opt-in per chart: this component draws five charts on the modern dashboard alone, and the
   * order that reads correctly for one stack is not automatically right for the others.
   */
  reverseTooltip = false,
  controls = null,
}) {
  const narrow = useNarrowCharts();
  const size = chartSizing(narrow);

  const legendProps = {
    onClick: (e) => {
      const key = e?.value;
      if (!key || !onLegendClick) return;
      onLegendClick(key);
    },
    wrapperStyle: { cursor: 'pointer', fontSize: size.legendFont },
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
      <ResponsiveContainer width="100%" height={size.height}>
        {chartType === 'area' ? (
          <AreaChart data={data} margin={size.margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: size.tick }} />
            <YAxis
              tick={{ fontSize: size.tick }}
              width={size.yWidth}
              allowDecimals={false}
              tickFormatter={round1}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              {...(hideZeroSeries || reverseTooltip
                ? {
                    content: (props) =>
                      seriesTooltip(props, tooltipStyle, {
                        hideZero: hideZeroSeries,
                        reverse: reverseTooltip,
                      }),
                  }
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
          <BarChart data={data} margin={size.margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: size.tick }} />
            <YAxis
              tick={{ fontSize: size.tick }}
              width={size.yWidth}
              allowDecimals={chartType === 'weekday'}
              tickFormatter={round1}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              {...(hideZeroSeries || reverseTooltip
                ? {
                    content: (props) =>
                      seriesTooltip(props, tooltipStyle, {
                        hideZero: hideZeroSeries,
                        reverse: reverseTooltip,
                      }),
                  }
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
  const narrow = useNarrowCharts();
  const size = chartSizing(narrow);

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
    // Summed first, then rounded once. Rounding each row and adding the rounded figures would
    // print a total that does not match the rows above it — the reader checks that.
    const total = round1(entries.reduce((sum, e) => sum + e.value, 0));

    return (
      <div className="dash-chart-tooltip">
        <div className="dash-chart-tooltip__month">{row[xKey]}</div>
        {entries.map((e) => (
          <div className="dash-chart-tooltip__row" key={e.name}>
            <span className="dash-chart-legend__swatch" style={{ background: e.fill }} />
            <span className="dash-chart-tooltip__name">{e.name}</span>
            <span className="dash-chart-tooltip__value">{round1(e.value)}</span>
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
      <ResponsiveContainer width="100%" height={size.height}>
        <BarChart data={data} margin={size.margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: size.tick }} />
          <YAxis
            tick={{ fontSize: size.tick }}
            width={size.yWidth}
            allowDecimals={allowDecimals}
            tickFormatter={round1}
          />
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
