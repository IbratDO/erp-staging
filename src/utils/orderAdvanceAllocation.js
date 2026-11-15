/**
 * Split one customer advance across the lines of an on-demand order.
 *
 * The advance used to be typed per line, which is not how a customer pays: they hand over one
 * sum for the whole order and the shop decides what it covers. So there is now one pair of boxes
 * for the order -- dollars and som -- and this is the arithmetic that turns them into the
 * per-line figures the server stores.
 *
 * **Each currency leg is allocated on its own basis, and that is deliberate.** The dollar advance
 * follows each line's dollar selling total; the som advance follows each line's som selling
 * total. Nothing is ever converted, because this page holds no exchange rate -- and the server's
 * caps are per currency too (a dollar advance is bounded by the dollar selling line, a som
 * advance by the som one), so allocating a leg against the other currency's prices would hand
 * the server a line it must refuse.
 *
 * The practical effect on a mixed basket is the right one: a basket with two dollar-priced items
 * and one som-priced item puts the whole dollar advance on the two dollar lines and the whole som
 * advance on the som line. Each line is credited in the currency it is actually priced in.
 *
 * **The fall back to quantity** (the owner's choice of 2026-11-15) covers the case the shop
 * really has: a selling price is *optional* at order time, because plenty is ordered before
 * anyone has decided what it will go for. With no prices to go by, an equal share per unit is
 * the only honest answer. It matters mostly for the som leg -- the server allows a som advance
 * against a dollar-only selling line, so that is a legitimate order with no som prices in it.
 *
 * **Whole som, cents on dollars, and the last share by subtraction.** The som ledger takes no
 * tiyin (`whole_soum.TYPED_SOUM_KEYS` lists `advance_payment_amount_uzs`, so a fractional som
 * share is refused by the server outright and the whole order fails). Two independently rounded
 * shares do not reliably sum back to the total, so the last line that has any weight takes
 * whatever is left rather than its own rounded quotient -- the same rule the till's group split
 * uses, and the only way the parts reconstitute the whole to the last digit.
 */

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const qtyOf = (line) => Math.max(parseInt(line?.ordered_quantity, 10) || 0, 0);

const roundCents = (value) => Math.round(value * 100) / 100;
const roundSom = (value) => Math.round(value);

/** Each line's selling total in one currency: the per-unit price times the quantity. */
export function sellingTotals(lines, leg) {
  const field = leg === 'uzs' ? 'selling_uzs_per_unit' : 'selling_usd_per_unit';
  return (lines || []).map((line) => num(line?.[field]) * qtyOf(line));
}

/**
 * The weights for one leg, and which basis they came from.
 *
 * `basis` is returned rather than kept private because the form shows it: a cashier who typed no
 * prices should be told the advance was divided per unit, not left to infer it from the numbers.
 */
export function advanceWeights(lines, leg) {
  const byPrice = sellingTotals(lines, leg);
  const priceTotal = byPrice.reduce((sum, w) => sum + w, 0);
  if (priceTotal > 0) return { weights: byPrice, total: priceTotal, basis: 'selling' };

  const byQty = (lines || []).map(qtyOf);
  const qtyTotal = byQty.reduce((sum, w) => sum + w, 0);
  return { weights: byQty, total: qtyTotal, basis: 'quantity' };
}

/** One leg, split across the lines. Returns an array of numbers, one per line. */
function splitLeg(lines, amount, leg, round) {
  const shares = (lines || []).map(() => 0);
  if (!(amount > 0) || !shares.length) return shares;

  const { weights, total } = advanceWeights(lines, leg);
  // Nothing to divide by -- no prices and no quantities either. Allocating anything would be
  // inventing a basis, so nothing is allocated and the form's own validation reports it.
  if (!(total > 0)) return shares;

  // The last line carrying weight settles the remainder. A line with no weight is skipped
  // entirely rather than given a zero share and then considered for the remainder.
  let lastWeighted = -1;
  weights.forEach((w, i) => {
    if (w > 0) lastWeighted = i;
  });

  let left = amount;
  weights.forEach((w, i) => {
    if (w <= 0) return;
    if (i === lastWeighted) {
      shares[i] = round(left);
      return;
    }
    const share = round(amount * (w / total));
    shares[i] = share;
    left -= share;
  });
  return shares;
}

/**
 * Allocate the order's advance.
 *
 * `lines` are the form's line objects (`ordered_quantity`, `selling_usd_per_unit`,
 * `selling_uzs_per_unit`). `advance` is `{ usd, uzs }` as typed. Returns one entry per line in
 * the same order, plus the basis each leg used.
 */
export function allocateOrderAdvance(lines, advance) {
  const rows = Array.isArray(lines) ? lines : [];
  const usd = splitLeg(rows, num(advance?.usd), 'usd', roundCents);
  const uzs = splitLeg(rows, num(advance?.uzs), 'uzs', roundSom);
  return {
    shares: rows.map((_line, i) => ({ usd: usd[i] || 0, uzs: uzs[i] || 0 })),
    usdBasis: advanceWeights(rows, 'usd').basis,
    uzsBasis: advanceWeights(rows, 'uzs').basis,
  };
}

/**
 * What the order adds up to: the figures the form shows above the lines.
 *
 * Quantity, and the cost in each currency -- the per-unit cost times the quantity, summed. The
 * per-unit boxes are rates and are deliberately *not* summed: adding "$12.50 each" to "$8.00
 * each" is not a number that means anything.
 */
export function orderLineTotals(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  let quantity = 0;
  let costUsd = 0;
  let costUzs = 0;
  let sellingUsd = 0;
  let sellingUzs = 0;
  rows.forEach((line) => {
    const qty = qtyOf(line);
    quantity += qty;
    costUsd += num(line?.cost_usd_per_unit) * qty;
    costUzs += num(line?.cost_uzs_per_unit) * qty;
    sellingUsd += num(line?.selling_usd_per_unit) * qty;
    sellingUzs += num(line?.selling_uzs_per_unit) * qty;
  });
  return {
    quantity,
    costUsd: roundCents(costUsd),
    costUzs,
    sellingUsd: roundCents(sellingUsd),
    sellingUzs,
  };
}

/** One line's own cost, in both currencies. The `Jami tannarx` cell. */
export function lineCostTotals(line) {
  const qty = qtyOf(line);
  return {
    usd: roundCents(num(line?.cost_usd_per_unit) * qty),
    uzs: num(line?.cost_uzs_per_unit) * qty,
  };
}
