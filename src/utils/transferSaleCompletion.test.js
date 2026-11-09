/**
 * Bank transfer ("perechisleniye") as a fourth named claim on one unpaid remainder.
 *
 * Discount, nasiya and a transfer are independent explanations for money the customer did not
 * hand over, and one gap can hold all of them at once. The rule the server applies, mirrored
 * here so the form and the server never reach different verdicts about the same payment:
 *
 *     discount (named) + credit (named or the rest) + transfer (named) + fx (remainder)
 *         === due − paid
 *
 * **A transfer is never the leftover**, which is the one place its arithmetic differs from
 * credit's. An unnamed credit means "whatever is left", because a customer simply owing the rest
 * is the ordinary case; a transfer is a figure an organisation has agreed. Two unnamed claims
 * could not share one gap either.
 *
 * The server owns the final figures. What matters here is that the form agrees with it about
 * *whether* a payment is fully explained, so a cashier is never told a sale is fine and then
 * handed a rejection.
 */
import {
  buildCompleteSaleRequest,
  computePaymentDifferenceMeta,
  emptyPaymentFormState,
  somBoxForTransfer,
} from './saleCompletePayHelpers';

const RATE = 12000;

// Som-priced, because that is the only shape a transfer may settle — the owner's decision of
// 2026-11-08. The bank account takes som, so a som figure on a som sale needs no conversion.
const soumSale = {
  id: 701,
  quantity: 1,
  selling_price: 1000000,
  total_amount: 1000000,
  sale_currency: 'UZS',
  sale_type: 'bought_from_shop',
};

const form = (over) => ({ ...emptyPaymentFormState(), ...over });
const onTransfer = (over) => form({ apply_transfer: true, ...over });
const meta = (f, sale = soumSale) => computePaymentDifferenceMeta(sale, f, RATE);

describe('the form state', () => {
  test('a fresh form asks for no transfer', () => {
    const s = emptyPaymentFormState();
    expect(s.apply_transfer).toBe(false);
    expect(s.transfer_amount).toBe('');
    expect(s.transfer_received).toBe(false);
  });
});

describe('a transfer on its own', () => {
  test('the whole price by transfer leaves nothing to explain', () => {
    const m = meta(onTransfer({ transfer_amount: '1000000' }));
    expect(m.transferAmount).toBe(1000000);
    expect(m.transferExplained).toBe(true);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('part cash, part transfer also adds up', () => {
    const m = meta(onTransfer({ uzs: '300000', transfer_amount: '700000' }));
    expect(m.transferAmount).toBe(700000);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('the box with no amount is not an explanation', () => {
    // The thing to say is "type the amount", not "these add up to too much", so it has its own
    // flag rather than folding into `sharesExceedGap`.
    const m = meta(onTransfer());
    expect(m.transferAmountMissing).toBe(true);
    expect(m.transferAmount).toBe(0);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('more than the gap is refused', () => {
    const m = meta(onTransfer({ transfer_amount: '2000000' }));
    expect(m.sharesExceedGap).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('a transfer on a fully paid sale is refused', () => {
    // Inventing an expected transfer against money already in the till is a receivable for
    // nothing — the same refusal credit gives, for the same reason.
    const m = meta(onTransfer({ uzs: '1000000', transfer_amount: '500000' }));
    expect(m.transferWithNothingOwing).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('a tiyin amount is caught in the form as well as on the server', () => {
    // Three layers on purpose: the input mask, this, and the ledger write. A rule fixed in one
    // layer usually lives in three more.
    const m = meta(onTransfer({ transfer_amount: '500000.5' }));
    expect(m.transferNotWholeSom).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('a whole-som amount passes', () => {
    const m = meta(onTransfer({ transfer_amount: '500000', uzs: '500000' }));
    expect(m.transferNotWholeSom).toBe(false);
    expect(m.differenceNeedsClassification).toBe(false);
  });
});

describe('a transfer beside nasiya', () => {
  const both = (over) => onTransfer({
    apply_credit: true, credit_due_date: '2026-12-31', ...over,
  });

  test('an unnamed credit takes what the transfer leaves', () => {
    // 200,000 cash + 500,000 transfer on a 1,000,000 sale leaves 300,000 for the debt. Without
    // the transfer coming off first, credit would claim the whole 800,000 and the named shares
    // would add up to more than the gap.
    const m = meta(both({ uzs: '200000', transfer_amount: '500000' }));
    expect(m.transferAmount).toBe(500000);
    expect(m.creditAmount).toBe(300000);
    expect(m.sharesExceedGap).toBe(false);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('the three shares named together must not exceed the gap', () => {
    const m = meta(both({
      uzs: '200000', transfer_amount: '500000', credit_amount: '600000',
    }));
    expect(m.sharesExceedGap).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('the owner worked example adds up exactly', () => {
    // 1,000,000 sale: 200,000 cash + 300,000 nasiya + 500,000 transfer.
    const m = meta(both({
      uzs: '200000', transfer_amount: '500000', credit_amount: '300000',
    }));
    expect(m.creditAmount + m.transferAmount).toBe(800000);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('a discount can take a share too', () => {
    const m = meta(both({
      uzs: '200000',
      transfer_amount: '500000',
      credit_amount: '200000',
      balance_shortfall_type: 'discount',
      balance_shortfall_amount: '100000',
    }));
    expect(m.discountAmount).toBe(100000);
    expect(m.differenceNeedsClassification).toBe(false);
  });
});

describe('what reaches the server', () => {
  const request = (f) => buildCompleteSaleRequest(f, meta(f), RATE);

  test('an expected transfer sends the amount and no confirmation', () => {
    const data = request(onTransfer({ transfer_amount: '700000', uzs: '300000' }));
    expect(data.transfer_amount).toBe(700000);
    expect(data.transfer_received).toBeUndefined();
  });

  test('Pul tushgan sends the confirmation', () => {
    const data = request(onTransfer({ transfer_amount: '1000000', transfer_received: true }));
    expect(data.transfer_amount).toBe(1000000);
    expect(data.transfer_received).toBe(true);
  });

  test('nothing is sent when the box is off', () => {
    const data = request(form({ uzs: '1000000' }));
    expect(data.transfer_amount).toBeUndefined();
    expect(data.transfer_received).toBeUndefined();
  });

  test('a stale confirmation cannot travel without an amount', () => {
    // Otherwise a cashier who ticks Pul tushgan, clears the amount and submits gets a rejection
    // for a half-filled form rather than a sale.
    const data = request(onTransfer({ transfer_received: true }));
    expect(data.transfer_amount).toBeUndefined();
    expect(data.transfer_received).toBeUndefined();
  });

  test('a transfer and a credit travel together', () => {
    const data = request(onTransfer({
      apply_credit: true,
      credit_due_date: '2026-12-31',
      uzs: '200000',
      transfer_amount: '500000',
      credit_amount: '300000',
    }));
    expect(data.transfer_amount).toBe(500000);
    expect(data.apply_credit).toBe(true);
    expect(data.credit_amount).toBe(300000);
  });
});

describe('the strings the block needs', () => {
  // The block renders nothing readable without them, and a missing key shows as the key itself.
  const KEYS = [
    'transferOption',
    'transferAmountLabel',
    'transferAmountHint',
    'transferExpected',
    'transferReceived',
    'transferReceivedNotPermitted',
    'transferReceivedHint',
    'transferReceivedConfirm',
    'transferWholeSomOnly',
  ];

  test.each(['en', 'ru', 'uz'])('%s has every transfer string', (lang) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const sales = require(`../locales/${lang}/sales.json`);
    KEYS.forEach((key) => {
      expect(typeof sales.completePay[key]).toBe('string');
      expect(sales.completePay[key].length).toBeGreaterThan(0);
    });
  });

  test('the confirmation names both the customer and the amount', () => {
    // A confirm that only asks is one people learn to dismiss. This is money entering the books
    // on a cashier's word, so it states what is about to be asserted.
    ['en', 'ru', 'uz'].forEach((lang) => {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const sales = require(`../locales/${lang}/sales.json`);
      const msg = sales.completePay.transferReceivedConfirm;
      expect(msg).toContain('{{customer}}');
      expect(msg).toContain('{{amount}}');
    });
  });
});

describe('the som box follows the transfer amount', () => {
  /*
    The cashier's complaint that produced this: the option was invisible, because it only
    appeared once money was owing -- and the way you reach it is by having already typed the
    amount due into the som box. You cannot choose how a sale is paid from a form that offers
    the choice only after you have under-paid.

    Now it is always offered, and typing an amount into it *creates* the shortfall by lowering
    the som box. `somBoxForTransfer` is that subtraction, extracted so it can be checked here
    rather than only by eye.
  */
  test('a transfer of part of the sale leaves the rest for the drawer', () => {
    expect(somBoxForTransfer(1000000, 400000)).toBe('600000');
  });

  test('a transfer of the whole sale leaves the drawer nothing', () => {
    expect(somBoxForTransfer(1000000, 1000000)).toBe('0');
  });

  test('clearing the transfer gives the som back', () => {
    // What unticking the checkbox does. Without it the box keeps a figure that was only ever
    // low because the bank was covering the rest, and the sale completes short.
    expect(somBoxForTransfer(1000000, 0)).toBe('1000000');
  });

  test('a transfer larger than the sale never makes the drawer negative', () => {
    // A mistake for the server to name -- it refuses an overpayment -- not one to express as a
    // negative amount of cash.
    expect(somBoxForTransfer(1000000, 1500000)).toBe('0');
  });

  test('the box is left alone when the due figure cannot be read', () => {
    // A dollar-priced sale, or the CBU rate still loading. Filling the box with a guess is worse
    // than leaving what the cashier typed.
    expect(somBoxForTransfer(null, 400000)).toBeNull();
    expect(somBoxForTransfer(undefined, 400000)).toBeNull();
    expect(somBoxForTransfer(NaN, 400000)).toBeNull();
  });

  test('the answer is whole som', () => {
    // The UZS ledger takes no tiyin, and the server refuses a fractional som outright.
    expect(somBoxForTransfer(1000000.4, 333333.3)).toBe('666667');
    expect(somBoxForTransfer(1000000, 333333)).toBe('666667');
  });

  test('the parts add back to the whole', () => {
    // The property that matters: whatever is put on the bank, the two figures reconstitute the
    // sale. A cashier should never be able to complete a sale claiming both.
    for (const transfer of [0, 1, 250000, 333333, 999999, 1000000]) {
      const som = Number(somBoxForTransfer(1000000, transfer));
      expect(som + transfer).toBe(1000000);
    }
  });
});
