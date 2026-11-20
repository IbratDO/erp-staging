/**
 * Which account a payment came out of — the front end's half of Phase 2.
 *
 * Mirrors `erp_app/money_accounts.py`, and is built on `ledgerBuckets.js` rather than listing the
 * buckets again. That is the rule `ledgerBuckets` itself was created to enforce: a bucket added to
 * the ledger must not have to be remembered in a second place. A bucket missing from this picker
 * is an account the owner cannot spend out of, with nothing on screen to say why.
 *
 * **Blank is not a missing value, it is a choice** — "the route the shop has always used": the
 * currency's cash bucket for income, and cash-then-card for an expense. It stays the default so
 * that opening a form and not touching the picker records exactly what it recorded before this
 * feature existed. The server agrees: `money_accounts.DEFAULT_ACCOUNT` is `''`.
 *
 * **The list is deliberately every bucket of the currency, the bank included**, which is what
 * distinguishes it from the drain order on the server (`ledger_bucket_types_for_currency`, where
 * the bank must never appear). One is a picker a person points at; the other is a list of pockets
 * to empty when nobody said which. Merging them is the accident Phase 1 wrote a warning about.
 */
import { LEDGER_BUCKETS } from './ledgerBuckets';

/** What "no account chosen" is, on both sides of the wire. */
export const DEFAULT_ACCOUNT = '';

/**
 * `'USD'` or `'UZS'` for a bucket, by prefix — the same test the backend's `account_currency`
 * uses. An unknown bucket answers `''` rather than guessing, so a comparison refuses instead of
 * matching by accident.
 */
export function accountCurrency(account) {
  const a = String(account || '');
  if (a.startsWith('usd')) return 'USD';
  if (a.startsWith('uzs')) return 'UZS';
  return '';
}

/**
 * The accounts a payment in `currency` may name, as `{ value, labelKey }` rows in the backend's
 * own order. `labelKey` resolves against the `moneyBalance` namespace, reusing the labels Pul
 * balansi already shows — so an account is called the same thing on the page that spends from it
 * and the page that reports it.
 */
export function accountsForCurrency(currency) {
  const want = String(currency || '').toUpperCase();
  return LEDGER_BUCKETS.filter((b) => accountCurrency(b.value) === want);
}

/**
 * Is this a legal choice for a payment in this currency?
 *
 * Blank is always legal. The currency test is the one that matters: paying a dollar expense out of
 * the som bank account is refused by the server and never converted, because a conversion would
 * freeze a rate onto the payment with no record of which rate was used.
 */
export function accountIsValidFor(account, currency) {
  const a = String(account || '');
  if (!a) return true;
  if (!LEDGER_BUCKETS.some((b) => b.value === a)) return false;
  return accountCurrency(a) === String(currency || '').toUpperCase();
}

/**
 * The account to keep after the currency changes.
 *
 * Returns blank when the chosen account does not belong to the new currency. **This is the bug
 * this function exists to stop**, and it is a quiet one: pick Perechisleniye for a som expense,
 * then switch the form to USD, and the form would post a som bank account against a dollar
 * payment. The server refuses it — `refuse_account` answers `wrong_currency` — so no money moves
 * wrongly, but the user gets an error for a field they cannot see is still set.
 */
export function accountAfterCurrencyChange(account, nextCurrency) {
  return accountIsValidFor(account, nextCurrency) ? String(account || '') : DEFAULT_ACCOUNT;
}

export default accountsForCurrency;
