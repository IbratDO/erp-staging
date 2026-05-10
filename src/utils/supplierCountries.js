/**
 * Build sorted unique supplier_country values from product rows (trimmed, non-empty).
 * Used so picklists reflect all loaded products consistently.
 */
export function uniqueSupplierCountriesFromProducts(products) {
  if (!products?.length) return [];
  const set = new Set();
  for (const p of products) {
    const v = p.supplier_country == null ? '' : String(p.supplier_country).trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Countries observed on variants with the same brand + model as the selected product. */
export function uniqueSupplierCountriesForProductLine(products, selectedProduct) {
  if (!selectedProduct) return uniqueSupplierCountriesFromProducts(products);
  const line = products.filter(
    (p) => p.brand === selectedProduct.brand && p.model === selectedProduct.model,
  );
  return uniqueSupplierCountriesFromProducts(line);
}

/**
 * All unique supplier countries across both orders and products combined.
 * This ensures any country typed during order creation is available in future dropdowns.
 */
export function uniqueSupplierCountriesFromOrdersAndProducts(orders, products) {
  const set = new Set();
  for (const o of orders || []) {
    const v = o.supplier_country == null ? '' : String(o.supplier_country).trim();
    if (v) set.add(v);
  }
  for (const p of products || []) {
    const v = p.supplier_country == null ? '' : String(p.supplier_country).trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
