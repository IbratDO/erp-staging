/** Sum parseFloat(row[key]) for each key across rows. */
export function sumRowFields(rows, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) {
    for (const k of keys) {
      out[k] += parseFloat(row[k]) || 0;
    }
  }
  return out;
}

/** Receivable / payable style: sum amount grouped by currency code. */
export function sumAmountsByCurrency(rows) {
  const m = {};
  for (const r of rows) {
    const c = (r.currency || 'USD').toString().toUpperCase();
    m[c] = (m[c] || 0) + (parseFloat(r.amount) || 0);
  }
  return m;
}

export function formatMultiCurrencyAmounts(m, { maxFraction = 2 } = {}) {
  const keys = Object.keys(m);
  if (!keys.length) return '—';
  return keys
    .sort()
    .map(
      (c) =>
        `${c} ${m[c].toLocaleString(undefined, { minimumFractionDigits: maxFraction, maximumFractionDigits: maxFraction })}`
    )
    .join(' · ');
}

/**
 * Finance records: signed amount by currency (income +, expense −).
 * Returns { USD: n, UZS: n, ... }.
 * @param {object} [options]
 * @param {string} [options.status] - e.g. 'completed' to match summary cards
 */
export function signedFinanceAmountsByCurrency(records, options = {}) {
  const { status: statusFilter } = options;
  const m = {};
  for (const r of records) {
    if (statusFilter && r.status !== statusFilter) continue;
    const c = (r.currency || 'USD').toString().toUpperCase();
    const amt = parseFloat(r.amount) || 0;
    const s = r.record_type === 'income' ? amt : -amt;
    m[c] = (m[c] || 0) + s;
  }
  return m;
}

export function formatSignedCurrencyMap(m) {
  const keys = Object.keys(m);
  if (!keys.length) return '—';
  return keys
    .sort()
    .map((c) => {
      const v = m[c];
      return `${c} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    })
    .join(' · ');
}

/**
 * Currency-only legs for finance tables (legacy cash/card rows fold into *_cash columns by currency).
 */
export const BALANCE_TABLE_LEGS = ['uzs_cash', 'usd_cash'];

/** @deprecated Use BALANCE_TABLE_LEGS — kept for accidental imports elsewhere. */
export const BALANCE_FOUR_LEGS = BALANCE_TABLE_LEGS;

/**
 * Map finance record to display leg: UZS → uzs_cash, USD → usd_cash (card + cash summed in UI column).
 * Rows with no currency are excluded so we do not wrongly attribute amounts to USD.
 */
export function financeRecordLegKey(record) {
  if (record.currency == null || String(record.currency).trim() === '') {
    return null;
  }
  const c = String(record.currency).toUpperCase();
  if (c === 'UZS') return 'uzs_cash';
  if (c === 'USD') return 'usd_cash';
  return null;
}

/**
 * Finance records: signed amount per leg (income +, expense −), using currency + payment_type.
 * Only rows with mappable leg are included (same cells as the four-column view).
 * @param {object} [options]
 * @param {string} [options.status] - e.g. 'completed' to match table footer
 */
export function signedFinanceAmountsByLeg(records, options = {}) {
  const { status: statusFilter } = options;
  const m = Object.fromEntries(BALANCE_TABLE_LEGS.map((k) => [k, 0]));
  for (const r of records) {
    if (statusFilter && r.status !== statusFilter) continue;
    const leg = financeRecordLegKey(r);
    if (!leg) continue;
    const amt = parseFloat(r.amount) || 0;
    const s = r.record_type === 'income' ? amt : -amt;
    m[leg] = (m[leg] || 0) + s;
  }
  return m;
}
