/**
 * The price/discount coupling, now shared by the Sotuvlar form and the Kassa till.
 *
 * Worth pinning because the till showed one total and would have charged another: it stored a
 * discount without lowering the price on screen, while `batchItemFromLine` sends the **list**
 * price whenever a discount is present and lets the server subtract.
 */
import { applyListDiscountFinal, batchItemFromLine, repriceBatchLine } from './batchSaleLines';

const line = (over = {}) => ({
  key: 'k',
  product: '7',
  inventory_batch_id: '11',
  quantity: '3',
  list_price: '109.00',
  selling_price: '109.00',
  discount_price: '',
  catalog_price: '109.00',
  packageLines: [],
  ...over,
});

describe('repriceBatchLine', () => {
  test('a discount lowers what is charged, and the list price stays put', () => {
    const next = repriceBatchLine(line(), 'discount_price', '20', 'USD');
    expect(Number(next.selling_price)).toBe(89);
    expect(Number(next.list_price)).toBe(109);
    expect(Number(next.discount_price)).toBe(20);
  });

  test('the screen and the payload agree on what the customer pays', () => {
    const next = repriceBatchLine(line(), 'discount_price', '20', 'USD');
    const shown = Number(next.selling_price) * 3;

    const sent = batchItemFromLine(next, 'USD');
    const charged = (Number(sent.selling_price) - Number(sent.discount_price)) * sent.quantity;

    expect(shown).toBe(267);
    expect(charged).toBe(shown);
  });

  test('typing a price above the list raises the list to meet it, never a negative discount', () => {
    const next = repriceBatchLine(line(), 'selling_price', '130', 'USD');
    expect(Number(next.list_price)).toBe(130);
    expect(next.discount_price).toBe('');
  });

  test('lowering the price by hand records the difference as the discount', () => {
    const next = repriceBatchLine(line(), 'selling_price', '90', 'USD');
    expect(Number(next.discount_price)).toBe(19);
    expect(Number(next.list_price)).toBe(109);
  });

  test('a discount larger than the price floors at zero rather than going negative', () => {
    const next = repriceBatchLine(line(), 'discount_price', '500', 'USD');
    expect(Number(next.selling_price)).toBe(0);
    expect(Number(next.discount_price)).toBe(109);
  });

  test('som is kept whole — the currency has no cents', () => {
    const uzs = line({ list_price: '1200000', selling_price: '1200000', catalog_price: '1200000' });
    const next = repriceBatchLine(uzs, 'discount_price', '150000', 'UZS');
    expect(Number(next.selling_price)).toBe(1050000);
  });

  test('a line with no list price yet takes the typed text as it stands', () => {
    const blank = line({ list_price: '', selling_price: '' });
    expect(repriceBatchLine(blank, 'discount_price', '5', 'USD').discount_price).toBe('5');
    expect(repriceBatchLine(blank, 'selling_price', '5', 'USD').selling_price).toBe('5');
  });

  test('applyListDiscountFinal keeps discount = list − final', () => {
    const r = applyListDiscountFinal(200, 30, null, 'USD');
    expect(Number(r.list_price) - Number(r.selling_price)).toBe(Number(r.discount_price));
  });
});
