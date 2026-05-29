/**
 * Shared UZS/USD + CBU payment validation (shop Complete & Pay, delivery settlement, from-order).
 */

import {
  computePaymentShortfallMeta,
  validateAdvanceCompletionPayment,
  buildCrossCurrencyAdvanceConfirmMessage,
  buildSplitCurrencyConfirmMessage,
  buildCompleteSaleRequest,
  paymentAmountInSaleCurrency,
} from './saleCompletePayHelpers';
import { formatDisplayAmount } from './currencyFormat';

/**
 * Run the same confirm/validate flow as SaleCompletePayForm before posting payment.
 * @returns {Promise<{ ok: boolean, requestData?: object }>}
 */
export async function runSalePaymentSubmitFlow({
  sale,
  paymentFormData,
  exchangeRate,
  exchangeRateError,
  showNotification,
  sellingPriceOverride,
  allowDiscount = true,
}) {
  const cbuRate = exchangeRate?.rate ?? null;
  const meta = computePaymentShortfallMeta(sale, paymentFormData, cbuRate);
  const uzsT = parseFloat(paymentFormData.uzs) || 0;
  const usdT = parseFloat(paymentFormData.usd) || 0;

  if (uzsT + usdT === 0) {
    showNotification?.('Please enter at least one payment amount.', 'error');
    return { ok: false };
  }

  const advanceCheck = validateAdvanceCompletionPayment(
    sale,
    paymentFormData.uzs,
    paymentFormData.usd,
    sellingPriceOverride,
    cbuRate,
  );
  if (!advanceCheck.ok) {
    showNotification?.(advanceCheck.error, 'error');
    return { ok: false };
  }

  if (meta.mixed) {
    showNotification?.(
      exchangeRateError || 'Exchange rate is still loading. Try again in a moment.',
      'error',
    );
    return { ok: false };
  }

  if (advanceCheck.needsSplitCurrencyConfirm) {
    if (
      !window.confirm(
        buildSplitCurrencyConfirmMessage({
          sale,
          uzsAmount: advanceCheck.uzsAmount,
          usdAmount: advanceCheck.usdAmount,
          due: advanceCheck.due,
          sc: advanceCheck.sc,
          cbuRate: advanceCheck.cbuRate,
          paidInSaleCurrency: advanceCheck.paidInSaleCurrency,
          exchangeRate,
        }),
      )
    ) {
      return { ok: false };
    }
  } else if (advanceCheck.needsCrossCurrencyConfirm) {
    if (!window.confirm(buildCrossCurrencyAdvanceConfirmMessage(advanceCheck, exchangeRate))) {
      return { ok: false };
    }
  } else if ((meta.splitCurrency || meta.crossCurrency) && (uzsT > 0 || usdT > 0)) {
    if (
      !window.confirm(
        buildSplitCurrencyConfirmMessage({
          sale,
          uzsAmount: uzsT,
          usdAmount: usdT,
          due: meta.due,
          sc: meta.sc,
          cbuRate,
          paidInSaleCurrency: meta.paid,
          exchangeRate,
        }),
      )
    ) {
      return { ok: false };
    }
  }

  if (meta.exceedsRemainingDue) {
    showNotification?.(
      `Payment cannot exceed the remaining amount due (${formatDisplayAmount(meta.due, meta.sc)} after advance).`,
      'error',
    );
    return { ok: false };
  }

  if (allowDiscount && meta.needs && paymentFormData.balance_shortfall_type !== 'discount') {
    showNotification?.(
      'Payment is below the amount due. Select Discount to record the remainder, or collect more.',
      'error',
    );
    return { ok: false };
  }

  if (meta.hasOverpayment && meta.due != null && meta.overpaymentAmount != null) {
    const dueLabel = formatDisplayAmount(meta.due, meta.sc);
    const paidLabel = formatDisplayAmount(meta.paid, meta.sc);
    const excessLabel = formatDisplayAmount(meta.overpaymentAmount, meta.sc);
    const msg = [
      'Payment entered is higher than amount due.',
      `Due: ${dueLabel} · Entered: ${paidLabel} · Excess: ${excessLabel}.`,
      meta.splitCurrency && exchangeRate?.label ? `(Total at CBU rate: ${exchangeRate.label})` : null,
      'The extra amount will still be booked as collected payment.',
      'Continue?',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!window.confirm(msg)) return { ok: false };
  }

  const requestData = buildCompleteSaleRequest(paymentFormData, meta, exchangeRate);
  return { ok: true, requestData, meta };
}

/** Total in sale list currency from UZS/USD legs (for delivery settlement display/API). */
export function combinedPaymentInSaleCurrency(sale, uzsStr, usdStr, cbuRate) {
  return paymentAmountInSaleCurrency(uzsStr, usdStr, sale?.sale_currency, cbuRate);
}
