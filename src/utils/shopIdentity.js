/**
 * What to call the shop.
 *
 * The name used to be a translation string compiled into the bundle. It comes from the database now,
 * which means it can be missing — the request can fail, the row starts empty on a fresh deployment,
 * and the login screen asks for it before anyone has signed in. Every one of those is ordinary, and
 * none of them may end with a receipt in a customer's hand that has no shop name on it.
 *
 * So the name is resolved through a chain, most authoritative first:
 *
 *   1. the settings we just fetched;
 *   2. the last settings we successfully fetched, kept in localStorage;
 *   3. the bundled translation, which is exactly what printed before this table existed.
 *
 * Rung 3 is why the `receipt.shopName` locale key was kept rather than deleted. It makes the failure
 * mode "prints the name it has always printed" instead of "prints nothing", and both deployments
 * already hold the right string for themselves.
 */

/** localStorage key for the cached settings row. Also read by SettingsContext. */
export const SHOP_SETTINGS_STORAGE_KEY = 'shop_settings';

/**
 * The browser's localStorage, where there is one.
 *
 * Reached through a function rather than `globalThis.localStorage` because this file is also
 * imported by the print path, and the eslint config here does not know `globalThis`.
 */
function defaultStorage() {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

/** A usable name, or '' — never whitespace, never null. */
function usableName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * Resolve the shop's name.
 *
 * @param {object|null} settings   the live settings row, if we have one
 * @param {object|null} cached     the last known row (from localStorage)
 * @param {string} fallback        the bundled translation, already resolved by the caller
 */
export function resolveShopName(settings, cached, fallback = '') {
  return (
    usableName(settings?.shop_name)
    || usableName(cached?.shop_name)
    || usableName(fallback)
  );
}

/**
 * The cached settings row, or null.
 *
 * Wrapped because storage is not guaranteed: a private window, blocked site data or a corrupted
 * entry all throw or return nonsense here, and none of them is a reason to fail to print a receipt.
 */
export function readCachedShopSettings(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(SHOP_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Remember the row so the next cold start has a name before the network answers. */
export function writeCachedShopSettings(settings, storage = defaultStorage()) {
  try {
    if (!settings || typeof settings !== 'object') return;
    storage?.setItem(SHOP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do and nothing to report: the cache is a convenience, not a requirement.
  }
}
