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
 * Two-field totals for Orders.js payment form (UZS / USD), from planned supplier buckets.
 */
export function prefillPayOrderSimpleTotals(order) {
  const b = prefillPayOrderFromSupplier(order);
  const uzs = (parseFloat(b.uzs_cash) || 0) + (parseFloat(b.uzs_card) || 0);
  const usd = (parseFloat(b.usd_cash) || 0) + (parseFloat(b.usd_card) || 0);
  return {
    uzs: uzs > 0 ? String(Number(uzs.toFixed(2))) : '',
    usd: usd > 0 ? String(Number(usd.toFixed(2))) : '',
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
