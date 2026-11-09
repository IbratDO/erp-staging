/**
 * The ledger buckets and the per-currency roll-up.
 *
 * Worth pinning because the failure it guards against produces a **wrong number rather than a
 * missing one**. Pul balansi's Jami cards are summed from `sumBalances`; a bucket left out of that
 * reducer renders a total that looks entirely plausible and is short by one account. Nothing on
 * the page would say so, and the figure people check the drawer against would be the wrong one.
 *
 * It used to be possible: the bucket names were written twice per currency column, once in the
 * predicate and once in the reducer, so the two could disagree. These tests assert they cannot.
 */
import {
  LEDGER_BUCKETS,
  BUCKETS_BY_CURRENCY,
  CURRENCY_COLS,
  isUzsBucket,
} from './ledgerBuckets';

const col = (key) => CURRENCY_COLS.find((c) => c.key === key);

/** Balance rows shaped as `/cash-balance/` returns them: `balance` is a string. */
const rows = (pairs) =>
  Object.entries(pairs).map(([balance_type, balance]) => ({
    balance_type,
    balance: String(balance),
  }));

describe('the bucket list', () => {
  it('carries the five buckets the backend declares, in its order', () => {
    expect(LEDGER_BUCKETS.map((b) => b.value)).toEqual([
      'usd_cash',
      'uzs_cash',
      'usd_card',
      'uzs_card',
      'uzs_transfer',
    ]);
  });

  it('gives every bucket a label key, so none can render blank', () => {
    for (const b of LEDGER_BUCKETS) {
      expect(typeof b.labelKey).toBe('string');
      expect(b.labelKey.length).toBeGreaterThan(0);
    }
  });
});

describe('grouping by currency', () => {
  it('puts the transfer bucket with soum, not dollars', () => {
    expect(BUCKETS_BY_CURRENCY.uzs).toContain('uzs_transfer');
    expect(BUCKETS_BY_CURRENCY.usd).not.toContain('uzs_transfer');
  });

  it('accounts for every bucket exactly once', () => {
    // A bucket in neither group would vanish from both totals; one in both would be counted twice.
    const grouped = [...BUCKETS_BY_CURRENCY.usd, ...BUCKETS_BY_CURRENCY.uzs].sort();
    const all = LEDGER_BUCKETS.map((b) => b.value).sort();
    expect(grouped).toEqual(all);
  });

  it('agrees with isUzsBucket', () => {
    for (const v of BUCKETS_BY_CURRENCY.uzs) expect(isUzsBucket(v)).toBe(true);
    for (const v of BUCKETS_BY_CURRENCY.usd) expect(isUzsBucket(v)).toBe(false);
  });

  it('treats a missing or empty bucket name as not-soum rather than throwing', () => {
    expect(isUzsBucket(undefined)).toBe(false);
    expect(isUzsBucket('')).toBe(false);
  });
});

describe('the Jami totals', () => {
  it('includes transfer money in the soum total', () => {
    // **The bug this module exists for.** 500,000 of the 800,000 below sits in the bank; a reducer
    // that named only cash and card would report 300,000 and look perfectly fine doing it.
    const balances = rows({ uzs_cash: 200000, uzs_card: 100000, uzs_transfer: 500000 });
    expect(col('uzs').sumBalances(balances)).toBe(800000);
  });

  it('keeps dollars out of the soum total and soum out of the dollar total', () => {
    const balances = rows({ usd_cash: 40, uzs_cash: 200000, uzs_transfer: 500000 });
    expect(col('usd').sumBalances(balances)).toBe(40);
    expect(col('uzs').sumBalances(balances)).toBe(700000);
  });

  it('matches what the predicate claims to recognise', () => {
    // The two halves derive from one list, so a row the column *matches* must also be a row it
    // *sums*. This is the invariant the old duplicated version could violate.
    for (const c of CURRENCY_COLS) {
      for (const b of LEDGER_BUCKETS) {
        const summed = c.sumBalances(rows({ [b.value]: 7 }));
        expect(c.matchBalanceType(b.value)).toBe(summed === 7);
      }
    }
  });

  it('reads a missing bucket as zero rather than NaN', () => {
    // A fresh database has no rows at all, and the cards must show 0, not "NaN UZS".
    expect(col('uzs').sumBalances([])).toBe(0);
    expect(col('usd').sumBalances(undefined)).toBe(0);
  });

  it('survives a null or unparseable balance', () => {
    const balances = [
      { balance_type: 'uzs_cash', balance: null },
      { balance_type: 'uzs_transfer', balance: '12345' },
      { balance_type: 'uzs_card', balance: '' },
    ];
    expect(col('uzs').sumBalances(balances)).toBe(12345);
  });

  it('ignores a bucket it does not know', () => {
    // Forward compatibility: a backend that grows a bucket before the frontend is redeployed must
    // not have it land in the wrong currency's total.
    const balances = rows({ uzs_cash: 100, eur_cash: 999 });
    expect(col('uzs').sumBalances(balances)).toBe(100);
    expect(col('usd').sumBalances(balances)).toBe(0);
  });

  it('adds negative balances rather than dropping them', () => {
    // A bucket can go negative; the total has to say so.
    expect(col('uzs').sumBalances(rows({ uzs_cash: -5000, uzs_transfer: 2000 }))).toBe(-3000);
  });
});
