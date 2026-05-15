/** Shared logic for "Complete & Pay" (sale status → completed) used from Sales and Dispatchers tabs. */

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

  const sellingPrice = parseFloat(sale.selling_price || 0);
  const quantity = parseFloat(sale.quantity || 0);
  const totalAmount = !isNaN(sellingPrice * quantity) ? sellingPrice * quantity : 0;
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

  return {
    saleId: sale.id,
    completion_notes: '',
    uzs: '',
    usd: isFromOrder
      ? (nowBeingPaid > 0 ? nowBeingPaid.toFixed(2) : '0')
      : totalAmount.toFixed(2),
    prepayment_amount: isFromOrder && advancePayment > 0 ? advancePayment.toFixed(2) : '',
    total_sale_amount: isFromOrder && advancePayment > 0 ? totalAmount.toFixed(2) : '',
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
  const advance = parseFloat(sale.advance_payment_received) || 0;
  const due = parseFloat(sale.selling_price) * (sale.quantity || 0) - advance;
  const uzsT = parseFloat(paymentFormData.uzs) || 0;
  const usdT = parseFloat(paymentFormData.usd) || 0;
  const sc = sale.sale_currency || 'USD';
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
    };
  }
  const paid = sc === 'USD' ? usdT : uzsT;
  const short = due - paid;
  const needs =
    short > 0.01 && ((sc === 'USD' && uzsT === 0) || (sc === 'UZS' && usdT === 0));
  const overpaymentAmount =
    sameSaleCurrencyBuckets && paid > due + 0.005 ? paid - due : null;
  const hasOverpayment =
    !!overpaymentAmount && overpaymentAmount > 0.005;
  return {
    needs,
    mixed: false,
    short,
    sc,
    due,
    paid,
    hasOverpayment,
    overpaymentAmount,
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
