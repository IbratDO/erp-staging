/**
 * To'lovlar nazorati — Perechisleniye: the refusals, and that they agree with the server's.
 *
 * Every rule asserted here exists on the server too, inside the transaction that does the
 * writing. This copy is so an accountant is told what is wrong before pressing the button, and
 * these tests are so the two cannot drift: a mirror that disagrees is worse than no mirror,
 * because it refuses work the server would have accepted or promises work it will refuse.
 *
 * The two that are worth more than the rest:
 *
 * * **whole som**, which is the owner's rule for the whole UZS ledger and lives in three layers;
 * * **the ceiling**, which rounds the remainder *up*. A principal is a residual carried to twelve
 *   decimals, so a 999,999.9966 expectation has to be settleable by a 1,000,000 transfer or the
 *   row can never close — and a row that never closes never releases the rest of its margin.
 */
import {
  canCorrect,
  correctionRefusal,
  isClosed,
  isoDate,
  receiptCeiling,
  receiptRefusal,
  rowTone,
  totals,
} from './transferPaymentsHelpers';

const row = (over = {}) => ({
  id: 1,
  status: 'unpaid',
  principal_amount: '1000000.000000000000',
  received_amount: '0',
  remaining_amount: '1000000.000000000000',
  waived_amount: '0',
  ...over,
});

const TODAY = new Date(2026, 10, 8); // 8 Nov 2026, local — months are zero-based

describe('what the row is', () => {
  test('a closed row is paid or waived and nothing else', () => {
    expect(isClosed(row({ status: 'paid' }))).toBe(true);
    expect(isClosed(row({ status: 'waived' }))).toBe(true);
    expect(isClosed(row({ status: 'partial' }))).toBe(false);
    expect(isClosed(row())).toBe(false);
  });

  test('the colour band says where the row stands', () => {
    // A fully received record turns green and offers nothing further — the owner asked for that
    // outright, and it is the page's only use of colour as information.
    expect(rowTone(row({ status: 'paid' }))).toBe('paid');
    expect(rowTone(row({ status: 'waived' }))).toBe('waived');
    expect(rowTone(row({ status: 'partial', received_amount: '400000' }))).toBe('partial');
    expect(rowTone(row())).toBe('awaiting');
  });

  test('the totals are summed over what is on screen', () => {
    // Summed rather than fetched, so a filtered table's total always describes what is visible.
    // A total that described the unfiltered set would be read as a bug.
    expect(totals([
      row({ received_amount: '400000', remaining_amount: '600000' }),
      row({ principal_amount: '500000', received_amount: '500000', remaining_amount: '0' }),
    ])).toEqual({ expected: 1500000, received: 900000, remaining: 600000 });
  });

  test('no rows means three zeroes, not NaN', () => {
    expect(totals()).toEqual({ expected: 0, received: 0, remaining: 0 });
  });
});

describe('the receipt ceiling', () => {
  test('a whole remainder is its own ceiling', () => {
    expect(receiptCeiling(row())).toBe(1000000);
  });

  test('a fractional remainder rounds up', () => {
    // The case the ceiling exists for: 999,999 would leave 0.9966 owed, which is a whole som
    // short of dust and so stays owed for ever. Mirrors `_ceil_som`.
    expect(receiptCeiling(row({ remaining_amount: '999999.996600000000' }))).toBe(1000000);
    expect(receiptCeiling(row({ remaining_amount: '1000000.003400000000' }))).toBe(1000001);
  });
});

describe('why a receipt is refused', () => {
  const refuse = (over, fields) => receiptRefusal(row(over), fields, TODAY);

  test('a plain whole-som receipt within the remainder is accepted', () => {
    expect(refuse({}, { amount: '400000', valueDate: '2026-11-01' })).toBeNull();
    expect(refuse({}, { amount: '1000000' })).toBeNull();
  });

  test('a closed row is refused before anything else is looked at', () => {
    // Checked first on purpose: telling somebody their amount is wrong on a row that will take
    // no amount at all sends them off to fix the wrong thing.
    expect(refuse({ status: 'paid' }, { amount: '400000' })).toEqual({
      key: 'transfers.errClosed',
    });
  });

  test('an empty amount asks for one rather than calling it invalid', () => {
    expect(refuse({}, { amount: '' }).key).toBe('transfers.errAmountRequired');
    expect(refuse({}, {}).key).toBe('transfers.errAmountRequired');
  });

  test('nothing and less than nothing are refused', () => {
    expect(refuse({}, { amount: 'abc' }).key).toBe('transfers.errAmountNumber');
    expect(refuse({}, { amount: '0' }).key).toBe('transfers.errAmountPositive');
    expect(refuse({}, { amount: '-5000' }).key).toBe('transfers.errAmountPositive');
  });

  test('tiyin are refused', () => {
    expect(refuse({}, { amount: '400000.5' }).key).toBe('transfers.errWholeSom');
    expect(refuse({}, { amount: '0.01' }).key).toBe('transfers.errWholeSom');
  });

  test('more than the remainder is refused, and the message says how much there is', () => {
    const refusal = refuse({}, { amount: '1000001' });
    expect(refusal.key).toBe('transfers.errExceeds');
    expect(refusal.values).toEqual({ amount: 1000000 });
  });

  test('a receipt rounded up to the som against a fractional remainder is accepted', () => {
    expect(refuse(
      { remaining_amount: '999999.996600000000' }, { amount: '1000000' },
    )).toBeNull();
    // A whole som over is still refused: that is real money the shop was not owed.
    expect(refuse(
      { remaining_amount: '999999.996600000000' }, { amount: '1000001' },
    ).key).toBe('transfers.errExceeds');
  });

  test('a future value date is refused', () => {
    // Recognition reads this date, so a receipt dated next month would put its share of the
    // margin in a month that has not happened.
    expect(refuse({}, { amount: '1000', valueDate: '2026-11-09' }).key)
      .toBe('transfers.errDateFuture');
    // Today is fine. The boundary matters: this is the date the box is pre-filled with.
    expect(refuse({}, { amount: '1000', valueDate: '2026-11-08' })).toBeNull();
  });

  test('an unreadable value date is refused rather than ignored', () => {
    expect(refuse({}, { amount: '1000', valueDate: 'last tuesday' }).key)
      .toBe('transfers.errDateUnreadable');
  });

  test('no value date at all is fine — the server fills in today', () => {
    expect(refuse({}, { amount: '1000', valueDate: '' })).toBeNull();
  });
});

describe('isoDate', () => {
  test('it is the local day, not the UTC one', () => {
    // `toISOString().slice(0, 10)` is a day out after 19:00 in Tashkent, which would pre-fill the
    // box with tomorrow — and the server refuses a future value date, so the form would simply
    // stop working every evening.
    expect(isoDate(new Date(2026, 10, 8, 23, 30))).toBe('2026-11-08');
    expect(isoDate(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('correcting a receipt', () => {
  const line = (over = {}) => ({
    id: 7, amount: '400000', is_correction: false, reversed_by: null, ...over,
  });

  test('an ordinary receipt may be corrected', () => {
    expect(canCorrect(line())).toBe(true);
    expect(correctionRefusal(line(), 'typed the wrong figure')).toBeNull();
  });

  test('a correction cannot itself be corrected', () => {
    // Mirrors `reverse_transfer_receipt`. Otherwise an undo of an undo would re-add the money
    // with nothing in the history saying which entry was the live one.
    expect(canCorrect(line({ is_correction: true, amount: '-400000' }))).toBe(false);
    expect(correctionRefusal(line({ is_correction: true }), 'why not').key)
      .toBe('transfers.errNotCorrectable');
  });

  test('a receipt already cancelled cannot be cancelled twice', () => {
    expect(canCorrect(line({ reversed_by: 9 }))).toBe(false);
  });

  test('the reason is mandatory', () => {
    expect(correctionRefusal(line(), '').key).toBe('transfers.errReasonRequired');
    expect(correctionRefusal(line(), '   ').key).toBe('transfers.errReasonRequired');
    expect(correctionRefusal(line(), undefined).key).toBe('transfers.errReasonRequired');
  });
});

describe('the strings the page needs', () => {
  // The page renders nothing readable without them, and a missing key shows as the key itself.
  const SHELL = ['title', 'tabOnline', 'tabTransfer', 'nothingToSee'];
  const KEYS = [
    'intro', 'empty', 'filterScope', 'scopeOpen', 'scopeAll', 'filterSale', 'filterDocument',
    'colSale', 'colDate', 'colCustomer', 'colExpected', 'colReceived', 'colWaived',
    'colRemaining', 'colStatus', 'colActions', 'colValueDate', 'colAmount',
    'colRemainingAfter', 'colDocument', 'colEnteredBy', 'colNote', 'totalsLabel',
    'status_unpaid', 'status_partial', 'status_paid', 'status_waived',
    'actRecord', 'actHistory', 'actHide', 'actSave', 'actCorrect', 'actCorrectConfirm',
    'noReceipts', 'wasCorrected', 'reference',
    'fieldAmount', 'fieldValueDate', 'fieldDocument', 'fieldNotes', 'fieldReason',
    'hintWholeSom', 'hintValueDate', 'hintCorrect', 'confirmCorrect',
    'recorded', 'corrected',
    'errLoad', 'errRecord', 'errHistory', 'errCorrect', 'errClosed', 'errAmountRequired',
    'errAmountNumber', 'errAmountPositive', 'errWholeSom', 'errExceeds', 'errDateUnreadable',
    'errDateFuture', 'errNotCorrectable', 'errReasonRequired',
    // The write-off, which shipped with the equity row rather than with the page: until the
    // balance sheet could read a transfer, giving up on one left a hole the size of the amount
    // forgiven.
    'actWaive', 'actWaiveConfirm', 'fieldWaiveReason', 'waiveHint', 'confirmWaive',
    'waived', 'errWaive',
    // The owner's three-row breakdown. `row_*` are built by interpolation from the server's
    // `kind`, so a missing one shows as the key rather than failing anywhere.
    'colPaymentState', 'colSumma', 'colGrossProfit',
    'row_received', 'row_nasiya', 'row_transfer', 'rowTotal', 'breakdownHint',
    // The month lock's reason, asked for only after the server says the period is closed.
    'fieldClosedReason', 'closedReasonHint',
  ];

  test.each(['en', 'ru', 'uz'])('%s has every string the page asks for', (lang) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const sales = require(`../locales/${lang}/sales.json`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const common = require(`../locales/${lang}/common.json`);

    expect(typeof common.nav.paymentsControl).toBe('string');
    // The two sidebar sub-items. They are separate keys from the old tab labels because the
    // group is now navigation, not a tab strip, and the sidebar reads `common.nav.*`.
    expect(typeof common.nav.paymentsOnline).toBe('string');
    expect(common.nav.paymentsOnline.length).toBeGreaterThan(0);
    expect(typeof common.nav.paymentsBilling).toBe('string');
    expect(common.nav.paymentsBilling.length).toBeGreaterThan(0);
    SHELL.forEach((key) => {
      expect(typeof sales.paymentsControl[key]).toBe('string');
      expect(sales.paymentsControl[key].length).toBeGreaterThan(0);
    });
    KEYS.forEach((key) => {
      expect(typeof sales.transfers[key]).toBe('string');
      expect(sales.transfers[key].length).toBeGreaterThan(0);
    });
  });

  test('the interpolations the page passes are the ones the strings expect', () => {
    // A placeholder that does not match renders the brace literally — `Orders.js` has shipped
    // `{{status}}` on screen at six call sites for exactly this reason.
    ['en', 'ru', 'uz'].forEach((lang) => {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const { transfers } = require(`../locales/${lang}/sales.json`);
      expect(transfers.reference).toContain('{{reference}}');
      expect(transfers.errExceeds).toContain('{{amount}}');
      expect(transfers.confirmCorrect).toContain('{{amount}}');
      expect(transfers.confirmCorrect).toContain('{{id}}');
      expect(transfers.waiveHint).toContain('{{amount}}');
      expect(transfers.confirmWaive).toContain('{{amount}}');
      expect(transfers.confirmWaive).toContain('{{customer}}');
      expect(transfers.breakdownHint).toContain('{{cost}}');
    });
  });

  test('the month lock panel has every string it renders', () => {
    // The panel is the only way to close or reopen a period, and a missing key would show as the
    // key itself on the control that governs reported months.
    const KEYS = [
      'title', 'closedThrough', 'nothingClosed', 'setBy', 'change',
      'fieldDate', 'fieldReason', 'save', 'saved', 'hint',
      'reasonRequired', 'confirmReopen', 'errSave',
    ];
    ['en', 'ru', 'uz'].forEach((lang) => {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const { periodLock } = require(`../locales/${lang}/balanceSheet.json`);
      KEYS.forEach((key) => {
        expect(typeof periodLock[key]).toBe('string');
        expect(periodLock[key].length).toBeGreaterThan(0);
      });
      // The interpolations the panel passes.
      expect(periodLock.closedThrough).toContain('{{date}}');
      expect(periodLock.setBy).toContain('{{who}}');
      expect(periodLock.setBy).toContain('{{reason}}');
      expect(periodLock.confirmReopen).toContain('{{from}}');
      expect(periodLock.confirmReopen).toContain('{{to}}');
    });
  });

  test('the balance sheet has a label for each new row', () => {
    // Both rows are hidden when zero, so a missing label would show as the key itself only on
    // the day somebody first took a transfer -- which is exactly when nobody is looking for it.
    ['en', 'ru', 'uz'].forEach((lang) => {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const sheet = require(`../locales/${lang}/balanceSheet.json`);
      expect(typeof sheet.assets.transferReceivable).toBe('string');
      expect(sheet.assets.transferReceivable.length).toBeGreaterThan(0);
      expect(typeof sheet.equity.expectedTransferProfit).toBe('string');
      expect(sheet.equity.expectedTransferProfit.length).toBeGreaterThan(0);
    });
  });

  test('the confirmation says what happens to the money, not just "are you sure"', () => {
    // This takes money back out of the bank account. A confirm that only asks is one people
    // learn to dismiss; one that states what is about to happen is one they read.
    ['en', 'ru', 'uz'].forEach((lang) => {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const { transfers } = require(`../locales/${lang}/sales.json`);
      expect(transfers.confirmCorrect.length).toBeGreaterThan(80);
    });
  });
});


describe("To'lovlar nazorati is a sidebar group, the way Ombor is", () => {
  // eslint-disable-next-line global-require
  const { MENU_ITEMS, ROUTE_PERMISSIONS, filterMenuItems } = require('./permissions');

  const group = MENU_ITEMS.find((item) => item.labelKey === 'nav.paymentsControl');

  test('it is a dropdown with a basePath, not a single page', () => {
    expect(group.isDropdown).toBe(true);
    expect(group.basePath).toBe('/payments-control');
    // No `path` of its own: a group that also had one would render as a link in the sidebar and
    // the dropdown would never open.
    expect(group.path).toBeUndefined();
    expect(group.subItems.map((sub) => sub.path)).toEqual([
      '/payments-control/online',
      '/payments-control/billing',
    ]);
  });

  test('each page is gated on its own single permission', () => {
    // The point of the split: neither route has to be opened to the other's code. While the two
    // shared one page the route had to accept either, so whoever watched the gateways could
    // reach the bank statement page and the other way round.
    expect(ROUTE_PERMISSIONS['/payments-control/online']).toBe('gateway.view_pending');
    expect(ROUTE_PERMISSIONS['/payments-control/billing']).toBe('transfer.view');
    expect(group.subItems.map((sub) => sub.permission)).toEqual([
      'gateway.view_pending',
      'transfer.view',
    ]);
    // The group's landing path has no entry on purpose -- it is reachable on either code and
    // only redirects. A code here would lock one of the two roles out of its own page.
    expect(ROUTE_PERMISSIONS['/payments-control']).toBeUndefined();
  });

  test('a reader with one permission sees one sub-item, not both', () => {
    const accountant = { role_code: 'buxgalter', permissions: ['transfer.view'] };
    const menu = filterMenuItems(accountant);
    const shown = menu.find((item) => item.labelKey === 'nav.paymentsControl');
    expect(shown.subItems.map((sub) => sub.path)).toEqual(['/payments-control/billing']);
  });

  test('a cashier sees no group at all', () => {
    const cashier = { role_code: 'sales_manager', permissions: ['sales.complete_pay'] };
    const menu = filterMenuItems(cashier);
    expect(menu.find((item) => item.labelKey === 'nav.paymentsControl')).toBeUndefined();
  });

  test('every dropdown names its own basePath', () => {
    // `Layout` keys a group's open/expanded state by `basePath`. One without it would share the
    // `undefined` key with every other such group, so they would open and close together --
    // which is exactly the bug the single `inventoryOpen` boolean had.
    const dropdowns = MENU_ITEMS.filter((item) => item.isDropdown);
    expect(dropdowns.length).toBeGreaterThan(1);
    dropdowns.forEach((item) => {
      expect(typeof item.basePath).toBe('string');
      item.subItems.forEach((sub) => {
        expect(sub.path.startsWith(item.basePath)).toBe(true);
      });
    });
  });
});
