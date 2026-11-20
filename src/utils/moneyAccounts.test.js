/**
 * Which account a payment came out of — the front end's half of Phase 2.
 *
 * The mirror of `test_money_accounts` on the server, and both halves earn their place for
 * different reasons: the server is what actually refuses, and this is what stops the form offering
 * a choice the server will then reject, or quietly keeping one that no longer applies.
 *
 * The last group is the one most likely to break unnoticed. Picking Perechisleniye for a som
 * expense and then switching the form to USD leaves a som bank account attached to a dollar
 * payment. Nothing moves wrongly — `refuse_account` answers `wrong_currency` — but the user is
 * shown an error about a field they cannot see is still set, which reads as a broken form.
 */
import {
  DEFAULT_ACCOUNT,
  accountAfterCurrencyChange,
  accountCurrency,
  accountIsValidFor,
  accountsForCurrency,
} from './moneyAccounts';
import { LEDGER_BUCKETS } from './ledgerBuckets';

const values = (currency) => accountsForCurrency(currency).map((b) => b.value);

describe('the picker is derived, not listed', () => {
  it('offers every bucket the ledger has, across the two currencies', () => {
    // A bucket added to `ledgerBuckets` and missed here would be an account the owner cannot
    // spend out of, with nothing on screen to say why.
    expect([...values('UZS'), ...values('USD')].sort()).toEqual(
      LEDGER_BUCKETS.map((b) => b.value).sort(),
    );
  });

  it('carries each bucket label key through, so an account is named the same as on Pul balansi', () => {
    accountsForCurrency('UZS').forEach((b) => {
      expect(typeof b.labelKey).toBe('string');
      expect(b.labelKey.length).toBeGreaterThan(0);
    });
  });
});

describe('the accounts of a currency', () => {
  it('offers cash, card and the bank for som', () => {
    expect(values('UZS')).toEqual(['uzs_cash', 'uzs_card', 'uzs_transfer']);
  });

  it('offers cash and card for dollars, and no bank — there is no dollar account', () => {
    expect(values('USD')).toEqual(['usd_cash', 'usd_card']);
  });

  it('keeps the backend ordering rather than sorting alphabetically', () => {
    // `uzs_card` comes after `uzs_cash` in `CashBalance.BALANCE_TYPE_CHOICES`, which is also the
    // order the drain uses, so the two read the same way down the page.
    expect(values('UZS').indexOf('uzs_cash')).toBeLessThan(values('UZS').indexOf('uzs_card'));
  });

  it('offers nothing for a currency the shop does not hold', () => {
    expect(values('EUR')).toEqual([]);
    expect(values('')).toEqual([]);
  });

  it('is case-insensitive about the currency', () => {
    expect(values('uzs')).toEqual(values('UZS'));
  });
});

describe('reading a currency off a bucket', () => {
  it.each([
    ['uzs_cash', 'UZS'],
    ['uzs_card', 'UZS'],
    ['uzs_transfer', 'UZS'],
    ['usd_cash', 'USD'],
    ['usd_card', 'USD'],
  ])('%s is %s', (account, currency) => {
    expect(accountCurrency(account)).toBe(currency);
  });

  it('admits it does not know rather than guessing', () => {
    // A guess here would make a comparison match by accident, which is how a dollar payment ends
    // up attached to a som account.
    expect(accountCurrency('mattress')).toBe('');
    expect(accountCurrency(null)).toBe('');
    expect(accountCurrency(undefined)).toBe('');
  });
});

describe('what counts as a legal choice', () => {
  it('treats blank as legal, because blank is a choice', () => {
    expect(accountIsValidFor(DEFAULT_ACCOUNT, 'UZS')).toBe(true);
    expect(accountIsValidFor('', 'USD')).toBe(true);
    expect(accountIsValidFor(null, 'USD')).toBe(true);
  });

  it('accepts an account of the same currency', () => {
    expect(accountIsValidFor('uzs_transfer', 'UZS')).toBe(true);
  });

  it('rejects an account of the other currency', () => {
    expect(accountIsValidFor('uzs_transfer', 'USD')).toBe(false);
    expect(accountIsValidFor('usd_cash', 'UZS')).toBe(false);
  });

  it('rejects a bucket that does not exist', () => {
    expect(accountIsValidFor('uzs_mattress', 'UZS')).toBe(false);
  });
});

describe('switching the currency after choosing an account', () => {
  it('drops a som account when the form becomes a dollar one', () => {
    expect(accountAfterCurrencyChange('uzs_transfer', 'USD')).toBe('');
  });

  it('drops a dollar account when the form becomes a som one', () => {
    expect(accountAfterCurrencyChange('usd_card', 'UZS')).toBe('');
  });

  it('keeps an account that still belongs to the new currency', () => {
    expect(accountAfterCurrencyChange('uzs_card', 'UZS')).toBe('uzs_card');
  });

  it('leaves blank alone', () => {
    expect(accountAfterCurrencyChange('', 'UZS')).toBe('');
    expect(accountAfterCurrencyChange(null, 'USD')).toBe('');
  });

  it('drops an account that was never valid in the first place', () => {
    expect(accountAfterCurrencyChange('uzs_mattress', 'UZS')).toBe('');
  });
});
