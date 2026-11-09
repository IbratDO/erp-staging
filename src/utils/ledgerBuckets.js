/**
 * The ledger's money buckets, and which currency each one rolls up into.
 *
 * Mirrors `CashBalance.BALANCE_TYPE_CHOICES` on the backend. It lives in its own module for one
 * reason: **Pul balansi used to name the buckets twice per currency column** — once in a
 * `matchBalanceType` predicate and again inside the `sumBalances` reducer — so a bucket added to
 * the ledger had to be remembered in four places on this page alone.
 *
 * A bucket missed by the predicate merely renders a dash. A bucket missed by the reducer makes the
 * **Jami figure wrong**, which is the worse failure by a long way: a total that silently omits an
 * account looks exactly like a correct total. The backend has the same split for the same reason —
 * `payment_routing.all_bucket_types_for_currency` for totals, `ledger_bucket_types_for_currency`
 * for what may be spent. Keep the two sides in step.
 */

/**
 * Every bucket, in the backend's own order.
 *
 * `labelKey` resolves against the `moneyBalance` locale namespace. The card buckets keep their
 * `Legacy` key names even though the label no longer says "legacy" — under Option A new money
 * only ever lands in a `*_cash` bucket, except money a payment gateway holds, which is why the
 * card buckets are still live. Renaming the keys would mean re-translating three files for
 * nothing.
 */
export const LEDGER_BUCKETS = [
  { value: 'usd_cash', labelKey: 'usdCash' },
  { value: 'uzs_cash', labelKey: 'uzsCash' },
  { value: 'usd_card', labelKey: 'usdCardLegacy' },
  { value: 'uzs_card', labelKey: 'uzsCardLegacy' },
  // Perechisleniye — a sale settled by bank transfer. Soum only: an organisation paying by
  // transfer pays in soum.
  { value: 'uzs_transfer', labelKey: 'uzsTransfer' },
];

/** Bucket names grouped by the currency column they belong to. Derived, never listed. */
export const BUCKETS_BY_CURRENCY = {
  usd: LEDGER_BUCKETS.map((b) => b.value).filter((v) => v.startsWith('usd')),
  uzs: LEDGER_BUCKETS.map((b) => b.value).filter((v) => v.startsWith('uzs')),
};

/** Is this bucket held in soum? Used for formatting as well as grouping. */
export function isUzsBucket(balanceType) {
  return String(balanceType || '').startsWith('uzs');
}

/**
 * The currency columns of the Money Balance table, each able to recognise and total its own
 * buckets.
 *
 * Both functions come off the same `members` list, so they cannot disagree about which buckets
 * belong to a column — which is the entire point of this module.
 */
export const CURRENCY_COLS = [
  { key: 'usd', label: 'USD', isUzs: false },
  { key: 'uzs', label: 'UZS', isUzs: true },
].map((col) => {
  const members = BUCKETS_BY_CURRENCY[col.key];
  return {
    ...col,
    members,
    matchBalanceType: (bt) => members.includes(bt),
    sumBalances: (rows) =>
      (rows || [])
        .filter((b) => members.includes(b.balance_type))
        .reduce((s, b) => s + (parseFloat(b.balance) || 0), 0),
  };
});

export default LEDGER_BUCKETS;
