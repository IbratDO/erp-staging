/** Shared logic for "Complete & Pay" (sale status → completed) used from Sales and Dispatchers tabs. */

export const emptyPaymentFormState = () => ({
  saleId: null,
  uzs_cash: '',
  uzs_card: '',
  usd_cash: '',
  usd_card: '',
  prepayment_amount: '',
  total_sale_amount: '',
  dispatch_payment_needed: false,
  dispatch_payment_amount: '',
  dispatch_payment_currency: 'UZS',
  dispatch_payment_type: 'cash',
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
      ? String(dispatch.delivery_cost_uzs)
      : String(dispatch.delivery_cost ?? '')
    : '';

  const isFromOrder = !!(sale.order || advancePayment > 0 || sale.sale_type === 'from_order');

  return {
    saleId: sale.id,
    completion_notes: '',
    uzs_cash: '',
    uzs_card: '',
    usd_cash: isFromOrder
      ? (nowBeingPaid > 0 ? nowBeingPaid.toFixed(2) : '0')
      : totalAmount.toFixed(2),
    usd_card: '',
    prepayment_amount: isFromOrder && advancePayment > 0 ? advancePayment.toFixed(2) : '',
    total_sale_amount: isFromOrder && advancePayment > 0 ? totalAmount.toFixed(2) : '',
    dispatch_payment_needed: !!dispatchPaymentNeeded,
    dispatch_payment_amount: dispatchPaymentNeeded ? dispatchAmountForForm : '',
    dispatch_payment_currency: dispatchPaymentNeeded
      ? parseFloat(dispatch.delivery_cost_uzs || 0) > 0
        ? 'UZS'
        : 'USD'
      : 'UZS',
    dispatch_payment_type: dispatchPaymentNeeded
      ? dispatch.delivery_payment_cash && parseFloat(dispatch.delivery_payment_cash) > 0
        ? 'cash'
        : 'card'
      : 'cash',
    balance_shortfall_type: '',
  };
}

/**
 * Shortfall / discount / on_credit meta for the payment form.
 */
export function computePaymentShortfallMeta(sale, paymentFormData) {
  if (!sale) {
    return { needs: false, mixed: false, short: 0, due: null, paid: null, sc: 'USD' };
  }
  const advance = parseFloat(sale.advance_payment_received) || 0;
  const due = parseFloat(sale.selling_price) * (sale.quantity || 0) - advance;
  const uzsT =
    (parseFloat(paymentFormData.uzs_cash) || 0) + (parseFloat(paymentFormData.uzs_card) || 0);
  const usdT =
    (parseFloat(paymentFormData.usd_cash) || 0) + (parseFloat(paymentFormData.usd_card) || 0);
  const sc = sale.sale_currency || 'USD';
  if (uzsT > 0 && usdT > 0) {
    const paid = sc === 'USD' ? usdT : uzsT;
    return {
      needs: false,
      mixed: true,
      short: due - paid,
      sc,
      due,
      paid,
    };
  }
  const paid = sc === 'USD' ? usdT : uzsT;
  const short = due - paid;
  const needs =
    short > 0.01 && ((sc === 'USD' && uzsT === 0) || (sc === 'UZS' && usdT === 0));
  return { needs, mixed: false, short, sc, due, paid };
}

export function buildCompleteSaleRequest(paymentFormData, meta) {
  const requestData = {
    status: 'completed',
    notes: String(paymentFormData.completion_notes || '').trim(),
    uzs_cash: parseFloat(paymentFormData.uzs_cash) || 0,
    uzs_card: parseFloat(paymentFormData.uzs_card) || 0,
    usd_cash: parseFloat(paymentFormData.usd_cash) || 0,
    usd_card: parseFloat(paymentFormData.usd_card) || 0,
  };
  if (meta.needs) {
    requestData.balance_shortfall_type = paymentFormData.balance_shortfall_type;
  }
  if (paymentFormData.dispatch_payment_needed) {
    const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
    requestData.dispatch_payment_amount = dAmt;
    requestData.dispatch_payment_currency = paymentFormData.dispatch_payment_currency || 'UZS';
    requestData.dispatch_payment_type = paymentFormData.dispatch_payment_type || 'cash';
  }
  return requestData;
}
