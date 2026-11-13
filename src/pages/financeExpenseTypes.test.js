/**
 * Boshqa moliyaviy yozuvlar -- the expense-type lists on the page agree with one another.
 *
 * The owner's report of 2026-11-13: the values offered by the filter's **Xarajat turi** were not
 * the values the page itself uses, and the form has a second dropdown beside it (**Maqsad**) whose
 * values are different again. Two of those three facts were bugs and one is the design:
 *
 *   * The filter was a hand-written third list that dropped `delivery` and `cargo` -- two types
 *     the form offers and that 12 of the dev copy's 123 rows carry. They showed in the table and
 *     could not be filtered to.
 *   * `fixed_asset_loss` and `stock_loss` are system rows that land on this page (no order, sale
 *     or dispatch, and not in `OTHER_FINANCE_EXCLUDE_EXPENSE_TYPES`), had no label in any
 *     language, and could not be filtered either.
 *   * **Maqsad is a different question** -- *where* the money went, not *what* it was for -- so
 *     it is not and must not be made the same list. `theTwoQuestionsStayApart` is here so the
 *     next person reading the report does not "fix" it by copying one list onto the other.
 */
import fs from 'fs';
import path from 'path';

import {
  EXPENSE_TYPE_VALUES,
  PAGE_ONLY_EXPENSE_TYPES,
  FILTER_EXPENSE_TYPES,
  EXPENSE_TARGET_VALUES,
} from './Finance';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const LANGS = ['en', 'ru', 'uz'];

const finance = (lang) => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'locales', lang, 'finance.json'), 'utf8'),
);

/**
 * Written by the system, excluded from this page server-side by `scope=other`. The form must not
 * offer any of them: the comment on `OTHER_FINANCE_EXCLUDE_EXPENSE_TYPES` records what a manual
 * `stock_purchase` cost -- the money taken a second time, a $12 buy emptying $24 from the till.
 */
const EXCLUDED_SERVER_SIDE = ['order', 'package', 'fixed_asset', 'stock_purchase'];

describe('the expense types of Boshqa moliyaviy yozuvlar', () => {
  it('offers in the filter exactly what the page can show', () => {
    expect(FILTER_EXPENSE_TYPES).toEqual([...EXPENSE_TYPE_VALUES, ...PAGE_ONLY_EXPENSE_TYPES]);
  });

  it('filters every type the form can create', () => {
    // The bug itself. `delivery` and `cargo` were the two missing.
    EXPENSE_TYPE_VALUES.forEach((value) => {
      expect(FILTER_EXPENSE_TYPES).toContain(value);
    });
    expect(FILTER_EXPENSE_TYPES).toContain('delivery');
    expect(FILTER_EXPENSE_TYPES).toContain('cargo');
  });

  it('keeps the system-written types out of the form', () => {
    EXCLUDED_SERVER_SIDE.forEach((value) => {
      expect(EXPENSE_TYPE_VALUES).not.toContain(value);
      expect(FILTER_EXPENSE_TYPES).not.toContain(value);
    });
    // The two that do reach the page are filterable but still not creatable by hand.
    PAGE_ONLY_EXPENSE_TYPES.forEach((value) => {
      expect(EXPENSE_TYPE_VALUES).not.toContain(value);
      expect(FILTER_EXPENSE_TYPES).toContain(value);
    });
  });

  it('has a label for every offered type in all three languages', () => {
    // A missing key is not an error -- i18n falls back to the raw slug, so the dropdown and the
    // table column print `fixed_asset_loss` to a cashier. That is how both of these shipped.
    LANGS.forEach((lang) => {
      const labels = finance(lang).expenseTypes;
      FILTER_EXPENSE_TYPES.forEach((value) => {
        expect(typeof labels[value]).toBe('string');
        expect(labels[value].length).toBeGreaterThan(0);
      });
    });
  });

  it('carries no label for a type nothing offers', () => {
    // The other direction: a leftover label is a value somebody will expect to find in the filter.
    LANGS.forEach((lang) => {
      expect(Object.keys(finance(lang).expenseTypes).sort())
        .toEqual([...FILTER_EXPENSE_TYPES].sort());
    });
  });

  it('keeps the two questions apart', () => {
    // Maqsad answers *where*, Xarajat turi answers *what*. They share only `other`, which is the
    // catch-all of both. Anything more overlapping means one list was copied onto the other.
    const shared = EXPENSE_TARGET_VALUES.filter((v) => FILTER_EXPENSE_TYPES.includes(v));
    expect(shared).toEqual(['other']);
  });

  it('labels every Maqsad value in all three languages', () => {
    LANGS.forEach((lang) => {
      const labels = finance(lang).targets;
      EXPENSE_TARGET_VALUES.forEach((value) => {
        expect(typeof labels[value]).toBe('string');
      });
    });
  });
});
