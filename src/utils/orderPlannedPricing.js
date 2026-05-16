/** Helpers mirroring Orders tab planned supplier/selling summaries (same rules, no FX). */

export function numOrZero(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return n > 0 && !Number.isNaN(n) ? n : 0;
}

/** Selling summary string for one line ("$X/u" from USD buckets or legacy selling_price). */
export function plannedSellingSummary(order) {
  if (!order) return '';
  const qi = Math.max(parseInt(order.ordered_quantity, 10) || 1, 1);
  const usdTotal = numOrZero(order.selling_usd_cash) + numOrZero(order.selling_usd_card);
  if (usdTotal > 0) return `$${(usdTotal / qi).toFixed(2)}/u`;
  const pu = parseFloat(order.selling_price);
  if (order.selling_price != null && order.selling_price !== '' && !Number.isNaN(pu) && pu > 0) {
    return `$${pu.toFixed(2)}/u`;
  }
  return '';
}

/** Numeric planned USD selling per unit (for forms); null if none. */
export function plannedSellingUsdPerUnit(order) {
  if (!order) return null;
  const qi = Math.max(parseInt(order.ordered_quantity, 10) || 1, 1);
  const usdTotal = numOrZero(order.selling_usd_cash) + numOrZero(order.selling_usd_card);
  if (usdTotal > 0) return usdTotal / qi;
  const pu = parseFloat(order.selling_price);
  if (order.selling_price != null && order.selling_price !== '' && !Number.isNaN(pu) && pu > 0) return pu;
  return null;
}

/** Numeric planned UZS selling per unit (for forms); null if none. */
export function plannedSellingUzsPerUnit(order) {
  if (!order) return null;
  const qi = Math.max(parseInt(order.ordered_quantity, 10) || 1, 1);
  const uzsTotal = numOrZero(order.selling_uzs_cash) + numOrZero(order.selling_uzs_card);
  if (uzsTotal > 0) return uzsTotal / qi;
  return null;
}

/** Per-unit supplier buckets for table cells (UZS-only vs USD branches match plannedSupplierPerUnit). */
export function plannedSupplierUnitParts(order) {
  if (!order) return { uzsPerUnit: null, usdPerUnit: null };
  const qi = Math.max(parseInt(order.ordered_quantity, 10) || 1, 1);
  const uzs = numOrZero(order.supplier_cost_uzs_cash) + numOrZero(order.supplier_cost_uzs_card);
  const usdTot = parseFloat(order.cost_total) || 0;
  const usdPu = parseFloat(order.cost_per_unit);
  const usdBuckets = numOrZero(order.supplier_cost_usd_card) + numOrZero(order.supplier_cost_usd_cash);
  if (usdTot > 0 && uzs <= 0 && !Number.isNaN(usdPu)) {
    return { uzsPerUnit: null, usdPerUnit: usdPu };
  }
  if (uzs > 0 && usdTot <= 0) {
    return {
      uzsPerUnit: uzs / qi,
      usdPerUnit: usdBuckets > 0 ? usdBuckets / qi : null,
    };
  }
  return { uzsPerUnit: null, usdPerUnit: null };
}

export function plannedSupplierPerUnit(order) {
  if (!order) return '—';
  const qi = parseInt(order.ordered_quantity, 10) || 1;
  const uzs = numOrZero(order.supplier_cost_uzs_cash) + numOrZero(order.supplier_cost_uzs_card);
  const usdTot = parseFloat(order.cost_total) || 0;
  const usdPu = parseFloat(order.cost_per_unit) || 0;
  if (usdTot > 0 && uzs <= 0 && !Number.isNaN(usdPu)) return `$${usdPu.toFixed(2)}`;
  if (uzs > 0 && usdTot <= 0) {
    const per = uzs / qi;
    return `${per.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS/u`;
  }
  return '—';
}

export function plannedSupplierTotal(order) {
  if (!order) return '';
  const usdTot = parseFloat(order.cost_total) || 0;
  if (usdTot > 0) return `$${usdTot.toFixed(2)}`;
  return '';
}

/**
 * Planned supplier payment totals for confirm dialogs (UZS buckets, USD buckets, legacy cost_total USD).
 */
export function plannedSupplierPaymentTotals(order) {
  if (!order) return { uzs: 0, usd: 0 };
  const usdBuckets =
    numOrZero(order.supplier_cost_usd_cash) + numOrZero(order.supplier_cost_usd_card);
  const uzsBuckets =
    numOrZero(order.supplier_cost_uzs_cash) + numOrZero(order.supplier_cost_uzs_card);
  const fromCostTotal = parseFloat(order.cost_total) || 0;
  if (uzsBuckets > 0) {
    return { uzs: uzsBuckets, usd: usdBuckets };
  }
  const usd = usdBuckets > 0 ? usdBuckets : fromCostTotal;
  return { uzs: 0, usd };
}
