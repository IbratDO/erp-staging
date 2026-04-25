/**
 * Display rules: never prefix UZS with $. USD (default) uses $ and 2 decimal places.
 */

export function formatDisplayAmount(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return '—';
  const cur = (currency && String(currency).toUpperCase()) || 'USD';
  if (cur === 'UZS') {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`;
  }
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** For balance transaction rows: balance_type like uzs_cash / usd_card */
export function formatAmountByBalanceType(amount, balanceType) {
  if (balanceType == null || balanceType === '') {
    return formatDisplayAmount(amount, 'USD');
  }
  const t = String(balanceType).toLowerCase();
  return formatDisplayAmount(amount, t.includes('uzs') ? 'UZS' : 'USD');
}

/**
 * No $ or UZS suffix — for mixed-currency rollups where a single symbol would be wrong.
 */
export function formatPlainAmount(amount, fractionDigits = 2) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}
