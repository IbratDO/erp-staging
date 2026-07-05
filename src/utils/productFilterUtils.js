/** Case-insensitive partial text match for searchable / free-text filters. */
export function matchesPartialText(fieldValue, filterValue) {
  const q = String(filterValue ?? '').trim();
  if (!q) return true;
  return String(fieldValue ?? '').toLowerCase().includes(q.toLowerCase());
}

/** OR match for multi-select filters (e.g. several sizes at once). */
export function matchesAnySelected(fieldValue, selectedValues) {
  const list = selectedValues ?? [];
  if (!list.length) return true;
  return new Set(list.map(String)).has(String(fieldValue ?? ''));
}

/** Normalize size filter state (supports legacy `size` string). */
export function selectedSizesFromFilters(filters) {
  if (Array.isArray(filters?.sizes)) return filters.sizes;
  if (filters?.size) return [filters.size];
  return [];
}

/**
 * Match a product row or `product_detail` object against catalog filters.
 * Model, brand, color, category use partial text; size uses multi-select OR.
 */
export function matchesProductCatalogFilters(detail, filters) {
  if (!detail) return false;
  if (filters.category_type && detail.category_type !== filters.category_type) return false;
  if (filters.category && !matchesPartialText(detail.category, filters.category)) return false;
  if (filters.brand && !matchesPartialText(detail.brand, filters.brand)) return false;
  if (filters.model && !matchesPartialText(detail.model, filters.model)) return false;
  const sizes = selectedSizesFromFilters(filters);
  if (sizes.length && !matchesAnySelected(detail.size, sizes)) return false;
  if (filters.color && !matchesPartialText(detail.color, filters.color)) return false;
  return true;
}
