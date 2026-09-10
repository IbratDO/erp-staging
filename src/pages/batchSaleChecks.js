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
 * @returns {null} when the basket is fine, otherwise `{ code, params }`:
 *
 *   'no-lines'      nothing with an item on it
 *   'no-price'      a line with an item but no price
 *   'layer-stock'   a chosen FIFO layer has fewer units than the basket asks of it
 *   'product-stock' the product has enough across layers, but not on the ones chosen
 *   'package-missing' / 'package-stock'  the packaging the lines ask for is short
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
    const available = layer ? Number(layer.quantity) || 0 : 0;
    if (available < need) {
      const pid = layer ? Number(layer.product) : null;
      return { code: 'layer-stock', params: { pid, need, available } };
    }
  }

  const needByProduct = new Map();
  for (const line of withProduct) {
    const pid = parseInt(line.product, 10);
    needByProduct.set(pid, (needByProduct.get(pid) || 0) + (parseInt(line.quantity, 10) || 0));
  }
  for (const [pid, need] of needByProduct) {
    const available = (inventory || [])
      .filter((x) => Number(x.product) === pid)
      .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (available < need) {
      return { code: 'product-stock', params: { pid, need, available } };
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
