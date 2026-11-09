/**
 * To'lovlar nazorati — Perechisleniye: the arithmetic and the refusals, kept out of the page.
 *
 * Everything here is pure, and it is here rather than inline in the component for one reason:
 * **these are the rules the server enforces, mirrored.** The server owns the final answer — every
 * one of these refusals exists there too, inside the transaction that does the writing — and this
 * copy exists so an accountant is told what is wrong before they press the button rather than
 * after. A mirror that drifts is worse than no mirror, so each rule below names the server
 * function that is the real gate.
 *
 * The rule the whole module turns on: **a transfer arrives in whole som.** The owner's rule for
 * the UZS ledger, and it lives in three layers on purpose — the input mask, this, and the ledger
 * write. A rule fixed in one layer usually lives in three more.
 */

/** Numbers come off the API as strings, because they are decimals with twelve places. */
export const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** Closed rows turn green and offer nothing further. Mirrors `refresh_transfer_status`. */
export const isClosed = (row) => ['paid', 'waived'].includes(row?.status);

export const remainingOf = (row) => num(row?.remaining_amount);
export const receivedOf = (row) => num(row?.received_amount);

/**
 * The largest whole-som receipt the server will accept.
 *
 * **Rounded up, and that is the one place anything here rounds that way.** The principal is a
 * residual carried to twelve decimals, so an expectation can be 999,999.9966 som while a transfer
 * arrives in whole som. Refusing 1,000,000 against it would leave a row no payment anybody can
 * send will ever close. Mirrors `transfer_sale_utils._ceil_som`.
 */
export const receiptCeiling = (row) => Math.ceil(remainingOf(row));

/**
 * Why this receipt cannot be recorded, as a message key plus its values, or `null`.
 *
 * Returns a key rather than a sentence so the page stays translatable, and one refusal at a time
 * in the order somebody fills the form in — telling them the amount is too big before they have
 * finished typing it is how a form comes to feel like it is arguing.
 */
export function receiptRefusal(row, { amount, valueDate } = {}, today = new Date()) {
  if (isClosed(row)) return { key: 'transfers.errClosed' };

  const raw = String(amount ?? '').trim();
  if (!raw) return { key: 'transfers.errAmountRequired' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { key: 'transfers.errAmountNumber' };
  if (value <= 0) return { key: 'transfers.errAmountPositive' };
  // Whole som. Compared against the rounded value rather than with `% 1`, which is unreliable on
  // a float the size of a som figure.
  if (Math.abs(value - Math.round(value)) > 1e-9) return { key: 'transfers.errWholeSom' };

  const ceiling = receiptCeiling(row);
  if (value > ceiling) {
    return { key: 'transfers.errExceeds', values: { amount: ceiling } };
  }

  if (valueDate) {
    // Compared as text, so a browser in one timezone and a server in another cannot disagree
    // about which day it is — both sides are an ISO date, and the server's own check is the gate.
    const typed = String(valueDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(typed)) return { key: 'transfers.errDateUnreadable' };
    if (typed > isoDate(today)) return { key: 'transfers.errDateFuture' };
  }
  return null;
}

/** Today as the server writes it. Local, not UTC: `toISOString` is a day out after 19:00 here. */
export function isoDate(when = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/**
 * Whether this history line may be corrected.
 *
 * Mirrors `reverse_transfer_receipt`: a correction cannot itself be corrected, and a receipt
 * already cancelled cannot be cancelled twice. Both are refused by the server as well; this is
 * what decides whether the button is there to press.
 */
export const canCorrect = (line) =>
  !!line && !line.is_correction && !line.reversed_by && num(line.amount) > 0;

/** Why a correction cannot be submitted, or `null`. The reason is mandatory, as on the server. */
export function correctionRefusal(line, reason) {
  if (!canCorrect(line)) return { key: 'transfers.errNotCorrectable' };
  if (!String(reason ?? '').trim()) return { key: 'transfers.errReasonRequired' };
  return null;
}

/**
 * The row's colour band. A fully received record turns green and offers nothing further — the
 * owner asked for that outright, and it is the page's only use of colour as information.
 */
export function rowTone(row) {
  if (row?.status === 'paid') return 'paid';
  if (row?.status === 'waived') return 'waived';
  if (receivedOf(row) > 0) return 'partial';
  return 'awaiting';
}

/**
 * What the table's foot says: the three figures somebody came to this page to see.
 *
 * Summed over the rows on screen rather than fetched, so the total always agrees with what is
 * visible — a filtered table whose total described the unfiltered set would be read as a bug.
 */
export function totals(rows = []) {
  return rows.reduce(
    (acc, row) => ({
      expected: acc.expected + num(row.principal_amount),
      received: acc.received + receivedOf(row),
      remaining: acc.remaining + remainingOf(row),
    }),
    { expected: 0, received: 0, remaining: 0 },
  );
}
