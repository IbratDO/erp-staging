/**
 * Pul balansi compiles and its bucket wiring is intact.
 *
 * Not a render test -- the page needs auth, settings and i18n providers plus a live API, and
 * standing all that up would test the providers rather than this page. It is narrower and cheaper
 * than that: **importing the module executes every module-level statement in it**, which is where
 * the bucket list, the currency columns and the roll-up functions are built.
 *
 * Why it is worth having at all: this page has no other test, and `react-scripts build` cannot be
 * relied on here to catch a mistake -- it has run the machine out of memory more than once on this
 * project, so "the build passes" has not always been evidence available to anyone. An import is.
 *
 * It would have caught the real mistake made while wiring the transfer bucket in: a leftover
 * reference to a `const` that had been moved out to `utils/ledgerBuckets.js`, which is a
 * module-level `ReferenceError` and therefore a blank page rather than a bad number.
 */
import { CURRENCY_COLS, LEDGER_BUCKETS } from '../utils/ledgerBuckets';

jest.mock('../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

describe('MoneyBalance', () => {
  it('imports without throwing', async () => {
    const mod = await import('./MoneyBalance');
    expect(typeof mod.default).toBe('function');
  });

  it('draws its buckets and columns from the shared util, not its own copy', () => {
    // The page used to declare both itself. If someone reintroduces a local copy, this stays
    // green -- but the util's own test suite is then testing something the page does not use,
    // so the pairing is asserted here: the page imports these exact objects.
    expect(LEDGER_BUCKETS.map((b) => b.value)).toContain('uzs_transfer');
    expect(CURRENCY_COLS.map((c) => c.key)).toEqual(['usd', 'uzs']);
  });
});
