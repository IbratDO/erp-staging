/**
 * The checks that stop a basket reaching the server in a state it will reject.
 *
 * Shared by the Sotuvlar modal and the Kassa till, and tested here because the failure they
 * prevent is the expensive one: twenty boxes scanned, one line short, and the whole basket
 * refused at submit with the customer waiting.
 *
 * The order matters and is asserted. A layer being short is checked before the product being
 * short, because a basket can ask for more of one FIFO batch than it holds while the product as a
 * whole has plenty — the server checks the batch, so a check that only looked at the product would
 * pass here and fail there.
 */
import { checkBatchLines, packageNeeds } from './batchSaleChecks';

const line = (over = {}) => ({
  key: 'a', layer: '41', inventory_batch_id: '41', product: '7',
  quantity: '2', selling_price: '100', packageLines: [], ...over,
});
const inventory = [
  { batch_id: 41, product: 7, quantity: 5 },
  { batch_id: 42, product: 7, quantity: 1 },
  { batch_id: 43, product: 8, quantity: 4 },
];
const packages = [{ package_type: 'M', quantity: 3 }];

describe('a basket that is fine', () => {
  it('passes', () => {
    expect(checkBatchLines([line()], { inventory, packages })).toBeNull();
  });

  it('passes with packaging it has stock for', () => {
    const l = line({ packageLines: [{ package_type: 'M', quantity: 2 }] });
    expect(checkBatchLines([l], { inventory, packages })).toBeNull();
  });
});

describe('a basket that is not', () => {
  it('refuses an empty one', () => {
    expect(checkBatchLines([], { inventory }).code).toBe('no-lines');
    expect(checkBatchLines([line({ layer: '' })], { inventory }).code).toBe('no-lines');
  });

  it('refuses a line with no price', () => {
    expect(checkBatchLines([line({ selling_price: '' })], { inventory }).code).toBe('no-price');
    expect(checkBatchLines([line({ selling_price: null })], { inventory }).code).toBe('no-price');
  });

  it('names a layer that is short, with the numbers to explain it', () => {
    const res = checkBatchLines([line({ inventory_batch_id: '42', quantity: '3' })],
      { inventory, packages });
    expect(res.code).toBe('layer-stock');
    expect(res.params).toMatchObject({ need: 3, available: 1 });
  });

  it('catches a layer asked for twice across two lines', () => {
    // Each line is within stock on its own; together they are not. The server checks the batch,
    // so a per-line check would let this through and be refused after the walk.
    const two = [line({ key: 'a', quantity: '3' }), line({ key: 'b', quantity: '3' })];
    expect(checkBatchLines(two, { inventory, packages }).code).toBe('layer-stock');
  });

  it('checks the layer before the product', () => {
    // Layer 42 holds one; product 7 holds six across layers. The complaint must be about the
    // layer, because that is what the server will object to.
    const res = checkBatchLines([line({ inventory_batch_id: '42', quantity: '2' })],
      { inventory, packages });
    expect(res.code).toBe('layer-stock');
  });

  it('refuses packaging the shop does not stock at all', () => {
    const l = line({ packageLines: [{ package_type: 'XL', quantity: 1 }] });
    expect(checkBatchLines([l], { inventory, packages }).code).toBe('package-missing');
  });

  it('refuses more packaging than there is', () => {
    const l = line({ packageLines: [{ package_type: 'M', quantity: 9 }] });
    const res = checkBatchLines([l], { inventory, packages });
    expect(res.code).toBe('package-stock');
    expect(res.params).toMatchObject({ type: 'M', need: 9, have: 3 });
  });

  it('adds packaging up across lines', () => {
    const two = [
      line({ key: 'a', packageLines: [{ package_type: 'M', quantity: 2 }] }),
      line({ key: 'b', packageLines: [{ package_type: 'M', quantity: 2 }] }),
    ];
    expect(checkBatchLines(two, { inventory, packages }).code).toBe('package-stock');
  });
});

describe('robustness', () => {
  it.each([[null], [undefined], [[]]])('treats %j as an empty basket', (lines) => {
    expect(checkBatchLines(lines, { inventory }).code).toBe('no-lines');
  });

  it('survives being given no inventory at all', () => {
    // Better a complaint about stock than a crash: an inventory that failed to load must not
    // take the till down with it.
    expect(checkBatchLines([line()], {}).code).toBe('layer-stock');
  });

  it('ignores a malformed line', () => {
    expect(() => checkBatchLines([null, {}, line()], { inventory, packages })).not.toThrow();
  });
});

describe('what packaging a basket needs', () => {
  it('adds it up by type', () => {
    const two = [
      line({ packageLines: [{ package_type: 'M', quantity: 2 }] }),
      line({ packageLines: [{ package_type: 'M', quantity: 1 }, { package_type: 'S', quantity: 4 }] }),
    ];
    expect(packageNeeds(two).sort()).toEqual([['M', 3], ['S', 4]].sort());
  });

  it('ignores rows with no type or no quantity', () => {
    const l = line({ packageLines: [{ package_type: '', quantity: 2 }, { package_type: 'M', quantity: 0 }] });
    expect(packageNeeds([l])).toEqual([]);
  });
});
