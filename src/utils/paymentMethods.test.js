/**
 * Splitting a sale's soum across payment methods.
 *
 * The assertion that matters most is in `what counts as collected`: **a cashier's intention to put
 * money on Click is not money on Click.** Only what the provider says it took counts. Everything
 * else here is arithmetic by comparison.
 */
import {
  cashShare,
  enteredTotal,
  LIVE_METHODS,
  METHODS,
  methodsSettled,
  overAllocated,
  toAmount,
} from './paymentMethods';

describe('cash is what is left over', () => {
  it('starts as the whole amount when nothing else is entered', () => {
    expect(cashShare(1000, {})).toBe(1000);
  });

  it('falls as other methods take their share', () => {
    // The owner's example: 800 posted, 200 on Click, so 600 in notes.
    expect(cashShare(800, { click: 200 })).toBe(600);
  });

  it('counts every method, not just Click', () => {
    expect(cashShare(1000, { click: 200, humo: 300, payme: 100 })).toBe(400);
  });

  it('reaches zero when a sale is paid entirely by other means', () => {
    expect(cashShare(1000, { click: 1000 })).toBe(0);
  });

  it('never goes negative', () => {
    // Typing more into Click than the sale is taking is a mistake to show, not to express as a
    // negative amount of cash owed to the customer.
    expect(cashShare(1000, { click: 1500 })).toBe(0);
  });

  it('treats blanks and nonsense as nothing entered', () => {
    expect(cashShare(1000, { click: '', humo: 'abc', payme: null })).toBe(1000);
    expect(cashShare('', {})).toBe(0);
  });

  it('ignores a negative entry rather than adding it back', () => {
    expect(toAmount(-50)).toBe(0);
    expect(cashShare(1000, { click: -50 })).toBe(1000);
  });
});

describe('spending more than the sale is worth', () => {
  it('is flagged', () => {
    expect(overAllocated(1000, { click: 1200 })).toBe(true);
  });

  it('is not flagged for an exact split', () => {
    expect(overAllocated(1000, { click: 400, humo: 600 })).toBe(false);
  });

  it('tolerates a rounding soum', () => {
    expect(overAllocated(1000, { click: 1000.4 })).toBe(false);
  });
});

describe('what counts as collected', () => {
  it('needs the drawer confirmed when there is cash to collect', () => {
    const base = { uzsPosted: 1000, amounts: {} };
    expect(methodsSettled({ ...base, cashConfirmed: false }).ready).toBe(false);
    expect(methodsSettled({ ...base, cashConfirmed: true }).ready).toBe(true);
  });

  it('does not ask about the drawer when there is no cash in the sale', () => {
    // Entirely on Click: there is nothing in the drawer to look at, so asking would be one press
    // that means nothing.
    expect(methodsSettled({
      uzsPosted: 1000, amounts: { click: 1000 }, clickTakenUzs: 1000,
    }).ready).toBe(true);
  });

  it('refuses to call Click collected on the cashier s word', () => {
    // **The assertion this file exists for.** Typing 200 into the Click box is an intention. If
    // that counted, a sale could be completed — crediting the till with 200 soum — for a payment
    // Click never took.
    const settled = methodsSettled({
      uzsPosted: 1000, amounts: { click: 200 }, cashConfirmed: true, clickTakenUzs: 0,
    });
    expect(settled.ready).toBe(false);
    expect(settled.missing).toContain('click');
  });

  it('accepts Click once the provider has actually taken it', () => {
    expect(methodsSettled({
      uzsPosted: 1000, amounts: { click: 200 }, cashConfirmed: true, clickTakenUzs: 200,
    }).ready).toBe(true);
  });

  it('accepts a part-charge made up by a second charge', () => {
    // Two taps because the customer's balance ran out on the first.
    expect(methodsSettled({
      uzsPosted: 1000, amounts: { click: 500 }, cashConfirmed: true, clickTakenUzs: 500,
    }).ready).toBe(true);
  });

  it('tolerates a sub-soum shortfall from the provider s rounding', () => {
    expect(methodsSettled({
      uzsPosted: 1000, amounts: { click: 200 }, cashConfirmed: true, clickTakenUzs: 199.5,
    }).ready).toBe(true);
  });

  it('is ready at once for a sale with no soum at all', () => {
    // Paid entirely in dollars, which the box at the top of the form handles.
    expect(methodsSettled({ uzsPosted: 0, amounts: {} }).ready).toBe(true);
  });

  it('refuses while more is allocated than the sale takes', () => {
    const settled = methodsSettled({
      uzsPosted: 1000, amounts: { click: 1500 }, cashConfirmed: true, clickTakenUzs: 1500,
    });
    expect(settled.ready).toBe(false);
    expect(settled.missing).toContain('over');
  });

  it('says everything that is missing, not just the first', () => {
    const settled = methodsSettled({
      uzsPosted: 1000, amounts: { click: 200 }, cashConfirmed: false, clickTakenUzs: 0,
    });
    expect(settled.missing).toEqual(expect.arrayContaining(['cash', 'click']));
  });
});

describe('which methods are offered', () => {
  it('shows all five', () => {
    expect(METHODS).toEqual(['cash', 'click', 'payme', 'humo', 'uzcard']);
  });

  it('only lets two of them be used', () => {
    // The other three have no integration. The backend refuses them as well — a greyed button is
    // a courtesy, not a control.
    expect(LIVE_METHODS).toEqual(['cash', 'click']);
  });
});

describe('the entered total', () => {
  it('leaves cash out, because cash is the remainder', () => {
    expect(enteredTotal({ cash: 999, click: 200 })).toBe(200);
  });
});
