/**
 * The checks a basket must pass before it becomes sales, shared by the Sotuvlar modal and the
 * Kassa till.
 *
 * Extracted rather than copied, because these are the questions that stop the server rejecting a
 * whole basket after somebody has scanned twenty boxes — and because two screens creating the same
 * sales through two slightly different sets of checks is how one of them ends up letting through
 * what the other refuses. That has already happened twice in this system: the two dashboards, and
 * the item payload builder next door.
 *
 * Pure. No React, no `t()`, no `api` — it returns *which* complaint to make and the numbers to make
 * it with, and the caller words it. That keeps the part worth testing testable without a browser
 * and leaves each screen free to show a toast, a dialog, or a strip of red as it likes.
 *
 * The one check deliberately **not** here is the above-shelf-price warning: it is a question, not a
 * refusal, and the two screens ask it differently. `linesPricedAboveCatalogue` stays where it is.
 */

/**
 * How many units of a layer may actually be sold right now.
 *
 * Not the same as what is on the shelf. A sale that has been rung up but not finished takes
 * nothing out of stock — the goods are still physically there — yet they are promised to that
 * sale, and selling them again is how one pair leaves the shop twice. The server counts those
 * holds and serves `available_quantity` beside `quantity`; this is the one place that decides
 * which of the two a sale screen means.
 *
 * Falls back to `quantity` when the field is absent, so an older cached response, or a test
 * fixture written before holds existed, behaves exactly as it did.
 */
export function layerAvailableQty(layer) {
  if (!layer) return 0;
  const available = Number(layer.available_quantity);
  if (Number.isFinite(available)) return available;
  return Number(layer.quantity) || 0;
}

/** The unfinished sales holding this layer, for naming in the refusal. */
export function layerHeldSales(layer) {
  const sales = layer?.held_by_sales;
  return Array.isArray(sales) ? sales : [];
}

/**
 * @returns {null} when the basket is fine, otherwise `{ code, params }`:
 *
 *   'no-lines'      nothing with an item on it
 *   'no-price'      a line with an item but no price
 *   'layer-stock'   a chosen FIFO layer has fewer units than the basket asks of it
 *   'layer-held'    the units exist but an unfinished sale has already spoken for them
 *   'product-stock' the product has enough across layers, but not on the ones chosen
 *   'product-held'  the product has enough on the shelf, but not once holds are taken off
 *   'package-missing' / 'package-stock'  the packaging the lines ask for is short
 *
 * The two `-held` codes are kept apart from the two `-stock` ones on purpose: "not enough stock"
 * sends somebody to count the shelf, where the goods are sitting exactly as the screen said.
 * "Held by sale #412" sends them to the one thing they can actually resolve.
 */
export function checkBatchLines(lines, { inventory = [], packages = [] } = {}) {
  const withProduct = (lines || []).filter((l) => l?.layer && l?.product);
  if (!withProduct.length) return { code: 'no-lines', params: {} };

  for (const line of withProduct) {
    if (line.selling_price === '' || line.selling_price == null) {
      return { code: 'no-price', params: {} };
    }
  }

  // Per layer first. A basket can ask for more of one FIFO batch than it holds while the product
  // as a whole has plenty, and the server checks the batch — so checking only the product would
  // pass here and fail there, after the walk.
  const needByLayer = new Map();
  for (const line of withProduct) {
    const id = parseInt(line.inventory_batch_id ?? line.layer, 10);
    needByLayer.set(id, (needByLayer.get(id) || 0) + (parseInt(line.quantity, 10) || 0));
  }
  for (const [batchId, need] of needByLayer) {
    const layer = (inventory || []).find((x) => Number(x.batch_id) === batchId);
    const onShelf = layer ? Number(layer.quantity) || 0 : 0;
    if (onShelf < need) {
      const pid = layer ? Number(layer.product) : null;
      return { code: 'layer-stock', params: { pid, need, available: onShelf } };
    }
    // Enough on the shelf, but some of it is spoken for. Asked second so a genuinely empty layer
    // still reports as empty rather than as held.
    const available = layerAvailableQty(layer);
    if (available < need) {
      const sales = layerHeldSales(layer);
      return {
        code: 'layer-held',
        params: {
          pid: layer ? Number(layer.product) : null,
          need,
          available,
          held: onShelf - available,
          sales: sales.map((id) => `#${id}`).join(', '),
        },
      };
    }
  }

  const needByProduct = new Map();
  for (const line of withProduct) {
    const pid = parseInt(line.product, 10);
    needByProduct.set(pid, (needByProduct.get(pid) || 0) + (parseInt(line.quantity, 10) || 0));
  }
  for (const [pid, need] of needByProduct) {
    const rows = (inventory || []).filter((x) => Number(x.product) === pid);
    const onShelf = rows.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (onShelf < need) {
      return { code: 'product-stock', params: { pid, need, available: onShelf } };
    }
    const available = rows.reduce((sum, it) => sum + layerAvailableQty(it), 0);
    if (available < need) {
      const sales = [...new Set(rows.flatMap((it) => layerHeldSales(it)))].sort((a, b) => a - b);
      return {
        code: 'product-held',
        params: {
          pid,
          need,
          available,
          held: onShelf - available,
          sales: sales.map((id) => `#${id}`).join(', '),
        },
      };
    }
  }

  const needPkg = new Map();
  for (const line of withProduct) {
    for (const pl of (line.packageLines || [])) {
      if (!pl?.package_type || !(pl.quantity > 0)) continue;
      needPkg.set(pl.package_type, (needPkg.get(pl.package_type) || 0) + pl.quantity);
    }
  }
  for (const [type, need] of needPkg) {
    const pkg = (packages || []).find((p) => p.package_type === type);
    if (!pkg) return { code: 'package-missing', params: { type } };
    if (pkg.quantity < need) {
      return { code: 'package-stock', params: { type, need, have: pkg.quantity } };
    }
  }

  return null;
}

/** The packaging a basket asks for, as `[package_type, quantity]` — for the payload and the check. */
export function packageNeeds(lines) {
  const need = new Map();
  for (const line of (lines || [])) {
    for (const pl of (line?.packageLines || [])) {
      if (!pl?.package_type || !(pl.quantity > 0)) continue;
      need.set(pl.package_type, (need.get(pl.package_type) || 0) + pl.quantity);
    }
  }
  return [...need.entries()];
}
