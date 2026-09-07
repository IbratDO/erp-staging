/**
 * When the "Chek" button appears on a sale row.
 *
 * A group row is built by spreading its **first** line — `buildCombinedSaleForGroup` does
 * `{...first}` — so every field the button reads off that row belongs to one line rather than to
 * the purchase. Sales #427-429 were a three-item shop sale where the first item had been
 * returned: the row inherited `returned`, the button vanished, and the other two items were still
 * perfectly printable with the customer at the counter asking for the receipt.
 *
 * So the question is asked of the whole purchase. The rule extracted here is the one the page
 * uses, tested directly rather than through the row, because the bug was never in the rendering —
 * it was in reading one line's status as though it described three.
 */
import { canPrintReceiptFor } from './receiptButton';

const line = (over = {}) => ({
  id: 427, status: 'completed', sale_type: 'bought_from_shop', ...over,
});

describe('a single sale', () => {
  it('can print when it is a completed shop sale', () => {
    expect(canPrintReceiptFor(line())).toBe(true);
  });

  it('cannot before it is completed', () => {
    expect(canPrintReceiptFor(line({ status: 'pending' }))).toBe(false);
  });

  it('cannot once it has been returned', () => {
    expect(canPrintReceiptFor(line({ status: 'returned' }))).toBe(false);
  });

  it('cannot for a delivery, which is settled at the door', () => {
    expect(canPrintReceiptFor(line({ sale_type: 'delivery' }))).toBe(false);
  });

  it.each([[null], [undefined]])('survives %j', (sale) => {
    expect(canPrintReceiptFor(sale)).toBe(false);
  });
});

describe('a group', () => {
  it('can print when one line was returned and others were not', () => {
    // The exact shape of #427-429: the first line returned, two still completed.
    const group = [
      line({ id: 427, status: 'returned' }),
      line({ id: 428 }),
      line({ id: 429 }),
    ];
    expect(canPrintReceiptFor(group[0], group)).toBe(true);
  });

  it('does not depend on which line the row happens to carry', () => {
    // The row spreads whichever line sorts first, and that must not decide the answer.
    const group = [line({ id: 427, status: 'returned' }), line({ id: 428 })];
    expect(canPrintReceiptFor(group[0], group))
      .toBe(canPrintReceiptFor(group[1], group));
  });

  it('cannot print when every line has been returned', () => {
    // Nothing left the server would accept: the receipt endpoint refuses a sale that is not
    // completed, so offering the button would only produce an error.
    const group = [
      line({ id: 427, status: 'returned' }),
      line({ id: 428, status: 'returned' }),
    ];
    expect(canPrintReceiptFor(group[0], group)).toBe(false);
  });

  it('cannot print a group of deliveries', () => {
    const group = [line({ sale_type: 'delivery' }), line({ id: 428, sale_type: 'delivery' })];
    expect(canPrintReceiptFor(group[0], group)).toBe(false);
  });

  it('ignores a malformed line rather than throwing', () => {
    expect(() => canPrintReceiptFor(line(), [null, undefined, line()])).not.toThrow();
  });

  it('falls back to the row itself when the group is empty', () => {
    expect(canPrintReceiptFor(line(), [])).toBe(true);
  });
});
