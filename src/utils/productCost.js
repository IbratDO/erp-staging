export const UZS_PER_USD = 12000;

/** Per-unit cost in USD (same formula as backend Product.cost_per_unit_usd_equivalent). */
export function productCostUsdEquivalent(p) {
  if (!p) return 0;
  const uzs = (parseFloat(p.cost_uzs_cash) || 0) + (parseFloat(p.cost_uzs_card) || 0);
  const usd = (parseFloat(p.cost_usd_cash) || 0) + (parseFloat(p.cost_usd_card) || 0);
  return usd + uzs / UZS_PER_USD;
}

function fmtUzs(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  const v = parseFloat(n);
  if (v === 0) return null;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtUsd(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  const v = parseFloat(n);
  if (v === 0) return null;
  return v.toFixed(2);
}

/**
 * Picker / list line: product #id, name, and cost segments without "cash" or "card" labels.
 */
export function productCostPickerLabel(p) {
  if (!p) return '';
  const bits = [];
  const u1 = fmtUzs(p.cost_uzs_cash);
  const u2 = fmtUzs(p.cost_uzs_card);
  const uzsJoined = [u1, u2].filter(Boolean);
  if (uzsJoined.length) bits.push(`UZS ${uzsJoined.join(' + ')}`);
  const s1 = fmtUsd(p.cost_usd_cash);
  const s2 = fmtUsd(p.cost_usd_card);
  const usdParts = [s1 ? `$${s1}` : null, s2 ? `$${s2}` : null].filter(Boolean);
  if (usdParts.length) bits.push(usdParts.join(' + '));
  if (bits.length) {
    return `#${p.id} ${p.brand} ${p.model} — ${p.size} (${p.color}) · ${bits.join(' · ')}`;
  }
  return `#${p.id} ${p.brand} ${p.model} — ${p.size} (${p.color})`;
}

/** Table cell values for the four cost columns (no combined USD-approx). */
export function productCostCells(p) {
  if (!p) return { uzsCash: '—', uzsCard: '—', usdCash: '—', usdCard: '—' };
  const z = (v) =>
    v != null && parseFloat(v) > 0
      ? parseFloat(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
      : '—';
  const u = (v) =>
    v != null && parseFloat(v) > 0 ? `$${parseFloat(v).toFixed(2)}` : '—';
  return {
    uzsCash: z(p.cost_uzs_cash),
    uzsCard: z(p.cost_uzs_card),
    usdCash: u(p.cost_usd_cash),
    usdCard: u(p.cost_usd_card),
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
