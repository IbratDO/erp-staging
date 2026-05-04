/**
 * Prefill "Pay for the Order" from planned supplier buckets (+ legacy cost_total as USD cash).
 */
export function prefillPayOrderFromSupplier(order) {
  if (!order) {
    return { uzs_cash: '', uzs_card: '', usd_cash: '', usd_card: '' };
  }
  const uzsCash = parseFloat(order.supplier_cost_uzs_cash) || 0;
  const uzsCard = parseFloat(order.supplier_cost_uzs_card) || 0;
  const usdCash = parseFloat(order.supplier_cost_usd_cash) || 0;
  const usdCard = parseFloat(order.supplier_cost_usd_card) || 0;
  if (uzsCash + uzsCard + usdCash + usdCard > 0) {
    return {
      uzs_cash: uzsCash ? String(uzsCash) : '',
      uzs_card: uzsCard ? String(uzsCard) : '',
      usd_cash: usdCash ? String(usdCash) : '',
      usd_card: usdCard ? String(usdCard) : '',
    };
  }
  const ct = parseFloat(order.cost_total) || 0;
  return {
    uzs_cash: '',
    uzs_card: '',
    usd_cash: ct > 0 ? String(ct.toFixed(2)) : '',
    usd_card: '',
  };
}

/**
 * Prefill payment buckets from planned selling (for status flows that align with sale totals).
 */
export function prefillPayOrderFromSelling(order) {
  if (!order) {
    return { uzs_cash: '', uzs_card: '', usd_cash: '', usd_card: '' };
  }
  const uzsCash = parseFloat(order.selling_uzs_cash) || 0;
  const uzsCard = parseFloat(order.selling_uzs_card) || 0;
  const usdCash = parseFloat(order.selling_usd_cash) || 0;
  const usdCard = parseFloat(order.selling_usd_card) || 0;
  if (uzsCash + uzsCard + usdCash + usdCard > 0) {
    return {
      uzs_cash: uzsCash ? String(uzsCash) : '',
      uzs_card: uzsCard ? String(uzsCard) : '',
      usd_cash: usdCash ? String(usdCash) : '',
      usd_card: usdCard ? String(usdCard) : '',
    };
  }
  const qty = parseInt(order.ordered_quantity, 10) || 0;
  const spu = parseFloat(order.selling_price) || 0;
  const legacyUsdTotal = qty * spu;
  return {
    uzs_cash: '',
    uzs_card: '',
    usd_cash: legacyUsdTotal > 0 ? String(legacyUsdTotal.toFixed(2)) : '',
    usd_card: '',
  };
}
