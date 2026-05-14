/** Per-unit USD cost buckets only (cash + card; no UZS conversion). Mirrors backend Product.cost_per_unit_usd_equivalent. */
export function productCostUsdPortion(p) {
  if (!p) return 0;
  return (parseFloat(p.cost_usd_cash) || 0) + (parseFloat(p.cost_usd_card) || 0);
}

/** Per-unit UZS cost buckets only (cash + card). Mirrors backend Product.cost_per_unit_uzs_total. */
export function productCostUzsPortion(p) {
  if (!p) return 0;
  return (parseFloat(p.cost_uzs_cash) || 0) + (parseFloat(p.cost_uzs_card) || 0);
}

/**
 * Picker / list line: product #id, name, and cost segments without "cash" or "card" labels.
 */
export function productCostPickerLabel(p) {
  if (!p) return '';
  const bits = [];
  const uzsT = productCostUzsPortion(p);
  if (uzsT > 0) bits.push(`UZS ${uzsT.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  const usdT = productCostUsdPortion(p);
  if (usdT > 0) bits.push(`$${usdT.toFixed(2)}`);
  if (bits.length) {
    return `#${p.id} ${p.brand} ${p.model} — ${p.size} (${p.color}) · ${bits.join(' · ')}`;
  }
  return `#${p.id} ${p.brand} ${p.model} — ${p.size} (${p.color})`;
}

/** Combined per-unit costs for table columns (currency totals; legacy *_card folds in). */
export function productCostCells(p) {
  if (!p) return { uzsTotal: '—', usdTotal: '—' };
  const uzsT = productCostUzsPortion(p);
  const usdT = productCostUsdPortion(p);
  return {
    uzsTotal:
      uzsT > 0 ? uzsT.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—',
    usdTotal: usdT > 0 ? `$${usdT.toFixed(2)}` : '—',
  };
}

/**
 * New sale product dropdown: #id, brand/model/size/color, cost bits, then selling price (no "List" label — avoids looking like "Line").
 */
export function productSalePickerLabel(p) {
  if (!p) return '';
  const list =
    p.selling_price != null && p.selling_price !== '' && !Number.isNaN(parseFloat(p.selling_price))
      ? `$${parseFloat(p.selling_price).toFixed(2)}`
      : '—';
  const core = productCostPickerLabel(p).replace(/\u2014/g, ' - ');
  return `${core} · ${list}`;
}
