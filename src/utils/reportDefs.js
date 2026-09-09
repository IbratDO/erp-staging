/**
 * What each Hisobotlar report is made of: its endpoint, its filters, its summary cards, its
 * columns.
 *
 * Data rather than four hand-written pages, because the TZ asks for the same shape every time —
 * filters on top, a Summary block, a table, a «Jami» row, an Excel button — and four copies of
 * that shell would drift the way the two dashboards drifted. One shell reads these definitions
 * and renders any of them.
 *
 * Pure on purpose: no React, no `t()`, no `api`. Labels arrive as keys the page translates, and
 * values arrive already formatted by the caller. That keeps the part worth testing — which column
 * reads which field, and how a «Jami» row is built — testable without a browser.
 *
 * **Money is never summed across currencies here.** Every total is a pair, matching the backend
 * and the TZ rule that som and dollars are shown apart. The one exception is ABC, where a share of
 * a total needs a single total; that report carries its own combined column and says what rate it
 * used.
 */

/** Sum a numeric field over rows. Missing and unparseable values count as zero, never as NaN. */
export function sumField(rows, field) {
  return (rows || []).reduce((total, row) => {
    const n = Number(row?.[field]);
    return total + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/**
 * The «Jami» row for a report: every column that declares `total` gets one.
 *
 * Returned keyed by column so the table can place each figure under its own heading rather than
 * guessing from position — a footer that drifts one cell left of its column is worse than none.
 */
export function buildTotals(columns, rows) {
  const out = {};
  for (const col of columns || []) {
    if (!col?.total) continue;
    out[col.key] = col.total === 'count' ? (rows || []).length : sumField(rows, col.key);
  }
  return out;
}

/** Rows a report shows after its own client-side filtering. Reports filter on the server. */
export const REPORT_KEYS = {
  STOCK: 'stock',
  AGING: 'aging',
  ABC: 'abc',
  CASHFLOW: 'cashflow',
  SALES: 'sales',
  PRODUCTS: 'products',
  SELLERS: 'sellers',
  COURIERS: 'couriers',
  RETURNS: 'returns',
  CUSTOMERS: 'customers',
  PAYMENTS: 'payments',
};

const money = (field, currency) => ({ kind: 'money', field, currency });

/**
 * The four reports.
 *
 * `tab` decides which sub-tab shows it; `filters` names the controls the shell renders;
 * `columns` is the table, in order. A column's `type` tells the shell how to format the cell:
 *
 *   text      as written
 *   int       a whole number
 *   money     an amount in the currency named by `currency`
 *   pair      a USD figure and a som figure side by side, never added
 *   percent   one decimal and a %
 *   date      the shop's fixed date format
 *   band      the A / B / C chip
 */
export const REPORTS = [
  {
    key: REPORT_KEYS.STOCK,
    tab: 'ombor',
    endpoint: '/reports/stock-snapshot/',
    titleKey: 'stock.title',
    hintKey: 'stock.hint',
    filters: ['warehouse', 'catalogue'],
    summary: [
      { key: 'sku_count', labelKey: 'stock.sku', type: 'int' },
      { key: 'quantity', labelKey: 'stock.units', type: 'int' },
      { key: 'cost', labelKey: 'stock.cost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs' },
      { key: 'main', labelKey: 'stock.main', type: 'pair', usd: 'main_cost_usd', uzs: 'main_cost_uzs' },
      {
        key: 'packaging', labelKey: 'stock.packaging', type: 'pair',
        usd: 'packaging_cost_usd', uzs: 'packaging_cost_uzs',
      },
    ],
    columns: [
      { key: 'name', labelKey: 'col.product', type: 'text' },
      { key: 'size', labelKey: 'col.size', type: 'text' },
      { key: 'color', labelKey: 'col.color', type: 'text' },
      { key: 'warehouse', labelKey: 'col.warehouse', type: 'warehouse' },
      { key: 'quantity', labelKey: 'col.quantity', type: 'int', total: true },
      { key: 'unit_cost', labelKey: 'col.unitCost', type: 'pair', usd: 'unit_cost_usd', uzs: 'unit_cost_uzs' },
      { key: 'cost', labelKey: 'col.totalCost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs',
        totalUsd: 'cost_usd', totalUzs: 'cost_uzs' },
      { key: 'layers', labelKey: 'col.layers', type: 'int' },
    ],
  },
  {
    key: REPORT_KEYS.AGING,
    tab: 'ombor',
    endpoint: '/reports/aging-stock/',
    titleKey: 'aging.title',
    hintKey: 'aging.hint',
    filters: ['minDays', 'catalogue'],
    summary: [
      { key: 'sku_count', labelKey: 'aging.skus', type: 'int' },
      { key: 'quantity', labelKey: 'aging.units', type: 'int' },
      { key: 'cost', labelKey: 'aging.frozen', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs',
        emphasis: true },
      { key: 'avg_idle_days', labelKey: 'aging.avgDays', type: 'int' },
      { key: 'never_sold_count', labelKey: 'aging.neverSold', type: 'int' },
    ],
    columns: [
      { key: 'name', labelKey: 'col.product', type: 'text' },
      { key: 'size', labelKey: 'col.size', type: 'text' },
      { key: 'color', labelKey: 'col.color', type: 'text' },
      { key: 'quantity', labelKey: 'col.quantity', type: 'int', total: true },
      { key: 'unit_cost', labelKey: 'col.unitCost', type: 'pair', usd: 'unit_cost_usd', uzs: 'unit_cost_uzs' },
      { key: 'cost', labelKey: 'col.totalCost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs',
        totalUsd: 'cost_usd', totalUzs: 'cost_uzs' },
      { key: 'last_sold', labelKey: 'col.lastSold', type: 'lastSold' },
      { key: 'idle_days', labelKey: 'col.idleDays', type: 'int' },
      { key: 'received_at', labelKey: 'col.received', type: 'date' },
    ],
  },
  {
    key: REPORT_KEYS.ABC,
    tab: 'ombor',
    endpoint: '/reports/abc-analysis/',
    titleKey: 'abc.title',
    hintKey: 'abc.hint',
    filters: ['period', 'metric', 'grouping', 'catalogue'],
    needsPeriod: true,
    summary: [
      { key: 'items', labelKey: 'abc.items', type: 'int' },
      { key: 'bandA', labelKey: 'abc.bandA', type: 'band', band: 'A' },
      { key: 'bandB', labelKey: 'abc.bandB', type: 'band', band: 'B' },
      { key: 'bandC', labelKey: 'abc.bandC', type: 'band', band: 'C' },
    ],
    columns: [
      { key: 'name', labelKey: 'col.group', type: 'groupName' },
      { key: 'quantity', labelKey: 'col.quantity', type: 'int', total: true },
      { key: 'value', labelKey: 'col.value', type: 'pair', usd: 'value_usd', uzs: 'value_uzs',
        totalUsd: 'value_usd', totalUzs: 'value_uzs' },
      { key: 'value_combined', labelKey: 'col.combined', type: 'money', currency: 'USD', total: true },
      { key: 'share', labelKey: 'col.share', type: 'percent' },
      { key: 'cumulative', labelKey: 'col.cumulative', type: 'percent' },
      { key: 'band', labelKey: 'col.band', type: 'bandChip' },
    ],
  },
  {
    key: REPORT_KEYS.CASHFLOW,
    tab: 'moliya',
    endpoint: '/reports/cash-flow/',
    titleKey: 'cash.title',
    hintKey: 'cash.hint',
    filters: ['period', 'account', 'currency', 'transactionType'],
    needsPeriod: true,
    summary: 'perCurrency',
    columns: [
      { key: 'date', labelKey: 'col.date', type: 'datetime' },
      { key: 'account', labelKey: 'col.account', type: 'text' },
      { key: 'currency', labelKey: 'col.currency', type: 'text' },
      { key: 'transaction_type', labelKey: 'col.operation', type: 'txType' },
      { key: 'description', labelKey: 'col.description', type: 'text' },
      { key: 'in_amount', labelKey: 'col.in', type: 'rowMoney', total: true },
      { key: 'out_amount', labelKey: 'col.out', type: 'rowMoney', total: true },
      { key: 'balance_after', labelKey: 'col.balanceAfter', type: 'rowMoney' },
    ],
  },
  {
    key: REPORT_KEYS.SALES,
    tab: 'sotuv',
    endpoint: '/reports/sales-detail/',
    titleKey: 'sales.title',
    hintKey: 'sales.hint',
    filters: ['period', 'status', 'saleType', 'salesman', 'currency', 'giveaway', 'catalogue'],
    needsPeriod: true,
    summary: [
      { key: 'sales_count', labelKey: 'sales.count', type: 'int' },
      { key: 'units', labelKey: 'sales.units', type: 'int' },
      { key: 'revenue', labelKey: 'sales.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs' },
      { key: 'discount', labelKey: 'sales.discount', type: 'pair', usd: 'discount_usd', uzs: 'discount_uzs' },
      { key: 'cost', labelKey: 'sales.cost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs' },
      { key: 'profit', labelKey: 'sales.profit', type: 'pair', usd: 'profit_usd', uzs: 'profit_uzs', emphasis: true },
      { key: 'margin', labelKey: 'sales.margin', type: 'percent' },
      { key: 'avg_check', labelKey: 'sales.avgCheck', type: 'money', currency: 'USD' },
      { key: 'giveaway_count', labelKey: 'sales.giveaways', type: 'int' },
      { key: 'returns_count', labelKey: 'sales.returns', type: 'int' },
    ],
    columns: [
      { key: 'id', labelKey: 'col.id', type: 'int' },
      { key: 'date', labelKey: 'col.date', type: 'datetime' },
      { key: 'name', labelKey: 'col.product', type: 'text' },
      { key: 'size', labelKey: 'col.size', type: 'text' },
      { key: 'color', labelKey: 'col.color', type: 'text' },
      { key: 'quantity', labelKey: 'col.quantity', type: 'int', total: true },
      { key: 'unit_price', labelKey: 'col.price', type: 'rowMoney' },
      { key: 'discount', labelKey: 'col.discount', type: 'pair', usd: 'discount_usd', uzs: 'discount_uzs',
        totalUsd: 'discount_usd', totalUzs: 'discount_uzs' },
      { key: 'is_giveaway', labelKey: 'col.free', type: 'yesNo' },
      { key: 'revenue', labelKey: 'col.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs',
        totalUsd: 'revenue_usd', totalUzs: 'revenue_uzs' },
      { key: 'cost', labelKey: 'col.cost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs',
        totalUsd: 'cost_usd', totalUzs: 'cost_uzs' },
      { key: 'profit', labelKey: 'col.profit', type: 'pair', usd: 'profit_usd', uzs: 'profit_uzs',
        totalUsd: 'profit_usd', totalUzs: 'profit_uzs' },
      { key: 'margin', labelKey: 'col.margin', type: 'percent' },
      { key: 'sale_type', labelKey: 'col.saleType', type: 'saleType' },
      { key: 'status', labelKey: 'col.status', type: 'saleStatus' },
      { key: 'salesman', labelKey: 'col.salesman', type: 'text' },
      { key: 'customer', labelKey: 'col.customer', type: 'text' },
    ],
  },
  {
    key: REPORT_KEYS.PRODUCTS,
    tab: 'sotuv',
    endpoint: '/reports/sales-by-product/',
    titleKey: 'products.title',
    hintKey: 'products.hint',
    filters: ['period', 'grouping', 'limit', 'catalogue'],
    needsPeriod: true,
    summary: [
      { key: 'items', labelKey: 'products.items', type: 'int' },
      { key: 'units', labelKey: 'sales.units', type: 'int' },
      { key: 'revenue', labelKey: 'sales.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs' },
      { key: 'profit', labelKey: 'sales.profit', type: 'pair', usd: 'profit_usd', uzs: 'profit_uzs', emphasis: true },
    ],
    columns: [
      { key: 'name', labelKey: 'col.group', type: 'text' },
      { key: 'quantity', labelKey: 'col.soldQty', type: 'int', total: true },
      { key: 'revenue', labelKey: 'col.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs',
        totalUsd: 'revenue_usd', totalUzs: 'revenue_uzs' },
      { key: 'cost', labelKey: 'col.cost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs',
        totalUsd: 'cost_usd', totalUzs: 'cost_uzs' },
      { key: 'profit', labelKey: 'col.profit', type: 'pair', usd: 'profit_usd', uzs: 'profit_uzs',
        totalUsd: 'profit_usd', totalUzs: 'profit_uzs' },
      { key: 'avg_price', labelKey: 'col.avgPrice', type: 'money', currency: 'USD' },
      { key: 'share', labelKey: 'col.share', type: 'percent' },
    ],
  },
  {
    key: REPORT_KEYS.SELLERS,
    tab: 'sotuv',
    endpoint: '/reports/sales-by-salesman/',
    titleKey: 'sellers.title',
    hintKey: 'sellers.hint',
    filters: ['period', 'salesman'],
    needsPeriod: true,
    summary: [
      { key: 'sellers', labelKey: 'sellers.count', type: 'int' },
      { key: 'revenue', labelKey: 'sales.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs' },
      { key: 'profit', labelKey: 'sales.profit', type: 'pair', usd: 'profit_usd', uzs: 'profit_uzs', emphasis: true },
    ],
    columns: [
      { key: 'name', labelKey: 'col.salesman', type: 'text' },
      { key: 'sales_count', labelKey: 'col.salesCount', type: 'int', total: true },
      { key: 'revenue', labelKey: 'col.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs',
        totalUsd: 'revenue_usd', totalUzs: 'revenue_uzs' },
      { key: 'profit', labelKey: 'col.profit', type: 'pair', usd: 'profit_usd', uzs: 'profit_uzs',
        totalUsd: 'profit_usd', totalUzs: 'profit_uzs' },
      { key: 'avg_check', labelKey: 'col.avgCheck', type: 'money', currency: 'USD' },
      { key: 'returns_count', labelKey: 'col.returnsCount', type: 'int', total: true },
      { key: 'returns_share', labelKey: 'col.returnsShare', type: 'percent' },
    ],
  },
  {
    key: REPORT_KEYS.COURIERS,
    tab: 'sotuv',
    endpoint: '/reports/sales-by-courier/',
    titleKey: 'couriers.title',
    hintKey: 'couriers.hint',
    filters: ['period', 'saleType'],
    needsPeriod: true,
    summary: [
      { key: 'couriers', labelKey: 'couriers.count', type: 'int' },
      { key: 'deliveries', labelKey: 'couriers.deliveries', type: 'int' },
      { key: 'delivery_revenue', labelKey: 'couriers.revenue', type: 'pair',
        usd: 'delivery_revenue_usd', uzs: 'delivery_revenue_uzs' },
      { key: 'share', labelKey: 'couriers.share', type: 'percent' },
    ],
    columns: [
      { key: 'name', labelKey: 'col.courier', type: 'text' },
      { key: 'sales_count', labelKey: 'col.deliveries', type: 'int', total: true },
      { key: 'revenue', labelKey: 'col.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs',
        totalUsd: 'revenue_usd', totalUzs: 'revenue_uzs' },
      { key: 'share', labelKey: 'col.share', type: 'percent' },
    ],
  },
  {
    key: REPORT_KEYS.RETURNS,
    tab: 'sotuv',
    endpoint: '/reports/sales-returns/',
    titleKey: 'returns.title',
    hintKey: 'returns.hint',
    filters: ['period', 'salesman', 'catalogue'],
    needsPeriod: true,
    summary: [
      { key: 'returns_count', labelKey: 'returns.count', type: 'int' },
      { key: 'units', labelKey: 'sales.units', type: 'int' },
      { key: 'refund', labelKey: 'returns.refunded', type: 'pair', usd: 'refund_usd', uzs: 'refund_uzs' },
      { key: 'share_of_revenue', labelKey: 'returns.share', type: 'percent' },
    ],
    columns: [
      { key: 'sale_id', labelKey: 'col.id', type: 'int' },
      { key: 'name', labelKey: 'col.product', type: 'text' },
      { key: 'size', labelKey: 'col.size', type: 'text' },
      { key: 'color', labelKey: 'col.color', type: 'text' },
      { key: 'quantity', labelKey: 'col.quantity', type: 'int', total: true },
      { key: 'refund', labelKey: 'col.refund', type: 'pair', usd: 'refund_usd', uzs: 'refund_uzs',
        totalUsd: 'refund_usd', totalUzs: 'refund_uzs' },
      { key: 'reason', labelKey: 'col.reason', type: 'reason' },
      { key: 'salesman', labelKey: 'col.salesman', type: 'text' },
      { key: 'sold_at', labelKey: 'col.soldAt', type: 'date' },
      { key: 'returned_at', labelKey: 'col.returnedAt', type: 'date' },
      { key: 'days_held', labelKey: 'col.daysHeld', type: 'int' },
    ],
  },
  {
    key: REPORT_KEYS.CUSTOMERS,
    tab: 'sotuv',
    endpoint: '/reports/sales-by-customer/',
    titleKey: 'customers.title',
    hintKey: 'customers.hint',
    filters: ['period'],
    needsPeriod: true,
    summary: [
      { key: 'customers', labelKey: 'customers.count', type: 'int' },
      { key: 'revenue', labelKey: 'sales.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs' },
    ],
    columns: [
      { key: 'name', labelKey: 'col.customer', type: 'text' },
      { key: 'sales_count', labelKey: 'col.purchases', type: 'int', total: true },
      { key: 'revenue', labelKey: 'col.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs',
        totalUsd: 'revenue_usd', totalUzs: 'revenue_uzs' },
      { key: 'avg_check', labelKey: 'col.avgCheck', type: 'money', currency: 'USD' },
      { key: 'debt', labelKey: 'col.debt', type: 'money', currency: 'USD', total: true },
    ],
  },
  {
    key: REPORT_KEYS.PAYMENTS,
    tab: 'sotuv',
    endpoint: '/reports/sales-by-payment/',
    titleKey: 'payments.title',
    hintKey: 'payments.hint',
    filters: ['period', 'currency'],
    needsPeriod: true,
    summary: [
      { key: 'days', labelKey: 'payments.days', type: 'int' },
      { key: 'revenue', labelKey: 'sales.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs' },
      { key: 'discount', labelKey: 'sales.discount', type: 'pair', usd: 'discount_usd', uzs: 'discount_uzs' },
    ],
    columns: [
      { key: 'date', labelKey: 'col.day', type: 'text' },
      { key: 'sales_count', labelKey: 'col.salesCount', type: 'int', total: true },
      { key: 'revenue', labelKey: 'col.revenue', type: 'pair', usd: 'revenue_usd', uzs: 'revenue_uzs',
        totalUsd: 'revenue_usd', totalUzs: 'revenue_uzs' },
      { key: 'discount', labelKey: 'col.discount', type: 'pair', usd: 'discount_usd', uzs: 'discount_uzs',
        totalUsd: 'discount_usd', totalUzs: 'discount_uzs' },
      { key: 'debt', labelKey: 'col.debt', type: 'pair', usd: 'debt_usd', uzs: 'debt_uzs',
        totalUsd: 'debt_usd', totalUzs: 'debt_uzs' },
    ],
  },
];

export function reportsForTab(tab) {
  return REPORTS.filter((r) => r.tab === tab);
}

export function findReport(key) {
  return REPORTS.find((r) => r.key === key) || null;
}

/**
 * Money totals for a report, per currency, keyed by column.
 *
 * Separate from `buildTotals` because a two-currency column cannot be one number: the footer needs
 * both legs, and adding them would be the one thing the TZ forbids outright.
 */
export function buildCurrencyTotals(columns, rows) {
  const out = {};
  for (const col of columns || []) {
    if (!col?.totalUsd && !col?.totalUzs) continue;
    out[col.key] = {
      usd: col.totalUsd ? sumField(rows, col.totalUsd) : 0,
      uzs: col.totalUzs ? sumField(rows, col.totalUzs) : 0,
    };
  }
  return out;
}

/** Sort accessors for `useClientTableSort`, derived from the columns so the two cannot disagree. */
export function sortAccessors(columns) {
  const acc = {};
  for (const col of columns || []) {
    if (col.type === 'pair') {
      // Sorted on the dollar leg with the som leg behind it: two-currency columns have no single
      // ordering, and picking one silently is better than a header that does nothing when clicked.
      acc[col.key] = (row) => Number(row?.[col.usd]) || Number(row?.[col.uzs]) || 0;
    } else if (['int', 'money', 'percent', 'rowMoney'].includes(col.type)) {
      acc[col.key] = (row) => Number(row?.[col.key]) || 0;
    } else {
      acc[col.key] = (row) => String(row?.[col.key] ?? '').toLowerCase();
    }
  }
  return acc;
}

export { money };
