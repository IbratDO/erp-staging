/**
 * The decisions the till makes about gateway payments, kept out of the component.
 *
 * Nothing here talks to the network or touches the DOM, because the costly mistakes in this part of
 * the flow are judgement calls, not rendering: which charges count as money in hand, whether
 * Yakunlash may be pressed, and — the expensive one — whether a cashier is offered another charge
 * after one that may already have taken the customer's money.
 *
 * **The server decides, this agrees.** `consumable` and `retryable` arrive on each payment from the
 * API rather than being inferred from a status string here. Two places forming their own opinion
 * about whether money is in hand is how a till ends up offering a button the server refuses.
 */

/** A charge whose money a sale may take. */
export const isUsable = (payment) => !!payment?.consumable;

/** A charge the provider explicitly declined, so charging again is safe. */
export const isRetryable = (payment) => !!payment?.retryable;

/**
 * A charge still in flight, or whose outcome nobody knows yet.
 *
 * The important half is `unknown`: the provider may already have taken the money, so this is **not**
 * a failure and must never offer a retry. It is why `retryable` is a separate question from "did it
 * not succeed".
 */
export const isPending = (payment) => {
  const status = payment?.status;
  return status === 'created' || status === 'sending' || status === 'authorized'
    || status === 'confirming' || status === 'unknown' || status === 'reversing';
};

/**
 * Whether this charge can only be settled by a person supplying Click's id.
 *
 * **The distinction the page turns on.** A stuck charge we *have* Click's id for is resolvable by
 * asking -- that lookup works. One we have no id for is not: Click Pass answers `-404` to a lookup
 * by our own reference, so no amount of asking will ever move the row, and it goes on blocking the
 * sale it is attached to. Only those rows get the "enter the id" box, because offering it where
 * asking would do invites typing over an answer Click has already given.
 */
export const needsHandResolution = (payment) => (
  (isPending(payment) || payment?.status === 'needs_check')
  && !String(payment?.provider_payment_id || '').trim()
);

/** Soum this charge can still give a sale. */
export const unapplied = (payment) => {
  const value = parseFloat(payment?.unapplied_uzs);
  return Number.isFinite(value) ? value : 0;
};

/** Soum the shop is holding across every usable charge. */
export const totalUsable = (payments = []) =>
  payments.filter(isUsable).reduce((sum, p) => sum + unapplied(p), 0);

/** The references a completion should send. */
export const usableRefs = (payments = []) =>
  payments.filter(isUsable).map((p) => p.merchant_trans_id);

/**
 * Whether the sale may be completed yet, and if not, why.
 *
 * **Yakunlash is withheld while any charge is unresolved**, which is the whole point: completing a
 * sale against a charge that may not have succeeded credits the till with money the shop might not
 * have, and every report downstream believes it. The opposite failure — the provider paid and the
 * sale is still open — is visible, blocks nothing and is recoverable from the needs-check list.
 */
export const completionBlock = (payments = []) => {
  const pending = payments.filter(isPending);
  if (pending.length) {
    return { blocked: true, reason: 'pending', count: pending.length };
  }
  return { blocked: false };
};

/**
 * What the Click button should offer next for a finished charge.
 *
 * `retry` only ever follows an explicit decline. After an unknown outcome the only safe offer is to
 * ask the provider again — charging again could take the money twice.
 */
export const nextActionFor = (payment) => {
  if (!payment) return 'charge';
  if (isUsable(payment)) return 'none';
  if (isRetryable(payment)) return 'retry';
  if (isPending(payment)) return 'check';
  return 'charge';
};

/**
 * The amount to suggest for a new charge: whatever is still owed, less what gateways already hold.
 *
 * Suggested, never imposed — the box stays editable so part of a sale can be paid by Click and the
 * rest in cash.
 */
export const suggestedAmount = (dueUzs, payments = []) => {
  const due = parseFloat(dueUzs);
  if (!Number.isFinite(due) || due <= 0) return 0;
  const held = totalUsable(payments);
  const remaining = due - held;
  return remaining > 0 ? Math.round(remaining) : 0;
};

/**
 * A fresh idempotency key.
 *
 * **One per button press, minted by the client and held until a terminal reply.** A key generated
 * per request instead would make every retry a new charge, which is precisely what the key exists
 * to prevent. `crypto.randomUUID` where it exists; the fallback is only for older browsers and does
 * not need to be cryptographically strong — it needs to be unique.
 */
export const newIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/**
 * Add the gateway references to a completion request.
 *
 * Only the references travel — never an amount. The server moves the matching slice from the cash
 * leg to the card leg itself, from charges it made and recorded; a `uzs_card` figure sent from here
 * would be folded straight back into cash by the sanitiser.
 */
export const withGatewayRefs = (requestData, payments = []) => {
  const refs = usableRefs(payments);
  if (!refs.length) return requestData;
  return { ...requestData, gateway_payment_refs: refs };
};

/**
 * The same, for every line of a basket.
 *
 * Each line carries the full list rather than a share. The server consumes greedily under a lock,
 * so no arithmetic happens in the browser that could disagree with it — and the existing
 * `buildGroupCompleteRequests` splitter is left exactly as it was.
 */
export const withGatewayRefsOnEveryLine = (requests = [], payments = []) => {
  const refs = usableRefs(payments);
  if (!refs.length) return requests;
  return requests.map((req) => ({ ...req, data: { ...req.data, gateway_payment_refs: refs } }));
};

/**
 * Whether the needs-check page should offer to give a charge back.
 *
 * **Only for a charge no sale has taken a single soum of.** Past that line the money is revenue and
 * handing it back means unwinding a sale, stock and profit included — that is the Returns workflow,
 * not a button on this page. The server refuses it either way; this exists so the button does not
 * lie about what is available.
 *
 * Deliberately stricter than "is anything unused": a charge that is part-applied has money on both
 * sides of that line, and the safe answer for it is to leave it to Returns rather than to reverse
 * the remainder and leave the sale holding the difference.
 */
export const canGiveBack = (payment) => {
  if (!payment) return false;
  if (payment.status !== 'paid' && payment.status !== 'owed') return false;
  const applied = parseFloat(payment.applied_uzs);
  if (Number.isFinite(applied) && applied > 0) return false;
  return unapplied(payment) > 0;
};

/** Money the shop is holding that no sale has recorded — the reason the page exists. */
export const heldWithNoSale = (payments = []) =>
  payments
    .filter((p) => isUsable(p) && unapplied(p) > 0)
    .reduce((sum, p) => sum + unapplied(p), 0);

/** How a charge should read on screen, as a translation key rather than a sentence. */
export const statusKey = (payment) => {
  if (isUsable(payment)) return 'gateway.statePaid';
  if (isRetryable(payment)) return 'gateway.stateFailed';
  if (isPending(payment)) return 'gateway.statePending';
  if (payment?.status === 'owed') return 'gateway.stateOwed';
  if (payment?.status === 'reversed') return 'gateway.stateReversed';
  return 'gateway.stateUnknown';
};

/**
 * Our own sentence for a failure code we recognise, as a translation key.
 *
 * Keyed on `failure_code`, which the server copies from the provider, rather than on the message
 * text -- matching on a provider's prose would break the first time they reword it, and it is in a
 * language this file has no business parsing.
 *
 * Deliberately short. A code earns a line here only when we know what it means and what the
 * cashier should do about it; everything else falls back to Click's own words, which are better
 * than a guess.
 */
export const FAILURE_MESSAGE_KEYS = {
  // Seen live: a real card with nothing on it. The commonest decline there is, and the one where
  // the right next action is obvious and worth printing.
  '-5024': 'gateway.failInsufficientFunds',
  // The request-level rejections from `errors.py`. None of these can leave a charge behind.
  '-1': 'gateway.failSignature',
  '-2': 'gateway.failAmount',
  '-3': 'gateway.failService',
  '-8': 'gateway.failRequest',
  // Ours, not Click's: a charge closed by hand because the cabinet had no record of it.
  no_record: 'gateway.failNoRecord',
};

/** The translation key for this charge's failure, or '' when we have nothing better than Click. */
export const failureKey = (payment) => (
  FAILURE_MESSAGE_KEYS[String(payment?.failure_code ?? '').trim()] || ''
);

/** Click's own wording, trimmed. Shown alongside ours, never parsed. */
export const providerNote = (payment) => String(payment?.failure_message || '').trim();

/**
 * What to put on screen for a failed or stuck charge, given a `t`.
 *
 * Returns `{ text, note }`: `text` is always something a person can read, and `note` is Click's
 * wording when it adds anything beyond `text`. Kept here rather than in a component so the
 * precedence is tested once instead of re-decided on each screen.
 */
export const failureText = (payment, t, fallbackKey = 'gateway.declinedBody') => {
  const key = failureKey(payment);
  const note = providerNote(payment);
  if (key) {
    const text = t(key);
    return { text, note: note && note !== text ? note : '' };
  }
  return { text: note || t(fallbackKey), note: '' };
};
