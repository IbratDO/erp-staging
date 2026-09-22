/** Build grouped display rows for the Sales table (multi-item checkout = one row). */

/** Line-item discount (list vs final price) plus completion remainder recorded as discount. */
export function saleDiscountTotalAmount(sale) {
  if (!sale) return 0;
  let total = parseFloat(sale.total_discount_amount) || 0;
  if (sale.balance_shortfall_type === 'discount' && sale.balance_shortfall_amount) {
    total += parseFloat(sale.balance_shortfall_amount) || 0;
  }
  return total;
}

/** Sum discount column amounts for a list of sales (footer totals). */
export function sumSalesDiscountTotals(sales) {
  if (!sales?.length) {
    return { total: 0, currency: null };
  }
  let total = 0;
  const currencies = new Set();
  for (const s of sales) {
    total += saleDiscountTotalAmount(s);
    currencies.add(s.sale_currency || 'USD');
    if (s.balance_shortfall_type === 'discount' && s.balance_shortfall_amount) {
      currencies.add(s.balance_shortfall_currency || s.sale_currency || 'USD');
    }
  }
  return { total, currency: currencies.size === 1 ? [...currencies][0] : null };
}

export function buildSaleDisplayRows(filteredSales, allSales) {
  const seenGroupIds = new Set();
  const rows = [];

  for (const sale of filteredSales) {
    const gid = sale.sale_group_id;
    if (!gid) {
      rows.push({ type: 'single', key: `sale-${sale.id}`, sale });
      continue;
    }
    if (seenGroupIds.has(gid)) continue;
    seenGroupIds.add(gid);
    const groupSales = allSales
      .filter((s) => Number(s.sale_group_id) === Number(gid))
      .sort((a, b) => Number(a.id) - Number(b.id));
    rows.push({ type: 'group', key: `group-${gid}`, groupId: gid, sales: groupSales });
  }

  return rows;
}

export function aggregateGroupSales(groupSales) {
  if (!groupSales?.length) {
    return {
      first: null,
      idsLabel: '',
      quantity: 0,
      totalAmount: 0,
      totalDiscount: 0,
      completionDiscount: 0,
      totalDiscountAll: 0,
      uzsPay: 0,
      usdPay: 0,
      statuses: [],
      activeStatuses: [],
      declinedCount: 0,
      saleCurrency: 'USD',
    };
  }
  const first = groupSales[0];
  const ids = groupSales.map((s) => s.id);
  // Cancelled lines (including declined-at-the-door items) never counted as revenue/quantity —
  // matches P&L/Balance Sheet, which exclude 'cancelled' sales entirely.
  const activeSales = groupSales.filter((s) => s.status !== 'cancelled');
  const quantity = activeSales.reduce((sum, s) => sum + (parseInt(s.quantity, 10) || 0), 0);
  const totalAmount = activeSales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
  const totalDiscount = activeSales.reduce(
    (sum, s) => sum + (parseFloat(s.total_discount_amount) || 0),
    0
  );
  const completionDiscount = activeSales.reduce(
    (sum, s) =>
      s.balance_shortfall_type === 'discount' && s.balance_shortfall_amount
        ? sum + (parseFloat(s.balance_shortfall_amount) || 0)
        : sum,
    0
  );
  const totalDiscountAll = totalDiscount + completionDiscount;
  /** UZS/USD: sum of each line's stored payment (split across items at Complete & Pay). */
  const uzsPay = activeSales.reduce(
    (sum, s) => sum + (parseFloat(s.payment_uzs_cash) || 0) + (parseFloat(s.payment_uzs_card) || 0),
    0
  );
  const usdPay = activeSales.reduce(
    (sum, s) => sum + (parseFloat(s.payment_usd_cash) || 0) + (parseFloat(s.payment_usd_card) || 0),
    0
  );
  const statuses = [...new Set(groupSales.map((s) => s.status))];
  const activeStatuses = [...new Set(activeSales.map((s) => s.status))];
  const declinedCount = groupSales.filter((s) => !!s.delivery_customer_declined_at).length;
  const currencies = [...new Set(groupSales.map((s) => s.sale_currency || 'USD'))];
  return {
    first,
    ids,
    idsLabel:
      ids.length > 1
        ? `#${ids[0]}–${ids[ids.length - 1]}`
        : `#${ids[0]}`,
    quantity,
    totalAmount,
    totalDiscount,
    completionDiscount,
    totalDiscountAll,
    uzsPay,
    usdPay,
    statuses,
    activeStatuses,
    declinedCount,
    saleCurrency: currencies.length === 1 ? currencies[0] : null,
    // Mixed only among still-active lines — a group with one cancelled/declined line and the
    // rest sharing one status should still show that shared status, not a generic "pending".
    hasMixedStatus: activeStatuses.length > 1,
  };
}

/**
 * The one status a multi-item group shows.
 *
 * Cancelled lines do not speak for the group. Selling two items by delivery and having the
 * customer refuse one leaves that line `cancelled` while the other completes — the group is
 * not cancelled, it is completed with one item returned, and the declined count says the
 * rest. Reading the raw `statuses[0]` labelled such a group **Bekor qilindi** purely because
 * the refused line happened to sort first.
 *
 * Only when *every* line is cancelled is the group itself cancelled. Genuine disagreement
 * between still-open lines is 'mixed'.
 *
 * Single source of truth on purpose: the table badge and the sort accessor both call this,
 * and they previously implemented the rule differently — the row sorted as completed and
 * displayed as cancelled.
 */
export function groupDisplayStatus(agg) {
  if (agg?.activeStatuses?.length) {
    return agg.hasMixedStatus ? 'mixed' : agg.activeStatuses[0];
  }
  return agg?.statuses?.[0] || 'cancelled';
}

/** Synthetic sale object for combined Complete & Pay on a group. */
export function buildCombinedSaleForGroup(groupSales) {
  if (!groupSales?.length) return null;
  const agg = aggregateGroupSales(groupSales);
  const { first, quantity, totalAmount, totalDiscount, completionDiscount } = agg;
  const unit = quantity > 0 ? totalAmount / quantity : 0;
  return {
    ...first,
    id: first.id,
    isSaleGroup: true,
    groupSales,
    quantity,
    selling_price: unit,
    discount_price: null,
    total_amount: totalAmount,
    total_discount_amount: totalDiscount,
    balance_shortfall_type: completionDiscount > 0 ? 'discount' : first.balance_shortfall_type,
    balance_shortfall_amount: completionDiscount > 0 ? completionDiscount : null,
    balance_shortfall_currency: first.balance_shortfall_currency || first.sale_currency,
  };
}

/** Row shape used by table sort accessors. */
export function saleLikeForDisplayRow(row) {
  if (row.type === 'single') return row.sale;
  const agg = aggregateGroupSales(row.sales);
  const displayStatus = groupDisplayStatus(agg);
  return {
    ...agg.first,
    id: agg.first?.id ?? 0,
    status: displayStatus,
    declinedCount: agg.declinedCount,
    quantity: agg.quantity,
    total_amount: agg.totalAmount,
    total_discount_amount: agg.totalDiscountAll,
    payment_uzs_cash: agg.uzsPay,
    payment_uzs_card: 0,
    payment_usd_cash: agg.usdPay,
    payment_usd_card: 0,
    sale_currency: agg.saleCurrency || agg.first?.sale_currency || 'USD',
    product_detail: {
      category: '',
      brand: 'multiple items',
      model: '',
      size: '',
      color: '',
    },
  };
}

/**
 * Where an unfinished sale sits in the workflow, least advanced first.
 *
 * Only statuses a sale can still be worked on belong here; terminal ones never reach this,
 * because `compareSaleDisplayRows` separates finished from open before consulting it. An
 * unrecognised status ranks after all of these rather than throwing, so adding a status to the
 * model degrades to "listed last among the open rows" instead of scrambling the table.
 */
export const SALE_OPEN_STAGE_ORDER = ['pending', 'reserved', 'confirmed', 'dispatched'];

const ROW_TERMINAL_STATUSES = new Set(['completed', 'returned', 'cancelled']);

/** The sale records behind one table row — a group's lines, or the single sale. */
export function displayRowLines(row) {
  if (!row) return [];
  if (row.type === 'group') return row.sales || [];
  return row.sale ? [row.sale] : [];
}

/**
 * Has everything in this row been dealt with?
 *
 * Asked of the underlying lines, never of the row's display status — which is the whole point.
 * A group whose lines disagree carries the synthetic status `mixed`, and one completed line
 * beside one returned line is enough to trigger it. `mixed` is not terminal, so judging by the
 * label pinned such rows above genuinely open sales **permanently**, however long ago every
 * item in them was finished.
 *
 * `groupDisplayStatus` is deliberately left alone: the badge and this rule shared it on purpose
 * after they once drifted apart, and a row that sorts as finished while displaying "Aralash" is
 * the correct pairing — the label describes the lines, this describes whether work remains.
 *
 * Cancelled lines do not speak for the row, matching `aggregateGroupSales`. A row that is
 * entirely cancelled is finished.
 */
export function displayRowIsFinished(row) {
  const lines = displayRowLines(row);
  if (!lines.length) return true;
  const active = lines.filter((s) => s?.status !== 'cancelled');
  const judged = active.length ? active : lines;
  return judged.every((s) => ROW_TERMINAL_STATUSES.has(s?.status));
}

/**
 * How far from done the row is — the least advanced of its unfinished lines.
 *
 * A group is only as finished as its most-behind item: one line still `pending` while another
 * is already `dispatched` means the outstanding work is the pending one, so that is where the
 * row belongs in the queue.
 */
export function displayRowStageRank(row) {
  let rank = Number.MAX_SAFE_INTEGER;
  for (const sale of displayRowLines(row)) {
    if (!sale || ROW_TERMINAL_STATUSES.has(sale.status)) continue;
    const i = SALE_OPEN_STAGE_ORDER.indexOf(sale.status);
    rank = Math.min(rank, i === -1 ? SALE_OPEN_STAGE_ORDER.length : i);
  }
  return rank;
}

/** When the row started: the earliest moment among its lines. */
export function displayRowTime(row) {
  let earliest = 0;
  for (const sale of displayRowLines(row)) {
    const t = new Date(sale?.display_date || sale?.sale_date).getTime() || 0;
    if (t > 0 && (earliest === 0 || t < earliest)) earliest = t;
  }
  return earliest;
}

/**
 * Default order of the Sotuvlar table: what still needs doing, then what is done.
 *
 * Open sales come first, ordered by how far from finished they are, and within a stage the one
 * that has been waiting longest sits at the top — so the row most overdue for attention is the
 * first thing on screen. Finished rows follow, most recent first, because there the question is
 * "what happened lately" rather than "what needs doing".
 */
export function compareSaleDisplayRows(a, b) {
  const aDone = displayRowIsFinished(a) ? 1 : 0;
  const bDone = displayRowIsFinished(b) ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;

  const ta = displayRowTime(a);
  const tb = displayRowTime(b);

  if (!aDone) {
    const ra = displayRowStageRank(a);
    const rb = displayRowStageRank(b);
    if (ra !== rb) return ra - rb;
    return ta - tb;
  }
  return tb - ta;
}
