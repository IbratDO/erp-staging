/** Case-insensitive: every whitespace-separated term appears in id/category/brand/model/size/color. */
export function productMatchesSearch(product, rawQuery) {
  const raw = String(rawQuery || '').trim().toLowerCase();
  if (!raw) return true;
  const terms = raw.split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const blob = [
    product.id,
    product.category,
    product.brand,
    product.model,
    product.size,
    product.color,
  ]
    .filter((x) => x != null && x !== '')
    .map((x) => String(x).toLowerCase())
    .join(' ');
  return terms.every((t) => blob.includes(t));
}
