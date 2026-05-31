/**
 * Display rules: never prefix UZS with $. USD (default) uses $ and 2 decimal places.
 */
import i18n from '../i18n';

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

/** Sum ledger rows for SPA balance checks (matches Money Balance totals). */
export function cashBalanceTotalByCurrency(balances, currency) {
  const c = String(currency || 'USD').toUpperCase();
  const list = Array.isArray(balances) ? balances : [];
  if (c === 'USD') {
    return list
      .filter((b) => b.balance_type === 'usd_cash' || b.balance_type === 'usd_card')
      .reduce((s, b) => s + (parseFloat(b.balance) || 0), 0);
  }
  if (c === 'UZS') {
    return list
      .filter((b) => b.balance_type === 'uzs_cash' || b.balance_type === 'uzs_card')
      .reduce((s, b) => s + (parseFloat(b.balance) || 0), 0);
  }
  return 0;
}

/**
 * User-facing insufficient-balance lines for toasts/alerts (correct currency formatting).
 * @param {'default'|'refund'|'order_paid_on_create'} context
 */
export function formatInsufficientLedgerMessage(currency, available, required, options = {}) {
  const { topUpSuffix = false, context = 'default' } = options;
  const ccy = String(currency || 'USD').toUpperCase();
  const availStr = formatDisplayAmount(available, ccy);
  const reqStr = formatDisplayAmount(required, ccy);
  const label = ccy === 'UZS' ? 'UZS' : 'USD';

  const key =
    context === 'refund'
      ? 'ledger.insufficientRefund'
      : context === 'order_paid_on_create'
        ? 'ledger.insufficientOrderPaid'
        : 'ledger.insufficientDefault';

  let out = i18n.t(key, {
    ns: 'common',
    label,
    available: availStr,
    required: reqStr,
  });
  if (topUpSuffix) {
    out += i18n.t('ledger.topUpHint', { ns: 'common' });
  }
  return out;
}
