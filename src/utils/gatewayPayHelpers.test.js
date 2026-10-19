/**
 * The till's decisions about gateway payments.
 *
 * One of these assertions is worth more than the rest: **an unknown outcome must never offer a
 * retry.** The provider may already have taken the customer's money, and a retry would take it
 * again. Everything else here is bookkeeping by comparison.
 */
import {
  canGiveBack,
  completionBlock,
  failureText,
  heldWithNoSale,
  isPending,
  isRetryable,
  isUsable,
  needsHandResolution,
  newIdempotencyKey,
  nextActionFor,
  statusKey,
  suggestedAmount,
  totalUsable,
  usableRefs,
  withGatewayRefs,
  withGatewayRefsOnEveryLine,
} from './gatewayPayHelpers';

const payment = (over = {}) => ({
  merchant_trans_id: 'GP-0001',
  status: 'paid',
  amount_uzs: '500000.00',
  applied_uzs: '0.00',
  unapplied_uzs: '500000.00',
  consumable: true,
  retryable: false,
  ...over,
});

const paid = (over) => payment(over);
const declined = (over) => payment({
  status: 'failed', consumable: false, retryable: true, unapplied_uzs: '500000.00', ...over,
});
const lost = (over) => payment({
  status: 'unknown', consumable: false, retryable: false, ...over,
});

describe('what counts as money in hand', () => {
  it('trusts the server rather than reading the status itself', () => {
    // Two places forming their own opinion about whether money is in hand is how a till ends up
    // offering a button the server refuses.
    expect(isUsable({ status: 'paid', consumable: false })).toBe(false);
    expect(isUsable({ status: 'something-new', consumable: true })).toBe(true);
  });

  it('counts only usable charges toward the total', () => {
    expect(totalUsable([paid(), declined(), lost()])).toBe(500000);
  });

  it('sends only usable references', () => {
    const refs = usableRefs([
      paid({ merchant_trans_id: 'GP-A' }),
      declined({ merchant_trans_id: 'GP-B' }),
      lost({ merchant_trans_id: 'GP-C' }),
    ]);
    expect(refs).toEqual(['GP-A']);
  });

  it('treats an absent or malformed amount as nothing', () => {
    expect(totalUsable([paid({ unapplied_uzs: null })])).toBe(0);
    expect(totalUsable([paid({ unapplied_uzs: 'abc' })])).toBe(0);
  });
});

describe('a lost reply is not a failure', () => {
  it('never offers a retry after an unknown outcome', () => {
    // The assertion this file exists for.
    expect(isRetryable(lost())).toBe(false);
    expect(nextActionFor(lost())).toBe('check');
  });

  it('offers a retry after an explicit decline', () => {
    expect(isRetryable(declined())).toBe(true);
    expect(nextActionFor(declined())).toBe('retry');
  });

  it('treats a charge still in flight as pending, not failed', () => {
    // `reversing` is in this list because a reversal is mid-flight on it: completing a sale
    // against a charge Click is in the middle of giving back books revenue twice over.
    for (const status of [
      'created', 'sending', 'authorized', 'confirming', 'unknown', 'reversing',
    ]) {
      expect(isPending({ status })).toBe(true);
      expect(nextActionFor({ status })).toBe('check');
    }
  });

  it('offers nothing further once a charge is usable', () => {
    expect(nextActionFor(paid())).toBe('none');
  });

  it('offers a charge when there is nothing yet', () => {
    expect(nextActionFor(null)).toBe('charge');
  });
});

describe('which stuck charges a person has to resolve by hand', () => {
  // Click Pass answers `-404` to a lookup by our own reference, even for a payment that definitely
  // succeeded. So a charge we never got Click's id for cannot be resolved by asking, however many
  // times anybody presses the button -- and it goes on blocking its sale until a person reads the
  // id out of the Click cabinet. This is the test that keeps the two cases apart.
  it('needs a hand only when Click never gave us an id', () => {
    expect(needsHandResolution({ status: 'unknown', provider_payment_id: '' })).toBe(true);
    expect(needsHandResolution({ status: 'needs_check' })).toBe(true);
  });

  it('does not ask for an id we already have', () => {
    // Offering the box here would invite somebody to type over an answer Click has already given,
    // and point every later reversal at the wrong payment.
    expect(needsHandResolution({ status: 'unknown', provider_payment_id: '5353104348' }))
      .toBe(false);
  });

  it('does not offer it for a settled charge', () => {
    for (const status of ['paid', 'failed', 'applied', 'owed', 'reversed']) {
      expect(needsHandResolution({ status, provider_payment_id: '' })).toBe(false);
    }
  });

  it('treats whitespace as no id at all', () => {
    expect(needsHandResolution({ status: 'unknown', provider_payment_id: '   ' })).toBe(true);
  });
});

describe('whether the sale may be completed', () => {
  it('is blocked while any charge is unresolved', () => {
    // Completing against a charge that may not have succeeded credits the till with money the shop
    // might not have, and every report downstream believes it.
    const block = completionBlock([paid(), lost()]);
    expect(block.blocked).toBe(true);
    expect(block.count).toBe(1);
  });

  it('is allowed when every charge has settled', () => {
    expect(completionBlock([paid(), declined()]).blocked).toBe(false);
  });

  it('is allowed when there are no charges at all', () => {
    // An ordinary cash sale must not be held up by this.
    expect(completionBlock([]).blocked).toBe(false);
    expect(completionBlock().blocked).toBe(false);
  });

  it('is blocked by a charge mid-capture', () => {
    expect(completionBlock([payment({
      status: 'confirming', consumable: false, retryable: false,
    })]).blocked).toBe(true);
  });
});

describe('what to suggest charging', () => {
  it('suggests what is still owed', () => {
    expect(suggestedAmount(1234567, [])).toBe(1234567);
  });

  it('subtracts what gateways already hold', () => {
    expect(suggestedAmount(1234567, [paid({ unapplied_uzs: '234567' })])).toBe(1000000);
  });

  it('suggests nothing once the sale is covered', () => {
    expect(suggestedAmount(500000, [paid({ unapplied_uzs: '500000' })])).toBe(0);
    expect(suggestedAmount(500000, [paid({ unapplied_uzs: '900000' })])).toBe(0);
  });

  it('suggests nothing for a sale that owes nothing', () => {
    expect(suggestedAmount(0, [])).toBe(0);
    expect(suggestedAmount(null, [])).toBe(0);
    expect(suggestedAmount('abc', [])).toBe(0);
  });

  it('ignores declined and unresolved charges when suggesting', () => {
    // A declined charge took nothing, so the full amount is still owed. An unresolved one is not
    // money in hand either -- treating it as paid would under-charge the customer.
    expect(suggestedAmount(500000, [declined(), lost()])).toBe(500000);
  });
});

describe('the idempotency key', () => {
  it('is different every time', () => {
    const keys = new Set(Array.from({ length: 200 }, newIdempotencyKey));
    expect(keys.size).toBe(200);
  });

  it('fits the column and carries no punctuation', () => {
    const key = newIdempotencyKey();
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe('attaching references to a completion', () => {
  it('sends references and never an amount', () => {
    // A `uzs_card` figure from here would be folded straight back into cash by the server's
    // sanitiser. The server moves the slice itself, from charges it made.
    const data = withGatewayRefs({ status: 'completed', uzs: 500000 }, [paid()]);
    expect(data.gateway_payment_refs).toEqual(['GP-0001']);
    expect(data).not.toHaveProperty('uzs_card');
  });

  it('leaves a cash-only completion untouched', () => {
    const original = { status: 'completed', uzs: 500000 };
    expect(withGatewayRefs(original, [])).toBe(original);
    expect(withGatewayRefs(original, [declined()])).toBe(original);
  });

  it('does not mutate what it was given', () => {
    const original = { status: 'completed' };
    withGatewayRefs(original, [paid()]);
    expect(original).not.toHaveProperty('gateway_payment_refs');
  });

  it('puts the full list on every line of a basket', () => {
    // Each line carries the whole list rather than a share: the server consumes greedily under a
    // lock, so no arithmetic happens here that could disagree with it.
    const requests = [
      { id: 1, data: { status: 'completed', uzs: 400000 } },
      { id: 2, data: { status: 'completed', uzs: 400000 } },
      { id: 3, data: { status: 'completed', uzs: 434567 } },
    ];
    const out = withGatewayRefsOnEveryLine(requests, [paid({ merchant_trans_id: 'GP-X' })]);
    expect(out.map((r) => r.data.gateway_payment_refs)).toEqual([
      ['GP-X'], ['GP-X'], ['GP-X'],
    ]);
  });

  it('leaves the existing split alone', () => {
    const requests = [{ id: 1, data: { uzs: 400000 } }, { id: 2, data: { uzs: 834567 } }];
    const out = withGatewayRefsOnEveryLine(requests, [paid()]);
    expect(out.map((r) => r.data.uzs)).toEqual([400000, 834567]);
  });

  it('leaves a cash-only basket untouched', () => {
    const requests = [{ id: 1, data: { uzs: 1 } }];
    expect(withGatewayRefsOnEveryLine(requests, [])).toBe(requests);
  });
});

describe('telling the cashier why a charge failed', () => {
  // Click answers in Russian; the till is in Uzbek. The commonest decline of all is "the card has
  // no money", where the next step is obvious *once it can be read* -- so showing only Click's
  // wording hid the one line that mattered. `t` is faked as the identity on the key, so these
  // assert which source won rather than any particular wording.
  const t = (key) => `T:${key}`;

  it('uses our own wording for a code we recognise', () => {
    const { text } = failureText({ failure_code: '-5024', failure_message: 'rus text' }, t);
    expect(text).toBe('T:gateway.failInsufficientFunds');
  });

  it("keeps Click's wording alongside, not instead", () => {
    // It is more specific than anything we can write, and a cashier may have to read it back to
    // the customer or to Click's support.
    const { note } = failureText({ failure_code: '-5024', failure_message: 'rus text' }, t);
    expect(note).toBe('rus text');
  });

  it("falls back to Click's wording for a code we do not know", () => {
    const { text, note } = failureText({ failure_code: '-9999', failure_message: 'rus text' }, t);
    expect(text).toBe('rus text');
    expect(note).toBe('');
  });

  it('always says something, even with nothing to go on', () => {
    expect(failureText({}, t).text).toBe('T:gateway.declinedBody');
    expect(failureText(null, t).text).toBe('T:gateway.declinedBody');
  });

  it('does not repeat itself when both sources agree', () => {
    const { note } = failureText(
      { failure_code: '-5024', failure_message: 'T:gateway.failInsufficientFunds' }, t,
    );
    expect(note).toBe('');
  });

  it('explains a charge closed by hand', () => {
    // Ours, not Click's: this code is written by the no-record path, so the page must not present
    // it as something the provider said.
    expect(failureText({ failure_code: 'no_record' }, t).text)
      .toBe('T:gateway.failNoRecord');
  });
});

describe('how a charge reads on screen', () => {
  it('returns a key per state rather than a sentence', () => {
    expect(statusKey(paid())).toBe('gateway.statePaid');
    expect(statusKey(declined())).toBe('gateway.stateFailed');
    expect(statusKey(lost())).toBe('gateway.statePending');
    expect(statusKey(payment({ status: 'owed', consumable: false }))).toBe('gateway.stateOwed');
    expect(statusKey(payment({ status: 'reversed', consumable: false })))
      .toBe('gateway.stateReversed');
  });
});

describe('whether to offer giving a charge back', () => {
  // The costly mistake this guards: offering to reverse money a sale has already taken. Past that
  // line the money is revenue, and handing it back means unwinding a sale.
  it('offers it for a confirmed charge nobody has used', () => {
    expect(canGiveBack(paid())).toBe(true);
  });

  it('offers it for money owed back after a cancellation', () => {
    expect(canGiveBack(payment({
      status: 'owed', consumable: false, unapplied_uzs: '500000', applied_uzs: '0',
    }))).toBe(true);
  });

  it('refuses once a sale has taken any of it', () => {
    expect(canGiveBack(payment({
      status: 'paid', applied_uzs: '1', unapplied_uzs: '499999',
    }))).toBe(false);
  });

  it('refuses a fully used charge', () => {
    expect(canGiveBack(payment({
      status: 'applied', applied_uzs: '500000', unapplied_uzs: '0', consumable: false,
    }))).toBe(false);
  });

  it('refuses a charge whose outcome is unclear', () => {
    // Reversing it would tell the shop it had given back money that may never have been taken.
    expect(canGiveBack(lost())).toBe(false);
  });

  it('refuses a declined charge', () => {
    expect(canGiveBack(declined())).toBe(false);
  });

  it('refuses one already reversed', () => {
    expect(canGiveBack(payment({
      status: 'reversed', consumable: false, unapplied_uzs: '500000',
    }))).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(canGiveBack(null)).toBe(false);
    expect(canGiveBack(undefined)).toBe(false);
  });
});

describe('money held with no sale', () => {
  it('is the reason the page exists, so it is counted plainly', () => {
    expect(heldWithNoSale([
      paid({ unapplied_uzs: '500000' }),
      paid({ unapplied_uzs: '234567' }),
      declined(),
      lost(),
    ])).toBe(734567);
  });

  it('is nothing when every charge has been used', () => {
    expect(heldWithNoSale([paid({ unapplied_uzs: '0' })])).toBe(0);
  });

  it('is nothing for an empty list', () => {
    expect(heldWithNoSale([])).toBe(0);
    expect(heldWithNoSale()).toBe(0);
  });

  it('does not count an unresolved charge as money in hand', () => {
    // It may not have been taken at all. Counting it would overstate what the shop holds.
    expect(heldWithNoSale([lost({ unapplied_uzs: '500000' })])).toBe(0);
  });
});
