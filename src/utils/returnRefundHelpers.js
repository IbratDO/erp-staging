/** Refund payment validation (CBU split currency) for Returns — no discount / shortfall option. */

import {
  PAYMENT_SHORTFALL_TOLERANCE,
  paymentTotalInSaleCurrency,
  paymentHasShortfall,
  uzsToUsd,
  usdToUzs,
} from './saleCompletePayHelpers';
import { formatDisplayAmount } from './currencyFormat';

/** Refund due at mark-refunded: stored sold price from return creation, else legacy sale unit price. */
export function computeReturnRefundDue(returnItem) {
  const qty = parseInt(returnItem?.quantity, 10) || 0;
  const storedTotal = parseFloat(returnItem?.sold_price);
  const storedCurrency = String(returnItem?.sold_price_currency || '').toUpperCase();
  if (
    returnItem?.sold_price != null &&
    returnItem.sold_price !== '' &&
    Number.isFinite(storedTotal) &&
    storedTotal >= 0 &&
    (storedCurrency === 'USD' || storedCurrency === 'UZS')
  ) {
    const unitPrice = qty > 0 ? storedTotal / qty : NaN;
    return { amount: storedTotal, currency: storedCurrency, unitPrice };
  }
  const sale = returnItem?.sale_detail;
  if (!sale || qty <= 0) {
    return { amount: null, currency: 'USD', unitPrice: NaN };
  }
  const currency = (sale.sale_currency || 'USD').toUpperCase();
  const unitPrice = parseFloat(sale.selling_price);
  if (!Number.isFinite(unitPrice)) {
    return { amount: null, currency, unitPrice: NaN };
  }
  const raw = unitPrice * qty;
  const amount = currency === 'UZS' ? Math.round(raw) : parseFloat(raw.toFixed(2));
  return { amount, currency, unitPrice };
}

function formatAmountForCurrency(amount, currency) {
  return formatDisplayAmount(amount, currency);
}

/** Combined refund in sold-price currency; requires CBU rate when legs use more than one currency bucket. */
export function computeRefundPaidInDueCurrency(uzsT, usdT, dueCurrency, cbuRate) {
  const sc = (dueCurrency || 'USD').toUpperCase();
  const uzs = parseFloat(uzsT) || 0;
  const usd = parseFloat(usdT) || 0;
  if (uzs <= 0 && usd <= 0) {
    return { ok: true, paid: 0, needsRate: false, splitCurrency: false };
  }
  const splitCurrency = uzs > 0 && usd > 0;
  const crossSingle =
    (sc === 'USD' && uzs > 0 && usd === 0) || (sc === 'UZS' && usd > 0 && uzs === 0);
  if (splitCurrency || crossSingle) {
    if (!cbuRate) {
      return { ok: false, paid: null, needsRate: true, splitCurrency };
    }
    return {
      ok: true,
      paid: paymentTotalInSaleCurrency(uzs, usd, sc, cbuRate),
      needsRate: false,
      splitCurrency,
    };
  }
  const paid = sc === 'USD' ? usd : uzs;
  return { ok: true, paid, needsRate: false, splitCurrency: false };
}

/**
 * Refund validation meta. Underpayment vs sold_price due is allowed when the user confirms partial refund.
 */
export function computeReturnRefundMeta(returnItem, refundFormData, cbuRate) {
  const dueInfo = computeReturnRefundDue(returnItem);
  const due = dueInfo.amount;
  const sc = dueInfo.currency || 'USD';
  const uzsT = parseFloat(refundFormData?.uzs) || 0;
  const usdT = parseFloat(refundFormData?.usd) || 0;

  const empty = {
    mixed: false,
    splitCurrency: false,
    needs: false,
    short: 0,
    due,
    paid: null,
    sc,
    hasOverpayment: false,
    overpaymentAmount: null,
    exceedsDue: false,
    dueUnavailable: due == null || Number.isNaN(due),
  };

  if (empty.dueUnavailable) {
    return empty;
  }

  const paidResult = computeRefundPaidInDueCurrency(uzsT, usdT, sc, cbuRate);
  if (!paidResult.ok) {
    return {
      ...empty,
      mixed: paidResult.needsRate,
      splitCurrency: paidResult.splitCurrency,
    };
  }

  const paid = paidResult.paid;
  const short = due - paid;
  const overpayTol = sc === 'UZS' ? 1 : PAYMENT_SHORTFALL_TOLERANCE;
  const exceedsDue = paid > due + overpayTol;
  const overpaymentAmount = exceedsDue ? paid - due : null;
  const hasOverpayment = !!overpaymentAmount && overpaymentAmount > overpayTol;

  return {
    mixed: false,
    splitCurrency: paidResult.splitCurrency,
    needs: paymentHasShortfall(due, paid, sc),
    short,
    due,
    paid,
    sc,
    hasOverpayment,
    overpaymentAmount,
    exceedsDue,
    dueUnavailable: false,
  };
}

export function buildReturnRefundRequest(refundFormData, exchangeRate, options = {}) {
  const requestData = {
    uzs: parseFloat(refundFormData.uzs) || 0,
    usd: parseFloat(refundFormData.usd) || 0,
  };
  if (exchangeRate?.rate && requestData.uzs > 0 && requestData.usd > 0) {
    requestData.exchange_rate = exchangeRate.rate;
  } else if (exchangeRate?.rate) {
    const uzsT = requestData.uzs;
    const usdT = requestData.usd;
    if ((uzsT > 0 && usdT === 0) || (usdT > 0 && uzsT === 0)) {
      requestData.exchange_rate = exchangeRate.rate;
    }
  }
  if (options.acceptPartialRefund || options.acceptSplitUnderpayment) {
    requestData.accept_partial_refund = true;
    requestData.accept_split_underpayment = true;
  }
  return requestData;
}

/**
 * Single confirmation for combined UZS+USD refund (replaces separate split / under / final dialogs).
 */
export function buildReturnCombinedRefundConfirmMessage({
  returnItem,
  meta,
  uzsAmount,
  usdAmount,
  exchangeRate,
  cbuRate,
}) {
  const sc = meta.sc || 'USD';
  const rateLine = exchangeRate?.label
    ? `CBU rate: ${exchangeRate.label}`
    : cbuRate
      ? `CBU rate: 1 USD = ${Number(cbuRate).toLocaleString(undefined, { maximumFractionDigits: 2 })} UZS`
      : null;

  const uzsLine =
    uzsAmount > 0
      ? sc === 'USD'
        ? `- ${formatAmountForCurrency(uzsAmount, 'UZS')} (≈ ${formatAmountForCurrency(uzsToUsd(uzsAmount, cbuRate), sc)} at CBU)`
        : `- ${formatAmountForCurrency(uzsAmount, 'UZS')}`
      : null;
  const usdLine =
    usdAmount > 0
      ? sc === 'UZS'
        ? `- ${formatAmountForCurrency(usdAmount, 'USD')} (≈ ${formatAmountForCurrency(usdToUzs(usdAmount, cbuRate), sc)} at CBU)`
        : `- ${formatAmountForCurrency(usdAmount, 'USD')}`
      : null;

  const totalLine =
    meta.paid != null
      ? `Total refund (in ${sc}): ${formatAmountForCurrency(meta.paid, sc)}`
      : null;
  const dueLine =
    meta.due != null ? `Refund due (in ${sc}): ${formatAmountForCurrency(meta.due, sc)}` : null;

  let statusLine = 'This matches the refund due.';
  if (meta.needs && meta.short > 0) {
    statusLine = `Below due by ${formatAmountForCurrency(meta.short, sc)} — remainder will not be refunded.`;
  } else if (meta.hasOverpayment && meta.overpaymentAmount != null) {
    statusLine = `Above due by ${formatAmountForCurrency(meta.overpaymentAmount, sc)} — excess will still be paid from cash.`;
  }

  const productLabel = returnItem?.product_detail
    ? `${returnItem.product_detail.brand} ${returnItem.product_detail.model}`
    : `Product #${returnItem?.product ?? '?'}`;
  const customerLine = returnItem?.customer_detail?.name
    ? `Customer: ${returnItem.customer_detail.name}`
    : null;

  return [
    `Mark Return #${returnItem?.id ?? '?'} as refunded?`,
    '',
    productLabel,
    customerLine,
    returnItem?.quantity != null ? `Qty: ${returnItem.quantity}` : null,
    '',
    rateLine,
    dueLine,
    'Paying:',
    uzsLine,
    usdLine,
    totalLine,
    statusLine,
    '',
    'Proceed?',
  ]
    .filter((line) => line != null && line !== '')
    .join('\n');
}

export function buildReturnCrossCurrencyConfirmMessage({
  due,
  sc,
  otherCurrency,
  otherAmount,
  paidInSaleCurrency,
  exchangeRate,
  cbuRate,
}) {
  const dueLabel = formatAmountForCurrency(due, sc);
  const payLabel = formatAmountForCurrency(otherAmount, otherCurrency);
  const rateLine = exchangeRate?.label
    ? `Based on CBU exchange rate: ${exchangeRate.label}`
    : cbuRate
      ? `Based on CBU exchange rate: 1 USD = ${Number(cbuRate).toLocaleString(undefined, { maximumFractionDigits: 2 })} UZS`
      : null;
  const equiv =
    cbuRate && otherAmount > 0
      ? sc === 'USD' && otherCurrency === 'UZS'
        ? `(equivalent to ${formatAmountForCurrency(uzsToUsd(otherAmount, cbuRate), sc)} at CBU rate)`
        : sc === 'UZS' && otherCurrency === 'USD'
          ? `(equivalent to ${formatAmountForCurrency(usdToUzs(otherAmount, cbuRate), sc)} at CBU rate)`
          : null
      : null;
  const totalLine =
    paidInSaleCurrency != null
      ? `Total refund (in ${sc}): ${formatAmountForCurrency(paidInSaleCurrency, sc)}`
      : null;
  return [
    rateLine,
    `Refund due (in ${sc}): ${dueLabel}.`,
    `You are refunding ${payLabel} in ${otherCurrency}${equiv ? ` ${equiv}` : ''}.`,
    totalLine,
    'Continue?',
  ]
    .filter(Boolean)
    .join('\n\n');
}

