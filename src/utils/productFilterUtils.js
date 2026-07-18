/** Case-insensitive partial text match for searchable / free-text filters. */
export function matchesPartialText(fieldValue, filterValue) {
  const q = String(filterValue ?? '').trim();
  if (!q) return true;
  return String(fieldValue ?? '').toLowerCase().includes(q.toLowerCase());
}

/**
 * Build cascading dropdown options for product-catalog filters.
 *
 * For each field (category, brand, model, size, color) the options are
 * derived from the subset of `items` that match *all other* active filters
 * — so selecting Brand = "Nike" narrows the Size dropdown to only sizes
 * that exist for Nike products.
 *
 * @param {Array}    items          Full (unfiltered) dataset.
 * @param {Object}   filters        Current filter state (category_type, category, brand, model, sizes/size, color).
 * @param {Function} [detailAccessor]  Extracts the product-detail object from a row.
 *                                     Defaults to `(item) => item.product_detail ?? item`.
 * @param {Function} [sortSize]     Optional custom sort for sizes (e.g. sortSizesCanonical).
 * @param {Function} [extraFilter]  Optional predicate `(item, excludeField) => bool` for non-product
 *                                  filters (year, month, status, customer…).  Called with the
 *                                  field currently being extracted so the page can skip that
 *                                  dimension when building its options.
 * @returns {{ categories: string[], brands: string[], models: string[], sizes: string[], colors: string[] }}
 */
export function getCascadedFilterOptions(items, filters, detailAccessor, sortSize, extraFilter) {
  const detail = detailAccessor || ((item) => item.product_detail ?? item);

  const FIELDS = ['category', 'brand', 'model', 'size', 'color'];

  const matchesExcluding = (item, excludeField) => {
    if (extraFilter && !extraFilter(item, excludeField)) return false;
    const d = detail(item);
    if (!d) return false;
    if (filters.category_type && d.category_type !== filters.category_type) return false;
    for (const f of FIELDS) {
      if (f === excludeField) continue;
      if (f === 'size') {
        const sizes = selectedSizesFromFilters(filters);
        if (sizes.length && !matchesAnySelected(d.size, sizes)) return false;
      } else {
        const vals = selectedValuesFromFilter(filters[f]);
        if (vals.length && !matchesAnySelected(d[f], vals)) return false;
      }
    }
    return true;
  };

  const uniqueSorted = (list) => [...new Set(list.filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }),
  );

  const extract = (field) => {
    const matching = items.filter((item) => matchesExcluding(item, field));
    const values = matching.map((item) => detail(item)?.[field]).filter(Boolean);
    if (field === 'size' && sortSize) return sortSize([...new Set(values)]);
    return uniqueSorted(values);
  };

  return {
    categories: extract('category'),
    brands: extract('brand'),
    models: extract('model'),
    sizes: extract('size'),
    colors: extract('color'),
  };
}

/**
 * Build cascaded year and month dropdown options from a dated dataset.
 *
 * Years/months are extracted only from items matching all active product-catalog
 * filters (and any extra non-date filters the page applies), so selecting
 * Brand = "Nike" narrows years to only those with Nike sales.
 *
 * @param {Array}    items           Full dataset.
 * @param {Object}   filters         Current filter state.
 * @param {Function} dateAccessor    `(item) => dateString`  e.g. `(s) => s.sale_date`.
 * @param {Function} [detailAccessor]
 * @param {Function} [extraRowFilter] Additional per-row filter (status, customer…).
 *                                    Receives `(item)` — return false to exclude.
 * @returns {{ years: string[], months: string[] }}
 */
export function getCascadedDateOptions(items, filters, dateAccessor, detailAccessor, extraRowFilter) {
  const detail = detailAccessor || ((item) => item.product_detail ?? item);

  const matchesProductFilters = (item) => {
    const d = detail(item);
    if (!d) return false;
    return matchesProductCatalogFilters(d, filters);
  };

  const baseForYear = items.filter((item) => {
    if (!matchesProductFilters(item)) return false;
    if (extraRowFilter && !extraRowFilter(item)) return false;
    if (filters.month) {
      const m = new Date(dateAccessor(item)).getMonth() + 1;
      if (m.toString() !== filters.month) return false;
    }
    return true;
  });

  const baseForMonth = items.filter((item) => {
    if (!matchesProductFilters(item)) return false;
    if (extraRowFilter && !extraRowFilter(item)) return false;
    if (filters.year) {
      const y = new Date(dateAccessor(item)).getFullYear();
      if (y.toString() !== filters.year) return false;
    }
    return true;
  });

  const years = [...new Set(
    baseForYear.map((item) => new Date(dateAccessor(item)).getFullYear().toString()),
  )].sort((a, b) => b.localeCompare(a));

  const months = [...new Set(
    baseForMonth.map((item) => (new Date(dateAccessor(item)).getMonth() + 1).toString()),
  )].sort((a, b) => Number(a) - Number(b));

  return { years, months };
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
 * Normalize a multi-select filter field.
 * Accepts an array (new) or a plain string (legacy / backward-compat).
 */
export function selectedValuesFromFilter(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'string') return [val];
  return [];
}

/**
 * Match a product row or `product_detail` object against catalog filters.
 * Category, brand, color use multi-select OR logic.
 * Model uses partial-text free search.
 * Size uses multi-select OR logic via selectedSizesFromFilters.
 */
export function matchesProductCatalogFilters(detail, filters) {
  if (!detail) return false;
  if (filters.category_type && detail.category_type !== filters.category_type) return false;
  const cats = selectedValuesFromFilter(filters.category);
  if (cats.length && !matchesAnySelected(detail.category, cats)) return false;
  const brands = selectedValuesFromFilter(filters.brand);
  if (brands.length && !matchesAnySelected(detail.brand, brands)) return false;
  const models = selectedValuesFromFilter(filters.model);
  if (models.length && !matchesAnySelected(detail.model, models)) return false;
  const sizes = selectedSizesFromFilters(filters);
  if (sizes.length && !matchesAnySelected(detail.size, sizes)) return false;
  const colors = selectedValuesFromFilter(filters.color);
  if (colors.length && !matchesAnySelected(detail.color, colors)) return false;
  return true;
}
