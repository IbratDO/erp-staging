/**
 * In-memory product catalog cache for the SPA session.
 * Avoids re-downloading /products/ on every Orders/Sales/Inventory/Returns visit.
 * Invalidate after Products create/update/delete.
 */

let productsCache = null;
let productsInflight = null;

export function getCachedProducts(api) {
  if (productsCache) {
    return Promise.resolve(productsCache);
  }
  if (productsInflight) {
    return productsInflight;
  }
  productsInflight = api
    .get('/products/')
    .then((response) => {
      productsCache = response.data.results || response.data || [];
      return productsCache;
    })
    .finally(() => {
      productsInflight = null;
    });
  return productsInflight;
}

export function invalidateProductsCache() {
  productsCache = null;
  productsInflight = null;
}

/** Replace cache after a fresh fetch (e.g. Products page). */
export function setProductsCache(list) {
  productsCache = Array.isArray(list) ? list : [];
  productsInflight = null;
}
