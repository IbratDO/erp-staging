/**
 * Turning a basket line into what `batch_create` wants.
 *
 * Shared by the Sotuvlar modal and the Kassa till, and extracted the moment the till was written,
 * because the price rule is not obvious and getting it wrong loses money quietly.
 *
 * The server stores the price and the discount separately and computes
 * `effective = selling_price - discount_price`. So the figure sent has to be the **list** price
 * whenever there is a discount. The till's first draft sent the already-reduced price *and* the
 * discount, which takes it off twice: a 240 item with 20 off would have been created as 200 while
 * the customer was charged 220, and the gap would have turned up later as a payment nobody could
 * reconcile.
 */
import { batchItemFromLine } from './batchSaleLines';

const line = (over = {}) => ({
  product: '7', quantity: '2', layer: '41', inventory_batch_id: '41',
  list_price: '240', selling_price: '240', discount_price: '', ...over,
});

describe('the price sent to the server', () => {
  it('is the line price when nothing was taken off', () => {
    expect(batchItemFromLine(line(), 'USD').selling_price).toBe('240.00');
  });

  it('is the LIST price when a discount is present, never the reduced one', () => {
    // The one that matters. `selling_price` on the line is already 220 here.
    const row = batchItemFromLine(
      line({ list_price: '240', selling_price: '220', discount_price: '20' }), 'USD',
    );
    expect(row.selling_price).toBe('240.00');
    expect(row.discount_price).toBe('20');
  });

  it('sends no discount field at all when there is none', () => {
    // A zero would still be a discount as far as the row is concerned.
    expect(batchItemFromLine(line(), 'USD')).not.toHaveProperty('discount_price');
  });

  it('leaves the two figures able to reconstruct what the customer pays', () => {
    const row = batchItemFromLine(
      line({ list_price: '240', selling_price: '220', discount_price: '20' }), 'USD',
    );
    expect(Number(row.selling_price) - Number(row.discount_price)).toBe(220);
  });
});

describe('rounding to what the currency can express', () => {
  it('gives dollars two decimals', () => {
    expect(batchItemFromLine(line({ selling_price: '240.5' }), 'USD').selling_price).toBe('240.50');
  });

  it('gives som whole numbers, because nobody hands over a fraction of one', () => {
    expect(batchItemFromLine(line({ selling_price: '1356425.4' }), 'UZS').selling_price)
      .toBe('1356425');
  });
});

describe('the rest of the row', () => {
  it('carries the layer the operator picked', () => {
    // So the sale comes off that FIFO batch rather than whichever the server would choose.
    expect(batchItemFromLine(line(), 'USD').inventory_batch_id).toBe(41);
  });

  it('omits the layer when none was chosen', () => {
    expect(batchItemFromLine(line({ inventory_batch_id: '' }), 'USD'))
      .not.toHaveProperty('inventory_batch_id');
  });

  it('sends the quantity as a number, defaulting to one', () => {
    expect(batchItemFromLine(line({ quantity: '3' }), 'USD').quantity).toBe(3);
    expect(batchItemFromLine(line({ quantity: '' }), 'USD').quantity).toBe(1);
  });

  it('falls back to the raw price when it cannot be parsed', () => {
    // Rather than sending NaN, which the server would reject with nothing useful to say.
    expect(batchItemFromLine(line({ selling_price: 'abc', list_price: '' }), 'USD').selling_price)
      .toBe('abc');
  });
});

describe('packaging', () => {
  it('travels with the line it belongs to', () => {
    // A caller that forgot this sent a sale whose boxes never left the store room — after the
    // basket had already passed its packaging stock check.
    const row = batchItemFromLine(
      line({ packageLines: [{ package_type: 'M', quantity: 2 }] }), 'USD',
    );
    expect(row.package_lines).toEqual([{ package_type: 'M', quantity: 2 }]);
  });

  it('leaves out rows with no type or no quantity', () => {
    const row = batchItemFromLine(line({
      packageLines: [{ package_type: '', quantity: 2 }, { package_type: 'M', quantity: 0 }],
    }), 'USD');
    expect(row).not.toHaveProperty('package_lines');
  });

  it('sends no field at all when there is no packaging', () => {
    expect(batchItemFromLine(line(), 'USD')).not.toHaveProperty('package_lines');
  });
});
