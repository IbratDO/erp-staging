/**
 * Splitting one sale's soum across the ways it can be paid.
 *
 * The till used to ask for two numbers — soum and dollars — and assume every soum was cash. The
 * counter does not work that way: part of a sale goes on Click, part in notes, and a cashier needs
 * to see those as separate amounts that add up.
 *
 * **Cash is the remainder, never a number anybody types.** Every other method is entered
 * deliberately; what is left over is what the drawer must receive. Making cash derived rather than
 * typed removes the whole class of mistakes where the parts do not add up to the total — there is
 * no second number to disagree with.
 *
 * Soum only. Dollars stay in their own box at the top of the form, because a five-method split
 * across two currencies is a different and much larger problem, and nothing at the counter needs it.
 */

/** Every method the till shows, in the order it shows them. */
export const METHODS = ['cash', 'click', 'payme', 'humo', 'uzcard'];

/**
 * The ones that actually work.
 *
 * `payme`, `humo` and `uzcard` are shown so staff know they are coming and disabled so nobody
 * waits for one to work. The backend refuses them too — a greyed button is a courtesy, not a
 * control.
 */
export const LIVE_METHODS = ['cash', 'click'];

/**
 * The columns the till shows, in order.
 *
 * Dollar cash sits beside soum cash rather than at the end: they are the same act — counting what
 * is in the drawer — and a cashier checking the drawer checks both at once.
 *
 * Separate from `METHODS` because that list is the **soum** arithmetic, and dollars take no part in
 * it. Adding `cash_usd` there would have it subtracted from the soum cash figure, which is how a
 * sale paid 40 dollars and 600 soum would start claiming the drawer owed 560.
 */
export const ROW_METHODS = ['cash', 'cash_usd', 'click', 'payme', 'humo', 'uzcard'];

/** Methods other than cash, which is the remainder rather than an entry. */
export const ENTERED_METHODS = METHODS.filter((m) => m !== 'cash');

/** A number, or zero. Blank, nonsense and negatives are all "nothing entered". */
export const toAmount = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** What has been put on methods other than cash. */
export const enteredTotal = (amounts = {}) => ENTERED_METHODS
  .reduce((sum, method) => sum + toAmount(amounts[method]), 0);

/**
 * What the drawer is left to collect.
 *
 * Never below zero: typing more into Click than the sale is taking is a mistake to be *shown*
 * (see `overAllocated`), not one to be expressed as a negative amount of cash.
 */
export const cashShare = (uzsPosted, amounts = {}) => Math.max(
  0, toAmount(uzsPosted) - enteredTotal(amounts),
);

/** Whether the methods have been given more than the sale is taking. */
export const overAllocated = (uzsPosted, amounts = {}) => (
  enteredTotal(amounts) > toAmount(uzsPosted) + 0.5
);

// What separates the thousands. Named so the two places that care -- the one that inserts it and
// the one that strips it again -- cannot drift apart.
export const GROUP_SEPARATOR = '\u00a0';

/**
 * `400000` as `400 000`.
 *
 * A space, not a comma: a comma is a decimal point to half the people who will read this screen,
 * and "400,000" could be four hundred thousand soum or four hundred. The receipt already groups
 * this way, so the window and the paper agree.
 */
export const formatGrouped = (value, decimals = 0) => {
  const n = typeof value === 'number' ? value : parseFloat(parseGrouped(value));
  if (!Number.isFinite(n)) return '';
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  // A non-breaking space, so a figure never wraps across two lines in the middle of a number.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  return n < 0 ? `-${body}` : body;
};

/**
 * Back to a plain number string, for anything that has to do arithmetic on it.
 *
 * Takes the spaces out, and the non-breaking ones `formatGrouped` puts in — a normal space and a
 * non-breaking space look identical and are different characters, so stripping only one of them
 * leaves a value that silently parses as `NaN`.
 */
export const parseGrouped = (text) => String(text ?? '')
  .replace(/[\s\u00a0]/g, '')
  .replace(/[^0-9.]/g, '');

/**
 * Whether every part of the soum has actually been collected.
 *
 * The question behind enabling **Sotuvni yakunlash**. Each part is answered by a different kind of
 * evidence, and that difference is the point:
 *
 * * **cash** is confirmed by a person — they looked in the drawer and pressed the button;
 * * **Click** is confirmed by Click. What the cashier *intended* to put on Click counts for
 *   nothing; `clickTakenUzs` is money the provider says it took.
 *
 * A sale with no soum on it at all — paid entirely in dollars — is ready immediately, because
 * there is nothing here to collect.
 */
export const methodsSettled = ({
  uzsPosted = 0, amounts = {}, cashConfirmed = false, clickTakenUzs = 0,
  usdPosted = 0, usdCashConfirmed = false,
} = {}) => {
  const missing = [];
  if (overAllocated(uzsPosted, amounts)) missing.push('over');

  const cash = cashShare(uzsPosted, amounts);
  if (cash > 0 && !cashConfirmed) missing.push('cash');

  // Dollars are only ever taken in cash, so there is nothing to split -- but the notes still have
  // to be counted, and soum and dollars are counted separately in the drawer. One tick covering
  // both would say somebody had checked a currency they never looked at.
  if (toAmount(usdPosted) > 0 && !usdCashConfirmed) missing.push('cash_usd');

  // A soum of slack: the amount is entered in whole soum and the provider reports decimals.
  const clickWanted = toAmount(amounts.click);
  if (clickWanted > 0 && toAmount(clickTakenUzs) + 1 < clickWanted) missing.push('click');

  return { ready: missing.length === 0, missing };
};
