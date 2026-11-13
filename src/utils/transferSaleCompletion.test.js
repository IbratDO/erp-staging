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
  buildGroupCompleteRequests,
  computePaymentDifferenceMeta,
  emptyPaymentFormState,
  transferInSaleCurrency,
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

// **The money boxes hold the sale's total, not the cash.** `uzs` is everything the customer is
// settling the som side with, the bank's share included; the cash is what is left once the
// transfer comes off. So a sale paid 300 000 in notes and 700 000 by bank is `uzs: '1000000'`
// with a 700 000 transfer, not `uzs: '300000'`. The boxes used to hold the cash figure, and the
// form kept them that way by lowering the box as the transfer was typed -- which is the behaviour
// the owner reported on 2026-11-12 and what these tests were rewritten away from.
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
    // A million on the som box, 700 000 of it by bank, so 300 000 in notes.
    const m = meta(onTransfer({ uzs: '1000000', transfer_amount: '700000' }));
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
    //
    // It takes an overpayment to reach this now: the transfer is carved out of the som box, so
    // 1 500 000 on a 1 000 000 sale with 500 000 by bank still leaves the full price in notes and
    // nothing owing for the transfer to be. Typing the due itself can no longer trigger it, which
    // is the guard becoming structural rather than going away.
    const m = meta(onTransfer({ uzs: '1500000', transfer_amount: '500000' }));
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
    const m = meta(onTransfer({ transfer_amount: '500000', uzs: '1000000' }));
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
    //
    // 700 000 on the box is the 200 000 in notes plus the 500 000 the bank will send.
    const m = meta(both({ uzs: '700000', transfer_amount: '500000' }));
    expect(m.transferAmount).toBe(500000);
    expect(m.creditAmount).toBe(300000);
    expect(m.sharesExceedGap).toBe(false);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('the three shares named together must not exceed the gap', () => {
    const m = meta(both({
      uzs: '700000', transfer_amount: '500000', credit_amount: '600000',
    }));
    expect(m.sharesExceedGap).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('the owner worked example adds up exactly', () => {
    // 1,000,000 sale: 200,000 cash + 300,000 nasiya + 500,000 transfer.
    const m = meta(both({
      uzs: '700000', transfer_amount: '500000', credit_amount: '300000',
    }));
    expect(m.creditAmount + m.transferAmount).toBe(800000);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('a discount can take a share too', () => {
    const m = meta(both({
      uzs: '700000',
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

describe('the total does not move when a transfer is entered', () => {
  /*
    The owner's report, in his words: "due amount is changing if I enter the Bank o'tkazmasi
    field. as I said, it should not change unless I change it manually. it should be split only."

    The form used to lower the som box by the transfer amount. It had a real reason -- that box is
    what the server reads as money received, and the bank's share has not reached the drawer -- but
    it meant the figure the cashier reads as the amount due dropped the moment they named a
    transfer. The total is left alone now and the subtraction happens on the way to the server, so
    the screen shows what the sale is for and the books still record only what came in.

    3 000 000 of goods with 1 000 000 wired is the example he used.
  */
  const DUE = 3000000;
  const bigSale = { ...soumSale, id: 702, selling_price: DUE, total_amount: DUE };
  const typed = (transfer) => onTransfer({
    uzs: String(DUE), transfer_amount: String(transfer), sale_currency: 'UZS',
  });
  const sent = (transfer) => buildCompleteSaleRequest(
    typed(transfer), computePaymentDifferenceMeta(bigSale, typed(transfer), RATE), { rate: RATE },
  );

  test('the box the cashier typed in is untouched', () => {
    // The whole complaint, asserted on the form state itself: naming a transfer changes the
    // transfer field and nothing else.
    const f = typed(1000000);
    expect(f.uzs).toBe('3000000');
    expect(f.usd).toBe('');
  });

  test('the shop is told it received the total less the transfer', () => {
    // 3 000 000 on screen, 1 000 000 to the bank, so 2 000 000 reached the drawer.
    expect(sent(1000000).uzs).toBe(2000000);
    expect(sent(1000000).transfer_amount).toBe(1000000);
  });

  test('a sale settled wholly by transfer records no cash at all', () => {
    expect(sent(DUE).uzs).toBe(0);
    expect(sent(DUE).transfer_amount).toBe(DUE);
  });

  test('the parts add back to the whole', () => {
    // The property that matters: whatever is put on the bank, cash and transfer reconstitute the
    // sale. A cashier must never be able to complete one claiming both.
    for (const transfer of [0, 1, 250000, 333333, 999999, DUE]) {
      const req = sent(transfer);
      expect(req.uzs + (req.transfer_amount || 0)).toBe(DUE);
    }
  });

  test('more on the bank than the sale is for records no negative cash', () => {
    // A mistake for the server to name, not one to express as a negative amount of money.
    expect(sent(DUE + 500000).uzs).toBe(0);
  });

  test('the gap the form reasons about is still the transfer', () => {
    // The validation chain is untouched by the move: it sees the same shortfall it always did,
    // fully explained by the named transfer, so the cashier gets the same verdict as before.
    const m = computePaymentDifferenceMeta(bigSale, typed(1000000), RATE);
    expect(m.paid).toBe(DUE - 1000000);
    expect(m.differenceNeedsClassification).toBe(false);
  });
});

describe('a basket of several items settled by transfer', () => {
  // 600 000 and 400 000 of goods -- a million in all, so the weights are 60% and 40% and the
  // arithmetic can be read without a calculator.
  const lineA = { ...soumSale, id: 801, selling_price: 600000, total_amount: 600000 };
  const lineB = { ...soumSale, id: 802, selling_price: 400000, total_amount: 400000 };
  const lines = [lineA, lineB];
  const group = {
    ...lineA, isSaleGroup: true, groupSales: lines, quantity: 2, total_amount: 1000000,
  };
  const build = (f) => buildGroupCompleteRequests(lines, f, meta(f, group), null);

  test('the transfer is divided by each line’s due, never repeated whole', () => {
    // The bug this exists for: `...paymentFormData` carries every field down to every line, so
    // an un-apportioned figure would open 1 000 000 of receivable against 500 000 the bank
    // holds -- and the server would not refuse it, because a transfer is a named figure rather
    // than a write-off bounded by a remainder.
    const reqs = build(onTransfer({ uzs: '500000', transfer_amount: '500000' }));

    expect(reqs.map((r) => r.id)).toEqual([801, 802]);
    expect(reqs[0].data.transfer_amount).toBe(300000);
    expect(reqs[1].data.transfer_amount).toBe(200000);
  });

  test('the shares add back to the figure the cashier typed, to the som', () => {
    // Awkward on purpose: 333 333 does not divide 60/40 into whole som, so the last line takes
    // the remainder by subtraction rather than a second rounding.
    for (const typed of [1, 7, 333333, 499999, 1000000]) {
      const reqs = build(onTransfer({ transfer_amount: String(typed) }));
      const shares = reqs.map((r) => r.data.transfer_amount || 0);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(typed);
      shares.forEach((share) => expect(Number.isInteger(share)).toBe(true));
    }
  });

  test('a line whose share rounds away carries no transfer at all', () => {
    // The server wants a named positive figure and refuses a zero. Nothing is left unexplained:
    // the line's slice of the money is weighted the same way.
    // One som across a 60/40 basket: the first line rounds 0.6 up to the whole som and the last
    // one is left with nothing by subtraction.
    const reqs = build(onTransfer({ transfer_amount: '1' }));

    expect(reqs[0].data.transfer_amount).toBe(1);
    expect(reqs[1].data.transfer_amount).toBeUndefined();
    expect(reqs[1].data.apply_transfer).toBeUndefined();
  });

  test('"Pul tushgan" rides down to every line that has a share', () => {
    const reqs = build(onTransfer({ transfer_amount: '500000', transfer_received: true }));

    reqs.forEach((r) => expect(r.data.transfer_received).toBe(true));
  });

  test('a basket with no transfer sends no transfer fields', () => {
    const reqs = build(form({ uzs: '1000000' }));

    reqs.forEach((r) => {
      expect(r.data.transfer_amount).toBeUndefined();
      expect(r.data.transfer_received).toBeUndefined();
    });
  });
});

describe('a dollar-priced sale settled by a som transfer', () => {
  // The owner's rule of 2026-11-11: perechisleniye is som, dollars are cash only. $20 of goods
  // and a rate of 12,000, so the whole sale is 240,000 som and the arithmetic reads by eye.
  const dollarSale = {
    id: 901,
    quantity: 1,
    selling_price: 20,
    total_amount: 20,
    sale_currency: 'USD',
    sale_type: 'bought_from_shop',
  };
  const usdMeta = (f, rate = RATE) => computePaymentDifferenceMeta(dollarSale, f, rate);

  test('the som is valued at the CBU rate and explains the dollar gap', () => {
    const m = usdMeta(onTransfer({ transfer_amount: '240000' }));

    // Two figures, and confusing them is the whole hazard: the customer wires som, the gap is
    // in dollars.
    expect(m.transferSom).toBe(240000);
    expect(m.transferAmount).toBeCloseTo(20, 6);
    expect(m.transferExplained).toBe(true);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('part in dollars at the till, the rest from the bank in som', () => {
    // $20 on the dollar box, 96 000 som ($8) by bank, so $12 in notes.
    const m = usdMeta(onTransfer({ usd: '20', transfer_amount: '96000' }));

    expect(m.transferAmount).toBeCloseTo(8, 6);
    expect(m.differenceNeedsClassification).toBe(false);
  });

  test('more som than the sale is worth is still refused', () => {
    const m = usdMeta(onTransfer({ transfer_amount: '360000' }));

    expect(m.sharesExceedGap).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
  });

  test('the whole-som rule reads the som, never the dollars it converts to', () => {
    // 96,000 som is a perfectly whole som figure worth $8.00; 96,001 som is whole too and worth
    // $8.0000833. Checking the converted figure would reject both.
    expect(usdMeta(onTransfer({ transfer_amount: '96001' })).transferNotWholeSom).toBe(false);
    expect(usdMeta(onTransfer({ transfer_amount: '96000.5' })).transferNotWholeSom).toBe(true);
  });

  test('without a rate the form says to wait rather than that it does not add up', () => {
    const m = usdMeta(onTransfer({ transfer_amount: '240000' }), null);

    expect(m.transferNeedsRate).toBe(true);
    expect(m.differenceNeedsClassification).toBe(true);
    // Not this: "these shares exceed the gap" would be a lie about a sum nobody has worked out.
    expect(m.sharesExceedGap).toBe(false);
  });

  test('a som sale never needs a rate', () => {
    const m = computePaymentDifferenceMeta(soumSale, onTransfer({ transfer_amount: '400000' }), null);

    expect(m.transferNeedsRate).toBe(false);
    expect(m.transferAmount).toBe(400000);
  });

  test('the request carries the rate the form showed', () => {
    // Without it the server falls back to the latest CBU row, which is usually the same number
    // and silently is not on the day the rate changes.
    const f = onTransfer({ transfer_amount: '240000', sale_currency: 'USD' });
    const data = buildCompleteSaleRequest(f, usdMeta(f), { rate: RATE });

    expect(data.transfer_amount).toBe(240000);
    expect(data.exchange_rate).toBe(RATE);
  });

  test('a som sale sends no rate for a transfer alone', () => {
    const f = onTransfer({ transfer_amount: '400000', sale_currency: 'UZS' });
    const data = buildCompleteSaleRequest(f, meta(f), { rate: RATE });

    expect(data.exchange_rate).toBeUndefined();
  });
});

describe('a som payment that rounds up over a dollar price', () => {
  /*
    The owner's report of 2026-11-13, and the commonest shape there is: a round number of som that
    comes to slightly more than the dollar price, part of it by bank.

        $408 sale at 11 973.44
        posted   5 000 000 som = $417.59
        wire     2 000 000 som = $167.04
        cash     3 000 000 som = $250.55
        over                     $  9.59   <- Konversiya farqi, already ticked

    The gap is measured against the cash, so it was only $157.45 -- below the $167.04 wire by
    exactly the amount the payment ran over. `sharesExceedGap` therefore fired on every sale that
    rounded up, however little, and ticking Konversiya farqi could not clear it because that check
    never looked at the classification. A dead end with the right answer already on screen.
  */
  const RATE_408 = 11973.44;
  const usdSale = {
    ...soumSale, id: 408, selling_price: 408, total_amount: 408, sale_currency: 'USD',
  };
  const entry = (over) => onTransfer({
    uzs: '5000000',
    transfer_amount: '2000000',
    sale_currency: 'USD',
    apply_currency_conversion_difference: true,
    ...over,
  });
  const m = (f) => computePaymentDifferenceMeta(usdSale, f, RATE_408);

  test('the figures are the ones the till showed', () => {
    const meta = m(entry());
    expect(meta.postedGross).toBeCloseTo(417.59, 2);
    expect(meta.transferAmount).toBeCloseTo(167.04, 2);
    expect(meta.paid).toBeCloseTo(250.55, 2);
    expect(meta.conversionDifference).toBeCloseTo(9.59, 2);
  });

  test('it completes with the rate difference named', () => {
    // The whole report: this was refused, with nothing the cashier could do about it.
    expect(m(entry()).sharesExceedGap).toBe(false);
    expect(m(entry()).differenceNeedsClassification).toBe(false);
  });

  test('the wire and the notes reach the server separately', () => {
    const f = entry();
    const req = buildCompleteSaleRequest(f, m(f), { rate: RATE_408 });
    expect(req.uzs).toBe(3000000);
    expect(req.usd).toBe(0);
    expect(req.transfer_amount).toBe(2000000);
    expect(req.exchange_rate).toBe(RATE_408);
  });

  test('the round-up must still be named', () => {
    const meta = m(entry({ apply_currency_conversion_difference: false }));
    expect(meta.differenceNeedsClassification).toBe(true);
  });

  test('the wire may not exceed what is being settled', () => {
    // The owner's own rule, and the bound that replaced the gap test once the payment covers the
    // price. 6 000 000 of wire against a 5 000 000 payment leaves the drawer owing money.
    const meta = m(entry({ transfer_amount: '6000000' }));
    expect(meta.transferExceedsPayment).toBe(true);
    expect(meta.differenceNeedsClassification).toBe(true);
  });

  test('a wire equal to the whole payment is allowed', () => {
    // Nothing in the drawer, all of it by bank: the boundary case of that rule, not past it.
    const meta = m(entry({ transfer_amount: '5000000' }));
    expect(meta.transferExceedsPayment).toBe(false);
  });

  test('a payment short of the price still bounds the wire', () => {
    // The bound has to keep working where it was written for. 1 000 000 of som is $83.52 against
    // a $408 price, so the sale is far short and a discount cannot take the wire past what is
    // left unpaid.
    const meta = m(onTransfer({
      uzs: '3000000',
      transfer_amount: '2000000',
      sale_currency: 'USD',
      balance_shortfall_type: 'discount',
      balance_shortfall_amount: '200',
    }));
    expect(meta.sharesExceedGap).toBe(true);
  });
});

describe('selling above a stale price, part of it by bank', () => {
  /*
    The owner's case of 2026-11-12: "the price of the item can be risen and the entered soum
    amount is old price... the customer may have 700000 soums and 60$ in cash, and he wants to pay
    the remaining 300000 by Bank o'tkazmasi, what is wrong with that?"

    Nothing. A transfer used to be bounded by the unpaid remainder, which is right while the
    figure on the product is the figure being charged, and wrong here: the customer hands over
    more than the listed price *and* still owes a share of the raised one. Both at once -- the
    receivable is real and the extra is additional profit.

    A 1 000 000 product sold for 1 720 000: 700 000 and $60 in notes, 300 000 to come by bank.
    The som box carries 1 000 000 (700 000 of notes plus the 300 000 wire) and the dollar box 60.
  */
  const entry = (over) => onTransfer({
    uzs: '1000000', usd: '60', transfer_amount: '300000', sale_currency: 'UZS', ...over,
  });
  const m = (f) => computePaymentDifferenceMeta(soumSale, f, RATE);

  test('the surplus is measured with the transfer already taken off', () => {
    // The figure the form shows has to be the one the server computes. The server subtracts the
    // transfer from the expected amount whatever the payment comes to, so 1 420 000 of cash
    // against 700 000 still expected leaves 720 000 -- the raise. Valuing the transfer only
    // against a shortfall left this at 420 000 and the two layers disagreed.
    const meta = m(entry({ apply_additional_profit: true }));
    expect(meta.paid).toBe(1420000);
    expect(meta.transferAmount).toBe(300000);
    expect(meta.additionalProfitAmount).toBe(720000);
  });

  test('it completes once the raise is named', () => {
    expect(m(entry({ apply_additional_profit: true })).differenceNeedsClassification).toBe(false);
  });

  test('the request carries both the wire and the profit', () => {
    const f = entry({ apply_additional_profit: true });
    const req = buildCompleteSaleRequest(f, m(f), { rate: RATE });
    // 700 000 in the drawer: the som box less the wire.
    expect(req.uzs).toBe(700000);
    expect(req.usd).toBe(60);
    expect(req.transfer_amount).toBe(300000);
    expect(req.apply_additional_profit).toBe(true);
  });

  test('the raise must still be named, or the sale is stopped', () => {
    // The control that replaced the old refusal. Ticking a transfer must not be a way to book an
    // overpayment quietly, so with nothing named the form still blocks and still offers the
    // Qo'shimcha foyda confirmation.
    const meta = m(entry());
    expect(meta.transferWithNothingOwing).toBe(true);
    expect(meta.needsAdditionalProfitConfirm).toBe(true);
    expect(meta.differenceNeedsClassification).toBe(true);
  });

  test('a conversion difference names it just as well', () => {
    // Either explanation answers the question "where did the extra come from?".
    expect(m(entry({ apply_currency_conversion_difference: true })).transferWithNothingOwing)
      .toBe(false);
  });

  test('an ordinary shortfall by bank is unaffected', () => {
    // The common case, with nothing over: no profit, nothing to name.
    const meta = m(onTransfer({
      uzs: '1000000', transfer_amount: '300000', sale_currency: 'UZS',
    }));
    expect(meta.transferAmount).toBe(300000);
    expect(meta.additionalProfitAmount).toBeNull();
    expect(meta.differenceNeedsClassification).toBe(false);
  });

  test('a transfer on a sale overpaid in cash alone is still refused', () => {
    // Nothing explains the extra and nothing was asked to: the old refusal stands.
    const meta = m(onTransfer({
      uzs: '1500000', transfer_amount: '300000', sale_currency: 'UZS',
    }));
    expect(meta.transferWithNothingOwing).toBe(true);
    expect(meta.differenceNeedsClassification).toBe(true);
  });
});

describe('a sale settled in both currencies and by bank', () => {
  /*
    The hazard the ordering exists for. A transfer is som, so it comes off the som box first and
    only the part the som box cannot cover converts and comes off the dollars.

    It used to come off whichever box the *sale's* currency named, and that was wrong in both
    directions as soon as one sale was settled in both currencies. Worse, the form said nothing:
    its check adds the two boxes together before taking the transfer off, so it saw a payment that
    balanced while the request sent more money than the shop had.
  */
  const RATE_SOM = RATE; // 12 000 som to the dollar, so $1 is 12 000 and 96 000 som is $8.
  const dollarSale = {
    ...soumSale, id: 905, selling_price: 20, total_amount: 20, sale_currency: 'USD',
  };
  const sentFor = (sale, f) => buildCompleteSaleRequest(
    f, computePaymentDifferenceMeta(sale, f, RATE_SOM), { rate: RATE_SOM },
  );
  // What the shop was told it holds, valued back into the sale's currency, transfer included.
  // The property every case here asserts: it reconstitutes the price.
  const reconstructed = (sale, req) => (
    sale.sale_currency === 'UZS'
      ? req.uzs + req.usd * RATE_SOM + (req.transfer_amount || 0)
      : req.usd + req.uzs / RATE_SOM + (req.transfer_amount || 0) / RATE_SOM
  );

  test('a dollar sale paid in notes of both kinds plus a wire', () => {
    // $20 of goods: $5 in notes, 84 000 som in notes, 96 000 som ($8) wired. The wired som sits
    // on the som box, which is where a cashier naturally puts it -- the transfer is som.
    const f = onTransfer({
      usd: '5', uzs: '180000', transfer_amount: '96000', sale_currency: 'USD',
    });
    const req = sentFor(dollarSale, f);
    expect(req.uzs).toBe(84000);
    expect(req.usd).toBe(5);
    // Recorded $23 against a $20 sale before the som box was given precedence.
    expect(reconstructed(dollarSale, req)).toBeCloseTo(20, 2);
  });

  test('a som sale paid partly in dollars plus a wire', () => {
    // 1 000 000 of goods: $10 (120 000) in notes, 380 000 som in notes, 500 000 wired.
    const f = onTransfer({
      usd: '10', uzs: '880000', transfer_amount: '500000', sale_currency: 'UZS',
    });
    const req = sentFor(soumSale, f);
    expect(req.uzs).toBe(380000);
    expect(req.usd).toBe(10);
    expect(reconstructed(soumSale, req)).toBeCloseTo(1000000, 0);
  });

  test('a wire larger than the som box spills onto the dollars', () => {
    // 1 000 000 of goods: $50 on the box, 400 000 som on it, 600 000 wired. The som box covers
    // 400 000 of the wire and the remaining 200 000 (about $16.67) comes off the dollars.
    const f = onTransfer({
      usd: '50', uzs: '400000', transfer_amount: '600000', sale_currency: 'UZS',
    });
    const req = sentFor(soumSale, f);
    expect(req.uzs).toBe(0);
    expect(req.usd).toBeCloseTo(33.33, 2);
    // Recorded 1 200 000 against a 1 000 000 sale before the spill was handled. Whole cents on
    // the dollar side leave it a few som short of exact, inside the half-cent the server allows.
    expect(reconstructed(soumSale, req)).toBeCloseTo(1000000, -2);
  });

  test('the rate travels whenever som has to cross the currency line', () => {
    // A som sale needs it too once the wire runs past the som box, or the server would value the
    // spill at a rate the cashier never saw.
    const spill = onTransfer({
      usd: '50', uzs: '400000', transfer_amount: '600000', sale_currency: 'UZS',
    });
    expect(sentFor(soumSale, spill).exchange_rate).toBe(RATE_SOM);
    // No spill, no crossing, no rate.
    const noSpill = onTransfer({
      uzs: '1000000', transfer_amount: '400000', sale_currency: 'UZS',
    });
    expect(sentFor(soumSale, noSpill).exchange_rate).toBeUndefined();
  });

  test('the parts add back to the whole across the currency line', () => {
    // Swept across wires that fall short of, land on, and run past the som box.
    for (const wire of [0, 100000, 400000, 400001, 600000, 1000000]) {
      const f = onTransfer({
        usd: '50', uzs: '400000', transfer_amount: String(wire), sale_currency: 'UZS',
      });
      const req = sentFor(soumSale, f);
      expect(req.uzs).toBeGreaterThanOrEqual(0);
      expect(req.usd).toBeGreaterThanOrEqual(0);
      expect(reconstructed(soumSale, req)).toBeCloseTo(1000000, -2);
    }
  });
});

describe('which money the transfer comes out of', () => {
  /*
    The transfer is always som. What it comes off depends on the sale: a som sale pays the rest
    from the som box, anything else from the dollar box, because dollars are cash only -- the
    owner's rule of 2026-11-11. Either way the boxes themselves are never rewritten; what moves is
    only what the server is told arrived.
  */
  const sentFor = (sale, f) => buildCompleteSaleRequest(
    f, computePaymentDifferenceMeta(sale, f, RATE), { rate: RATE },
  );

  test('a som sale takes it off the som', () => {
    const f = onTransfer({ uzs: '1000000', transfer_amount: '400000', sale_currency: 'UZS' });
    expect(sentFor(soumSale, f).uzs).toBe(600000);
    expect(f.uzs).toBe('1000000');
  });

  test('a dollar sale takes it off the dollars, at the rate on screen', () => {
    // $20 of goods and 96 000 som wired: eight dollars of it, so twelve in cash.
    const dollarSale = {
      ...soumSale, id: 703, selling_price: 20, total_amount: 20, sale_currency: 'USD',
    };
    const f = onTransfer({ usd: '20', transfer_amount: '96000', sale_currency: 'USD' });
    const req = sentFor(dollarSale, f);
    expect(req.usd).toBe(12);
    expect(req.uzs).toBe(0);
    // The som figure is what the bank is sent, whatever the goods were priced in.
    expect(req.transfer_amount).toBe(96000);
    expect(f.usd).toBe('20');
  });

  test('valuing the som needs the rate, and says so rather than guessing', () => {
    // A dollar sale with no rate yet: the transfer values at nothing and the form blocks on
    // `transferNeedsRate`, which is a different thing to say than "these do not add up".
    expect(transferInSaleCurrency(
      onTransfer({ transfer_amount: '96000' }), 'USD', null,
    )).toEqual({ som: 96000, inSc: 0, needsRate: true });
  });

  test('a som sale never needs a rate', () => {
    expect(transferInSaleCurrency(
      onTransfer({ transfer_amount: '400000' }), 'UZS', null,
    )).toEqual({ som: 400000, inSc: 400000, needsRate: false });
  });

  test('no transfer, nothing taken off', () => {
    expect(transferInSaleCurrency(form({ uzs: '1000000' }), 'UZS', RATE))
      .toEqual({ som: 0, inSc: 0, needsRate: false });
    expect(transferInSaleCurrency(onTransfer({ transfer_amount: '' }), 'UZS', RATE))
      .toEqual({ som: 0, inSc: 0, needsRate: false });
  });

  test('the parts add back to the whole on a dollar sale too', () => {
    const dollarSale = {
      ...soumSale, id: 704, selling_price: 20, total_amount: 20, sale_currency: 'USD',
    };
    for (const som of [0, 12000, 96000, 239999, 240000]) {
      const f = onTransfer({ usd: '20', transfer_amount: String(som), sale_currency: 'USD' });
      // To the cent, which is the smallest thing anybody can hand over.
      expect(sentFor(dollarSale, f).usd + som / RATE).toBeCloseTo(20, 2);
    }
  });
});
