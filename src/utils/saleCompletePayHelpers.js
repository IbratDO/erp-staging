/** Shared logic for "Complete & Pay" (sale status → completed) used from Sales and Dispatchers tabs. */
import i18n from '../i18n';

/** Match backend _validate_and_set_sale_completion_shortfall tolerance (USD sale currency). */
export const PAYMENT_SHORTFALL_TOLERANCE = 0.005;

export function saleHasOrderAdvance(sale) {
  if (!sale) return false;
  const advance = parseFloat(sale.advance_payment_received) || 0;
  return advance > 0 && (sale.sale_type === 'from_order' || sale.order != null);
}

/** Per-unit price customer pays: selling_price minus discount amount. */
export function saleEffectiveUnitPrice(sale) {
  if (!sale) return 0;
  const list = parseFloat(sale.selling_price) || 0;
  const discount = parseFloat(sale.discount_price) || 0;
  return Math.max(0, list - discount);
}

export function saleDiscountAmountPerUnit(sale) {
  if (!sale) return 0;
  const discount = parseFloat(sale.discount_price);
  return Number.isFinite(discount) && discount > 0 ? discount : 0;
}

export function uzsToUsd(uzsAmount, rate) {
  const uzs = parseFloat(uzsAmount) || 0;
  const r = parseFloat(rate);
  if (!uzs || !r || r <= 0) return 0;
  return Math.round((uzs / r) * 100) / 100;
}

export function usdToUzs(usdAmount, rate) {
  const usd = parseFloat(usdAmount) || 0;
  const r = parseFloat(rate);
  if (!usd || !r || r <= 0) return 0;
  return Math.round(usd * r);
}

/** Combined payment in the sale's list currency using CBU rate (UZS per 1 USD). */
export function paymentTotalInSaleCurrency(uzsAmount, usdAmount, saleCurrency, rate) {
  const sc = (saleCurrency || 'USD').toUpperCase();
  const uzs = parseFloat(uzsAmount) || 0;
  const usd = parseFloat(usdAmount) || 0;
  if (sc === 'USD') {
    return Math.round((usd + uzsToUsd(uzs, rate)) * 100) / 100;
  }
  return usdToUzs(usd, rate) + uzs;
}

/** True when UZS/USD legs must be converted via CBU to compare to list currency. */
export function paymentNeedsCbuConversion(uzsAmount, usdAmount, saleCurrency) {
  const sc = (saleCurrency || 'USD').toUpperCase();
  const uzs = parseFloat(uzsAmount) || 0;
  const usd = parseFloat(usdAmount) || 0;
  return (
    (uzs > 0 && usd > 0) ||
    (sc === 'USD' && uzs > 0 && usd === 0) ||
    (sc === 'UZS' && usd > 0 && uzs === 0)
  );
}

/**
 * Payment total in list currency; null when CBU is required but rate is not loaded yet.
 * Matches backend payment_total_in_sale_currency / _payment_amount_in_sale_currency.
 */
export function paymentAmountInSaleCurrency(uzsStr, usdStr, saleCurrency, cbuRate) {
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;
  if (uzsT <= 0 && usdT <= 0) return null;
  if (paymentNeedsCbuConversion(uzsT, usdT, saleCurrency)) {
    if (!cbuRate) return null;
    return paymentTotalInSaleCurrency(uzsT, usdT, saleCurrency, cbuRate);
  }
  const sc = (saleCurrency || 'USD').toUpperCase();
  return sc === 'USD' ? usdT : uzsT;
}

function formatAmountForCurrency(amount, currency) {
  const sc = (currency || 'USD').toUpperCase();
  if (sc === 'UZS') {
    return `${Math.round(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`;
  }
  return `$${amount.toFixed(2)} USD`;
}

export function computeAdvanceRemainingDue(sale, sellingPriceOverride) {
  if (!sale) return 0;
  let total;
  if (sellingPriceOverride != null && sellingPriceOverride !== '') {
    const qty = parseFloat(sale.quantity) || 0;
    total = parseFloat(sellingPriceOverride) * qty;
  } else if (sale.total_amount != null && sale.total_amount !== '') {
    total = parseFloat(sale.total_amount);
  } else {
    const qty = parseFloat(sale.quantity) || 0;
    total = saleEffectiveUnitPrice(sale) * qty;
  }
  const advance = parseFloat(sale.advance_payment_received) || 0;
  return Math.max(0, (Number.isFinite(total) ? total : 0) - advance);
}

export function paymentHasShortfall(due, paid, saleCurrency) {
  const d = parseFloat(due) || 0;
  const p = parseFloat(paid) || 0;
  if ((saleCurrency || 'USD').toUpperCase() === 'UZS') {
    return p + 1 < d;
  }
  return p + PAYMENT_SHORTFALL_TOLERANCE < d;
}

export function validateAdvanceCompletionPayment(sale, uzsStr, usdStr, sellingPriceOverride, cbuRate) {
  if (!saleHasOrderAdvance(sale)) {
    return { ok: true };
  }
  const due = computeAdvanceRemainingDue(sale, sellingPriceOverride);
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;

  if (uzsT > 0 && usdT > 0) {
    if (!cbuRate) {
      return { ok: false, error: 'Exchange rate is still loading. Try again in a moment.' };
    }
    const paid = paymentTotalInSaleCurrency(uzsT, usdT, sc, cbuRate);
    if (paid > due + 0.005) {
      return {
        ok: false,
        error: `Payment cannot exceed the remaining amount due (${formatAmountForCurrency(due, sc)} after advance, at CBU rate).`,
      };
    }
    return {
      ok: true,
      needsSplitCurrencyConfirm: true,
      due,
      sc,
      uzsAmount: uzsT,
      usdAmount: usdT,
      paidInSaleCurrency: paid,
      cbuRate,
    };
  }

  if (sc === 'USD') {
    if (usdT > due + 0.005) {
      return {
        ok: false,
        error: `Payment cannot exceed the remaining amount due (${due.toFixed(2)} USD after advance).`,
      };
    }
    if (uzsT > 0 && usdT === 0) {
      return {
        ok: true,
        needsCrossCurrencyConfirm: true,
        due,
        sc,
        otherCurrency: 'UZS',
        otherAmount: uzsT,
      };
    }
  } else {
    if (uzsT > due + 0.005) {
      return {
        ok: false,
        error: `Payment cannot exceed the remaining amount due (${due.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS after advance).`,
      };
    }
    if (usdT > 0 && uzsT === 0) {
      return {
        ok: true,
        needsCrossCurrencyConfirm: true,
        due,
        sc,
        otherCurrency: 'USD',
        otherAmount: usdT,
      };
    }
  }

  return { ok: true };
}

export function buildCrossCurrencyAdvanceConfirmMessage(validation, exchangeRate) {
  const { due, sc, otherCurrency, otherAmount } = validation;
  const dueLabel = formatAmountForCurrency(due, sc);
  const payLabel = formatAmountForCurrency(otherAmount, otherCurrency);
  const rateLine = exchangeRate?.label
    ? `Based on CBU exchange rate: ${exchangeRate.label}`
    : exchangeRate?.rate
      ? `Based on CBU exchange rate: 1 USD = ${Number(exchangeRate.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} UZS`
      : null;
  const equiv =
    exchangeRate?.rate && otherAmount > 0
      ? sc === 'USD' && otherCurrency === 'UZS'
        ? `(equivalent to ${formatAmountForCurrency(uzsToUsd(otherAmount, exchangeRate.rate), sc)} at CBU rate)`
        : sc === 'UZS' && otherCurrency === 'USD'
          ? `(equivalent to ${formatAmountForCurrency(usdToUzs(otherAmount, exchangeRate.rate), sc)} at CBU rate)`
          : null
      : null;
  return [
    rateLine,
    `This sale is listed in ${sc}. Advance payment was already received.`,
    `Remaining due (in ${sc}): ${dueLabel}.`,
    `You are recording ${payLabel} in ${otherCurrency}${equiv ? ` ${equiv}` : ''} as the balance payment.`,
    'Continue?',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildSplitCurrencyConfirmMessage({
  sale,
  uzsAmount,
  usdAmount,
  due,
  sc,
  cbuRate,
  paidInSaleCurrency,
  exchangeRate,
}) {
  const saleCurrency = sc || sale?.sale_currency || 'USD';
  const rateLabel =
    exchangeRate?.label ||
    (cbuRate ? `1 USD = ${Number(cbuRate).toLocaleString(undefined, { maximumFractionDigits: 2 })} UZS (CBU rate)` : null);
  const uzsLine =
    uzsAmount > 0
      ? sc === 'USD'
        ? `- ${formatAmountForCurrency(uzsAmount, 'UZS')} (equivalent to ${formatAmountForCurrency(uzsToUsd(uzsAmount, cbuRate), sc)} at CBU rate)`
        : `- ${formatAmountForCurrency(uzsAmount, 'UZS')}`
      : null;
  const usdLine =
    usdAmount > 0
      ? sc === 'UZS'
        ? `- ${formatAmountForCurrency(usdAmount, 'USD')} (equivalent to ${formatAmountForCurrency(usdToUzs(usdAmount, cbuRate), sc)} at CBU rate)`
        : `- ${formatAmountForCurrency(usdAmount, 'USD')}`
      : null;
  const totalPaid =
    paidInSaleCurrency != null
      ? formatAmountForCurrency(paidInSaleCurrency, saleCurrency)
      : formatAmountForCurrency(paymentTotalInSaleCurrency(uzsAmount, usdAmount, saleCurrency, cbuRate), saleCurrency);
  return [
    rateLabel ? `Based on CBU exchange rate: ${rateLabel}` : null,
    `Amount due: ${formatAmountForCurrency(due, saleCurrency)}`,
    'You are paying:',
    uzsLine,
    usdLine,
    `Total payment (in ${saleCurrency}): ${totalPaid}`,
    'Continue?',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const emptyPaymentFormState = () => ({
  saleId: null,
  uzs: '',
  usd: '',
  prepayment_amount: '',
  total_sale_amount: '',
  dispatch_payment_needed: false,
  dispatch_payment_amount: '',
  dispatch_payment_currency: 'UZS',
  balance_shortfall_type: '',
  completion_notes: '',
});

/**
 * Build initial payment form from a sale (same rules as Sales handleStatusUpdate → completed).
 */
/** Step 2 prefill: same UZS/USD split recorded at delivery step 1 (not CBU-converted total). */
export function deliveryStep2PaymentFromStep1(sale) {
  if (!sale?.delivery_customer_paid_at || sale.delivery_shop_remittance_at) {
    return null;
  }
  const uzs = parseFloat(sale.delivery_customer_collected_uzs) || 0;
  const usd = parseFloat(sale.delivery_customer_collected_usd) || 0;
  if (uzs <= 0 && usd <= 0) {
    return null;
  }
  return {
    uzs: uzs > 0 ? String(Math.round(uzs) === uzs ? Math.round(uzs) : uzs) : '',
    usd: usd > 0 ? (Number.isInteger(usd) ? String(usd) : usd.toFixed(2)) : '',
  };
}

export function buildPaymentFormDataFromSale(sale) {
  if (!sale) return emptyPaymentFormState();

  const unitPrice = saleEffectiveUnitPrice(sale);
  const quantity = parseFloat(sale.quantity || 0);
  const totalAmount = !isNaN(unitPrice * quantity) ? unitPrice * quantity : 0;
  const advancePayment = parseFloat(sale.advance_payment_received || 0);
  const nowBeingPaid = totalAmount - advancePayment;

  const dispatch = sale.dispatch_info;
  const uzsV = dispatch ? parseFloat(dispatch.delivery_cost_uzs || 0) : 0;
  const usdV = dispatch ? parseFloat(dispatch.delivery_cost || 0) : 0;
  const hasDispatchCost = !!(dispatch && (uzsV > 0 || usdV > 0));
  const dispatchPaymentNeeded = !!(dispatch && !dispatch.is_paid && hasDispatchCost);
  const dispatchAmountForForm = hasDispatchCost
    ? uzsV > 0
      ? (dispatch.delivery_cost_uzs != null && dispatch.delivery_cost_uzs !== ''
          ? String(dispatch.delivery_cost_uzs)
          : '')
      : dispatch.delivery_cost != null && dispatch.delivery_cost !== ''
        ? String(dispatch.delivery_cost)
        : ''
    : '';

  const isFromOrder = !!(sale.order || advancePayment > 0 || sale.sale_type === 'from_order');
  const sc = sale.sale_currency || 'USD';
  const listUnit = parseFloat(sale.selling_price) || 0;
  const discountAmountPerUnit = saleDiscountAmountPerUnit(sale);
  const finalUnit = saleEffectiveUnitPrice(sale);
  const listTotal = listUnit * quantity;
  const discountTotal = discountAmountPerUnit * quantity;

  return {
    saleId: sale.id,
    completion_notes: '',
    uzs: '',
    usd: isFromOrder
      ? (nowBeingPaid > 0 ? nowBeingPaid.toFixed(2) : '0')
      : totalAmount.toFixed(2),
    prepayment_amount: isFromOrder && advancePayment > 0 ? advancePayment.toFixed(2) : '',
    total_sale_amount: isFromOrder && advancePayment > 0 ? totalAmount.toFixed(2) : '',
    list_unit_price: listUnit,
    discount_amount_per_unit: discountAmountPerUnit,
    final_unit_price: finalUnit,
    list_total_amount: listTotal,
    sale_discount_total: discountTotal,
    final_amount_due: nowBeingPaid > 0 ? nowBeingPaid : totalAmount,
    sale_currency: sc,
    dispatch_payment_needed: !!dispatchPaymentNeeded,
    dispatch_payment_amount: dispatchPaymentNeeded ? dispatchAmountForForm : '',
    dispatch_payment_currency: dispatchPaymentNeeded
      ? parseFloat(dispatch.delivery_cost_uzs || 0) > 0
        ? 'UZS'
        : 'USD'
      : 'UZS',
    balance_shortfall_type: '',
  };
}

/**
 * Shortfall: underpayment may be completed as discount only after the user selects it (no on credit).
 */
export function computePaymentShortfallMeta(sale, paymentFormData, cbuRate) {
  if (!sale) {
    return {
      needs: false,
      mixed: false,
      splitCurrency: false,
      crossCurrency: false,
      short: 0,
      due: null,
      paid: null,
      sc: 'USD',
      hasOverpayment: false,
      overpaymentAmount: null,
    };
  }
  const due = computeAdvanceRemainingDue(sale);
  const uzsT = parseFloat(paymentFormData.uzs) || 0;
  const usdT = parseFloat(paymentFormData.usd) || 0;
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const hasAdvance = saleHasOrderAdvance(sale);
  const splitCurrency = uzsT > 0 && usdT > 0;
  const needsCbu = paymentNeedsCbuConversion(uzsT, usdT, sc);
  const crossCurrency = needsCbu && !splitCurrency;

  if (needsCbu && !cbuRate && (uzsT > 0 || usdT > 0)) {
    return {
      needs: false,
      mixed: true,
      splitCurrency,
      crossCurrency,
      short: due,
      sc,
      due,
      paid: null,
      hasOverpayment: false,
      overpaymentAmount: null,
      hasAdvance,
      exceedsRemainingDue: false,
    };
  }

  const paid = paymentAmountInSaleCurrency(paymentFormData.uzs, paymentFormData.usd, sc, cbuRate);
  const short = paid != null ? due - paid : due;
  const payingOtherCurrency =
    hasAdvance &&
    ((sc === 'USD' && uzsT > 0 && usdT === 0) || (sc === 'UZS' && usdT > 0 && uzsT === 0));
  const exceedsRemainingDue =
    hasAdvance && paid != null && paid > due + PAYMENT_SHORTFALL_TOLERANCE;
  const overpaymentAmount =
    !hasAdvance && paid != null && paid > due + PAYMENT_SHORTFALL_TOLERANCE ? paid - due : null;
  const hasOverpayment =
    !hasAdvance && !!overpaymentAmount && overpaymentAmount > PAYMENT_SHORTFALL_TOLERANCE;
  const needs =
    paid != null && !payingOtherCurrency && paymentHasShortfall(due, paid, sc);

  return {
    needs,
    mixed: false,
    splitCurrency,
    crossCurrency,
    short,
    sc,
    due,
    paid,
    hasOverpayment,
    overpaymentAmount,
    hasAdvance,
    exceedsRemainingDue,
  };
}

/** Reserved sale: total_amount − deposit; supports combined UZS+USD at CBU rate. */
export function computeReservedPaymentMeta(sale, uzsStr, usdStr, cbuRate) {
  if (!sale) {
    return {
      needsDiscountChoice: false,
      needsRate: false,
      splitCurrency: false,
      crossCurrency: false,
    };
  }
  const deposit = sale.deposit_received ? parseFloat(sale.deposit_amount || 0) : 0;
  const due = parseFloat(sale.total_amount || 0) - deposit;
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;
  const splitCurrency = uzsT > 0 && usdT > 0;
  const crossCurrency =
    !splitCurrency &&
    ((sc === 'USD' && uzsT > 0 && usdT === 0) || (sc === 'UZS' && usdT > 0 && uzsT === 0));

  if (uzsT === 0 && usdT === 0) {
    return { needsDiscountChoice: false, needsRate: false, splitCurrency, crossCurrency, due, sc };
  }

  if ((splitCurrency || crossCurrency) && !cbuRate) {
    return {
      needsDiscountChoice: false,
      needsRate: true,
      splitCurrency,
      crossCurrency,
      due,
      sc,
      uzsT,
      usdT,
    };
  }

  const paid = paymentAmountInSaleCurrency(uzsStr, usdStr, sc, cbuRate);
  const short = paid != null ? due - paid : due;
  const needsDiscountChoice = paymentHasShortfall(due, paid, sc);
  return {
    needsDiscountChoice,
    needsRate: false,
    splitCurrency,
    crossCurrency,
    due,
    paid,
    short,
    sc,
    uzsT,
    usdT,
  };
}

export function buildCompleteSaleRequest(paymentFormData, meta, exchangeRate) {
  const requestData = {
    status: 'completed',
    notes: String(paymentFormData.completion_notes || '').trim(),
    uzs: parseFloat(paymentFormData.uzs) || 0,
    usd: parseFloat(paymentFormData.usd) || 0,
  };
  if (paymentFormData.balance_shortfall_type === 'discount') {
    requestData.balance_shortfall_type = 'discount';
  }
  const uzsT = requestData.uzs;
  const usdT = requestData.usd;
  const needsCbu =
    exchangeRate?.rate &&
    ((uzsT > 0 && usdT > 0) ||
      meta?.splitCurrency ||
      (meta?.crossCurrency && (uzsT > 0 || usdT > 0)));
  if (needsCbu) {
    requestData.exchange_rate = exchangeRate.rate;
  }
  if (paymentFormData.dispatch_payment_needed) {
    const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
    requestData.dispatch_payment_amount = dAmt;
    requestData.dispatch_payment_currency = paymentFormData.dispatch_payment_currency || 'UZS';
  }
  return requestData;
}

/** Split one group payment across line items (remainder on last sale to avoid rounding drift). */
export function buildGroupCompleteRequests(groupSales, paymentFormData, meta, exchangeRate) {
  if (!groupSales?.length) return [];
  const dues = groupSales.map((sale) => computeAdvanceRemainingDue(sale));
  const totalDue = dues.reduce((sum, d) => sum + d, 0);
  const uzsIn = parseFloat(paymentFormData.uzs) || 0;
  const usdIn = parseFloat(paymentFormData.usd) || 0;
  let uzsLeft = uzsIn;
  let usdLeft = usdIn;

  const applyGroupDiscount = paymentFormData.balance_shortfall_type === 'discount';

  return groupSales.map((sale, idx) => {
    const isLast = idx === groupSales.length - 1;
    const weight = totalDue > 0 ? dues[idx] / totalDue : 1 / groupSales.length;
    const uzsShare = isLast ? uzsLeft : Math.round(uzsIn * weight);
    const usdShare = isLast ? usdLeft : Math.round(usdIn * weight * 100) / 100;
    uzsLeft -= uzsShare;
    usdLeft -= usdShare;

    const childForm = {
      ...paymentFormData,
      uzs: uzsShare > 0 ? String(uzsShare) : '',
      usd: usdShare > 0 ? String(usdShare) : '',
      balance_shortfall_type: applyGroupDiscount ? 'discount' : '',
    };
    const childMeta = isLast ? meta : { ...meta, needs: false, hasOverpayment: false, overpaymentAmount: null };
    return {
      id: sale.id,
      data: buildCompleteSaleRequest(childForm, childMeta, exchangeRate),
    };
  });
}

/** Delivery after dispatch: 3-step settlement instead of single Complete & Pay (shop or from-order). */
export function shopDeliverySettlementRequired(sale) {
  if (!sale || sale.status !== 'dispatched') return false;
  if (sale.sale_type !== 'delivery') return false;
  return !!sale.dispatch_info;
}

/** 1–3 which settlement step applies; 0 if every timestamp exists (usually sale is completed). Null if not eligible. */
export function shopDeliverySettlementActiveStep(sale) {
  if (!shopDeliverySettlementRequired(sale)) return null;
  if (!sale.delivery_customer_paid_at) return 1;
  if (!sale.delivery_shop_remittance_at) return 2;
  if (!sale.delivery_dispatcher_fee_completed_at) return 3;
  return 0;
}

/** Primary label for the third settlement action (dispatch fee vs no fee). */
export function shopDeliverySettlementStep3Label(sale) {
  const d = sale?.dispatch_info || null;
  const uzFee = d ? parseFloat(d.delivery_cost_uzs ?? 0) || 0 : 0;
  const usFee = d ? parseFloat(d.delivery_cost ?? 0) || 0 : 0;
  const needsDispatchFeePayment = !!(d && !d.is_paid && (uzFee > 0 || usFee > 0));
  return needsDispatchFeePayment
    ? i18n.t('deliverySettlement.btnStep3Pay', { ns: 'sales' })
    : i18n.t('deliverySettlement.btnStep3Complete', { ns: 'sales' });
}
