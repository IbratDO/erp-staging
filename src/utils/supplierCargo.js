/** Unique supplier_cargo values from orders for picklists. */

export function uniqueSupplierCargosFromOrders(orders) {
  const set = new Set();
  for (const o of orders || []) {
    const v = o.supplier_cargo == null ? '' : String(o.supplier_cargo).trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
