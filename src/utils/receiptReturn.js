import { looksLikeLayerCode, normalizeScan } from './layerBarcode';

/**
 * Scanning a customer's receipt at the returns counter.
 *
 * The code is generated and stored by the backend (`erp_app/receipt_barcode.py`); nothing here
 * invents one. This module cleans up what the scanner typed, decides what the scan *means*, and
 * works out what is still returnable on that purchase.
 *
 * **The purchase is what you scan; a line is what you return.** One piece of paper covers a whole
 * checkout, so a scan resolves to every sale row sharing that code, and the operator then picks
 * which item is coming back. That is why this returns a list and not a sale.
 *
 * **Lines already returned are reported, not filtered out.** The customer is standing there
 * holding the receipt. If the paper lists three items and the screen shows two, nobody can tell
 * whether the third was returned last week or the software lost it — so a spent line comes back
 * marked, with its quantity, and the screen can say so.
 *
 * Resolution is entirely local: the Returns page already loads every sale, and each one carries
 * its `receipt_code`. No lookup, so a scan resolves at the speed of a keystroke.
 */

/**
 * A code the backend could have issued: the `RC` prefix, the padded sale id, and — only in the
 * collision case — a suffix of exactly four hex characters.
 *
 * The exact suffix length matters for the same reason it does on layer codes: an open-ended hex
 * run also matches digits, so `RC` followed by three hundred nines would qualify and a runaway
 * keystroke burst would earn an error beep instead of the silence it deserves.
 */
const RECEIPT_CODE_RE = /^RC\d{1,12}(?:[0-9A-F]{4})?$/;

/**
 * Cyrillic lookalikes for `R` and `C`.
 *
 * The scan hook builds its buffer from `event.code`, so a Cyrillic keyboard layout should never
 * reach this — these are the same belt-and-braces `layerBarcode` keeps for `ЛД`. On the Russian
 * layout the physical R key types `К` and the C key types `С`, and the Cyrillic `С` is visually
 * identical to a Latin one, which is exactly the sort of thing nobody diagnoses from a screenshot.
 */
const CYRILLIC_FIXUPS = [[/К/g, 'R'], [/С/g, 'C']];

/** Clean a raw scan into the form a stored receipt code is held in. '' for anything unusable. */
export function normalizeReceiptScan(raw) {
  // `normalizeScan` is prefix-agnostic — whitespace, case, and its own ЛД repair, none of which
  // can touch an RC code. Reused rather than copied so the two scanners cannot drift on what
  // counts as whitespace.
  const cleaned = normalizeScan(raw);
  if (!cleaned) return '';
  return CYRILLIC_FIXUPS.reduce((acc, [re, to]) => acc.replace(re, to), cleaned);
}

/** Does this look like one of our receipts? Gates *feedback*, not resolution. */
export function looksLikeReceiptCode(value) {
  return RECEIPT_CODE_RE.test(normalizeReceiptScan(value));
}

/**
 * Every line of the purchase carrying this code, with what is left on each.
 *
 * `returnedBySaleId` is the page's existing tally of quantity already returned per sale — the
 * same map the dropdown path uses, so the panel and the dropdown can never disagree about how
 * much of a line is still returnable.
 */
export function purchaseLines(sales, code, returnedBySaleId) {
  const wanted = normalizeReceiptScan(code);
  if (!wanted) return [];
  const rows = (sales || []).filter(
    (s) => s && normalizeReceiptScan(s.receipt_code) === wanted,
  );
  return rows
    .slice()
    .sort((a, b) => (a.id || 0) - (b.id || 0))
    .map((sale) => {
      const bought = parseInt(sale.quantity, 10) || 0;
      const returned = Number(returnedBySaleId?.get?.(sale.id) ?? returnedBySaleId?.[sale.id] ?? 0)
        || 0;
      const remaining = Math.max(0, bought - returned);
      return {
        sale,
        bought,
        returned,
        remaining,
        // A line the shop never completed cannot come back, whatever the paper says. In practice
        // a receipt is only printed for a completed sale, so this is a guard rather than a case.
        returnable: remaining > 0 && sale.status === 'completed',
        fullyReturned: bought > 0 && remaining === 0,
      };
    });
}

/**
 * What a scan at the returns counter means.
 *
 * One place for the whole decision, because the difference between the outcomes is the difference
 * between what the operator says to the customer next — put the box back, fetch the manager, or
 * reprint the label. The five kinds:
 *
 *   `purchase`      the receipt resolves and something on it can still come back
 *   `all-returned`  the receipt resolves and every line is spent
 *   `unknown`       it looks like one of our receipts but matches nothing here
 *   `layer`         it is a box sticker, not a receipt — a genuine mistake worth naming
 *   `ignore`        not one of our codes at all; say nothing
 *
 * `ignore` is the important one. The scan hook fires on any fast keystroke burst, so anything
 * that is not recognisably ours has to pass in silence — beeping at somebody typing quickly is
 * how an operator learns to ignore the beep.
 */
export function resolveReceiptScan(sales, raw, returnedBySaleId) {
  const code = normalizeReceiptScan(raw);
  if (!code) return { kind: 'ignore', code: '', lines: [] };

  // Checked before the receipt shape: two kinds of barcode now exist in this shop and somebody
  // will eventually scan a shoebox at the returns counter. "That is a product label" is a far
  // more useful thing to be told than "not found".
  if (looksLikeLayerCode(code)) return { kind: 'layer', code, lines: [] };
  if (!looksLikeReceiptCode(code)) return { kind: 'ignore', code, lines: [] };

  const lines = purchaseLines(sales, code, returnedBySaleId);
  if (!lines.length) return { kind: 'unknown', code, lines: [] };
  if (!lines.some((line) => line.returnable)) {
    return { kind: 'all-returned', code, lines };
  }
  return { kind: 'purchase', code, lines };
}
