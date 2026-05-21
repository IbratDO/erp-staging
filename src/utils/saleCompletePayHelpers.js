/** Shared logic for "Complete & Pay" (sale status → completed) used from Sales and Dispatchers tabs. */

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

export function computeAdvanceRemainingDue(sale, sellingPriceOverride) {
  if (!sale) return 0;
  const price =
    sellingPriceOverride != null && sellingPriceOverride !== ''
      ? parseFloat(sellingPriceOverride)
      : saleEffectiveUnitPrice(sale);
  const qty = parseFloat(sale.quantity) || 0;
  const total = (Number.isFinite(price) ? price : 0) * qty;
  const advance = parseFloat(sale.advance_payment_received) || 0;
  return Math.max(0, total - advance);
}

export function validateAdvanceCompletionPayment(sale, uzsStr, usdStr, sellingPriceOverride) {
  if (!saleHasOrderAdvance(sale)) {
    return { ok: true };
  }
  const due = computeAdvanceRemainingDue(sale, sellingPriceOverride);
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;

  if (uzsT > 0 && usdT > 0) {
    return {
      ok: false,
      error: 'Enter the remaining balance in one currency only (USD or UZS).',
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

export function buildCrossCurrencyAdvanceConfirmMessage(validation) {
  const { due, sc, otherCurrency, otherAmount } = validation;
  const dueLabel =
    sc === 'UZS'
      ? `${due.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
      : `$${due.toFixed(2)} USD`;
  const payLabel =
    otherCurrency === 'UZS'
      ? `${otherAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
      : `$${otherAmount.toFixed(2)} USD`;
  return [
    `This sale is listed in ${sc}. Advance payment was already received.`,
    `Remaining due (in ${sc}): ${dueLabel}.`,
    `You are recording ${payLabel} in ${otherCurrency} as the balance payment.`,
    'Continue?',
  ].join('\n\n');
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
export function computePaymentShortfallMeta(sale, paymentFormData) {
  if (!sale) {
    return {
      needs: false,
      mixed: false,
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
  const sc = sale.sale_currency || 'USD';
  const hasAdvance = saleHasOrderAdvance(sale);
  const sameSaleCurrencyBuckets =
    (sc === 'USD' && uzsT === 0) || (sc === 'UZS' && usdT === 0);
  if (uzsT > 0 && usdT > 0) {
    const paid = sc === 'USD' ? usdT : uzsT;
    return {
      needs: false,
      mixed: true,
      short: due - paid,
      sc,
      due,
      paid,
      hasOverpayment: false,
      overpaymentAmount: null,
      hasAdvance,
      exceedsRemainingDue: false,
    };
  }
  const paid = sc === 'USD' ? usdT : uzsT;
  const short = due - paid;
  const payingOtherCurrency =
    hasAdvance &&
    ((sc === 'USD' && uzsT > 0 && usdT === 0) || (sc === 'UZS' && usdT > 0 && uzsT === 0));
  const needs =
    !payingOtherCurrency &&
    short > 0.01 &&
    ((sc === 'USD' && uzsT === 0) || (sc === 'UZS' && usdT === 0));
  const exceedsRemainingDue =
    hasAdvance &&
    sameSaleCurrencyBuckets &&
    paid > due + 0.005;
  const overpaymentAmount =
    !hasAdvance && sameSaleCurrencyBuckets && paid > due + 0.005 ? paid - due : null;
  const hasOverpayment =
    !hasAdvance && !!overpaymentAmount && overpaymentAmount > 0.005;
  return {
    needs,
    mixed: false,
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

export function buildCompleteSaleRequest(paymentFormData, meta) {
  const requestData = {
    status: 'completed',
    notes: String(paymentFormData.completion_notes || '').trim(),
    uzs: parseFloat(paymentFormData.uzs) || 0,
    usd: parseFloat(paymentFormData.usd) || 0,
  };
  if (meta.needs && paymentFormData.balance_shortfall_type === 'discount') {
    requestData.balance_shortfall_type = 'discount';
  }
  if (paymentFormData.dispatch_payment_needed) {
    const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
    requestData.dispatch_payment_amount = dAmt;
    requestData.dispatch_payment_currency = paymentFormData.dispatch_payment_currency || 'UZS';
  }
  return requestData;
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
  return needsDispatchFeePayment ? 'Pay for dispatch & complete sale' : 'Complete sale';
}
