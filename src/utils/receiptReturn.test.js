/**
 * Scanning a receipt at the returns counter.
 *
 * The decisions worth pinning here are the ones an operator experiences as the software being
 * either helpful or broken, with a customer waiting:
 *
 *   * a scan resolves to the whole purchase, because the customer holds one piece of paper for
 *     what may have been three pairs;
 *   * lines already returned come back **marked, not missing** — the receipt in the customer's
 *     hand lists them, and a screen that silently drops them cannot be reconciled with it;
 *   * a box sticker scanned by mistake says so, rather than "not found";
 *   * and anything that is not one of our codes passes in silence, because the scan hook fires on
 *     any fast keystroke burst and an operator who is beeped at while typing learns to ignore
 *     beeps.
 */
import {
  looksLikeReceiptCode,
  normalizeReceiptScan,
  purchaseLines,
  resolveReceiptScan,
} from './receiptReturn';

const sale = (over = {}) => ({
  id: 412, receipt_code: 'RC00000412', quantity: 1,
  status: 'completed', product: 7, customer: 3, ...over,
});

/** The two-line purchase from production: sales 412 and 413, one receipt. */
const purchase = [
  sale(),
  sale({ id: 413, quantity: 2 }),
];

const returned = (pairs) => new Map(pairs);

describe('cleaning up what the scanner typed', () => {
  it.each([
    ['RC00000412\r\n', 'a CRLF suffix'],
    ['RC00000412\t', 'a TAB suffix'],
    ['  rc00000412  ', 'unshifted keys and stray spaces'],
    ['RC00000412 ', 'the non-breaking space a wedge sometimes emits'],
  ])('reads %j — %s', (raw) => {
    expect(normalizeReceiptScan(raw)).toBe('RC00000412');
  });

  it('repairs a code read through a Cyrillic keyboard layout', () => {
    // The R key types К and the C key types С there, and Cyrillic С is visually identical to a
    // Latin one — not something anybody diagnoses from a screenshot.
    expect(normalizeReceiptScan('КС00000412')).toBe('RC00000412');
  });

  it.each([[null], [undefined], [''], ['   ']])('gives nothing for %j', (raw) => {
    expect(normalizeReceiptScan(raw)).toBe('');
  });
});

describe('recognising one of our receipts', () => {
  it.each([['RC00000412'], ['RC00000412AB9F'], ['rc00000412']])('accepts %s', (code) => {
    expect(looksLikeReceiptCode(code)).toBe(true);
  });

  it.each([
    ['LD00004821', 'a box sticker'],
    ['RC', 'the prefix alone'],
    ['RCX0000412', 'a letter where digits belong'],
    ['00000412', 'a bare number'],
    ['4901234567894', 'a factory EAN'],
    ['', 'nothing'],
  ])('rejects %j — %s', (code) => {
    expect(looksLikeReceiptCode(code)).toBe(false);
  });

  it('rejects a runaway keystroke burst that starts with the prefix', () => {
    // The suffix is exactly four hex characters for this reason: an open-ended run also matches
    // digits, so this would qualify and earn an error beep instead of silence.
    expect(looksLikeReceiptCode(`RC${'9'.repeat(300)}`)).toBe(false);
  });
});

describe('what is left on the purchase', () => {
  it('returns every line sharing the code', () => {
    expect(purchaseLines(purchase, 'RC00000412', returned([]))).toHaveLength(2);
  });

  it('leaves out lines from a different purchase', () => {
    const others = [...purchase, sale({ id: 500, receipt_code: 'RC00000500' })];
    expect(purchaseLines(others, 'RC00000412', returned([])).map((l) => l.sale.id))
      .toEqual([412, 413]);
  });

  it('counts what has already come back', () => {
    const [, second] = purchaseLines(purchase, 'RC00000412', returned([[413, 1]]));
    expect(second).toMatchObject({ bought: 2, returned: 1, remaining: 1, returnable: true });
  });

  it('marks a spent line rather than dropping it', () => {
    // The receipt in the customer's hand lists it. A screen that hides it cannot be reconciled
    // with the paper, and nobody can tell a return from a bug.
    const [first] = purchaseLines(purchase, 'RC00000412', returned([[412, 1]]));
    expect(first).toMatchObject({ remaining: 0, fullyReturned: true, returnable: false });
  });

  it('refuses a line the shop never completed', () => {
    const lines = purchaseLines([sale({ status: 'cancelled' })], 'RC00000412', returned([]));
    expect(lines[0].returnable).toBe(false);
  });

  it('orders lines the way the receipt printed them', () => {
    const shuffled = [purchase[1], purchase[0]];
    expect(purchaseLines(shuffled, 'RC00000412', returned([])).map((l) => l.sale.id))
      .toEqual([412, 413]);
  });

  it('accepts a plain object tally as well as a Map', () => {
    const [first] = purchaseLines(purchase, 'RC00000412', { 412: 1 });
    expect(first.remaining).toBe(0);
  });

  it.each([[[]], [null], [undefined]])('survives %j', (rows) => {
    expect(purchaseLines(rows, 'RC00000412', returned([]))).toEqual([]);
  });
});

describe('what a scan means', () => {
  const resolve = (raw, rows = purchase, tally = returned([])) =>
    resolveReceiptScan(rows, raw, tally);

  it('opens the purchase when something can still come back', () => {
    const res = resolve('RC00000412');
    expect(res.kind).toBe('purchase');
    expect(res.lines).toHaveLength(2);
  });

  it('says so when the whole receipt has already been returned', () => {
    expect(resolve('RC00000412', purchase, returned([[412, 1], [413, 2]])).kind)
      .toBe('all-returned');
  });

  it('still hands back the lines when everything is spent', () => {
    // So the screen can show the customer *when* each item came back, which is the question
    // they are about to ask.
    expect(resolve('RC00000412', purchase, returned([[412, 1], [413, 2]])).lines).toHaveLength(2);
  });

  it('reports a receipt it does not recognise', () => {
    expect(resolve('RC00009999').kind).toBe('unknown');
  });

  it('names a box sticker for what it is', () => {
    // Two kinds of barcode now exist in this shop, and somebody will scan a shoebox at the
    // returns counter. "That is a product label" beats "not found".
    expect(resolve('LD00004821').kind).toBe('layer');
  });

  it.each([
    ['4901234567894', 'a factory EAN'],
    ['hello', 'somebody typing'],
    ['', 'nothing at all'],
    [null, 'no input'],
  ])('stays silent for %j — %s', (raw) => {
    expect(resolve(raw).kind).toBe('ignore');
  });

  it('carries the cleaned code back for the message', () => {
    expect(resolve(' rc00000412 \r\n').code).toBe('RC00000412');
  });

  it('treats a sale with no receipt code as not on any receipt', () => {
    const rows = [sale({ receipt_code: null })];
    expect(resolveReceiptScan(rows, 'RC00000412', returned([])).kind).toBe('unknown');
  });

  it('survives a malformed row', () => {
    expect(() => resolveReceiptScan([null, {}, undefined], 'RC00000412', returned([])))
      .not.toThrow();
  });
});
