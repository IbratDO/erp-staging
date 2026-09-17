import {
  applyLayerToLine,
  applyScanToBatchLines,
  clearLayerFromLine,
  emptyBatchLine,
} from './batchSaleLines';

const PRODUCT = {
  id: 7, category: 'Shoes', brand: 'DS', model: 'Runner', size: '42', color: 'Black',
  // The price comes off the product when the layer has no stocking order — see
  // resolveLayerListPrice's fallback to productSellingQuote.
  selling_price: '100', selling_price_currency: 'USD',
};

const layer = (batchId, quantity) => ({
  batch_id: batchId,
  product: PRODUCT.id,
  product_detail: PRODUCT,
  quantity,
});

const ctx = (...layers) => ({
  inventory: layers,
  products: [PRODUCT],
  saleCurrency: 'USD',
  cbuRate: 12000,
});

const item = (batchId, quantity) => ({
  value: String(batchId),
  label: `#${batchId} DS Runner`,
  layer: layer(batchId, quantity),
});

describe('emptyBatchLine', () => {
  it('carries every field the submit handler reads', () => {
    // The four places that used to build this by hand had already drifted; a missing field
    // reaches the submit handler as `undefined`.
    expect(Object.keys(emptyBatchLine()).sort()).toEqual([
      // `catalog_price` joined the list when selling above the shelf price was allowed: it holds
      // the shop's own figure, which `list_price` no longer does once a higher price is typed.
      'catalog_price', 'category', 'discount_price', 'inventory_batch_id', 'key', 'layer',
      'list_price', 'packageLines', 'product', 'quantity', 'selling_price',
    ]);
  });

  it('honours a supplied key and invents one otherwise', () => {
    expect(emptyBatchLine('fixed-0').key).toBe('fixed-0');
    expect(emptyBatchLine().key).toBeTruthy();
  });
});

describe('applyLayerToLine', () => {
  it('back-fills product, batch id and price from the layer', () => {
    const line = applyLayerToLine(emptyBatchLine('k'), '11', ctx(layer(11, 5)));
    expect(line).toMatchObject({
      layer: '11', product: '7', inventory_batch_id: '11', category: 'Shoes',
    });
    expect(line.list_price).toBe(line.selling_price);
    expect(line.list_price).not.toBe('');
  });

  it("lets the scanned layer's category override the line's filter", () => {
    // A physical box in the operator's hand outranks a dropdown they set earlier.
    const started = { ...emptyBatchLine('k'), category: 'Caps' };
    expect(applyLayerToLine(started, '11', ctx(layer(11, 5))).category).toBe('Shoes');
  });

  it('clears the line when the layer is removed', () => {
    const filled = applyLayerToLine(emptyBatchLine('k'), '11', ctx(layer(11, 5)));
    expect(applyLayerToLine(filled, '', ctx(layer(11, 5)))).toMatchObject({
      layer: '', product: '', inventory_batch_id: '', list_price: '', selling_price: '',
    });
  });

  it('keeps quantity and key when clearing — those are the operator\'s, not the layer\'s', () => {
    const filled = { ...applyLayerToLine(emptyBatchLine('k'), '11', ctx(layer(11, 5))), quantity: '4' };
    const cleared = clearLayerFromLine(filled);
    expect(cleared.quantity).toBe('4');
    expect(cleared.key).toBe('k');
  });
});

describe('applyScanToBatchLines', () => {
  it('fills the blank line the modal opens with, rather than appending below it', () => {
    const { lines, result } = applyScanToBatchLines(
      [emptyBatchLine('k0')], item(11, 5), ctx(layer(11, 5)),
    );
    expect(lines).toHaveLength(1);
    expect(result.kind).toBe('added');
    expect(lines[0]).toMatchObject({ key: 'k0', layer: '11', product: '7' });
  });

  it('appends when every line is already filled', () => {
    const first = applyLayerToLine(emptyBatchLine('k0'), '11', ctx(layer(11, 5)));
    const { lines, result } = applyScanToBatchLines(
      [first], item(12, 3), ctx(layer(11, 5), layer(12, 3)),
    );
    expect(lines).toHaveLength(2);
    expect(result.kind).toBe('added');
    expect(lines[1]).toMatchObject({ layer: '12', inventory_batch_id: '12' });
  });

  it('increments on a rescan instead of adding a second line', () => {
    // Three identical boxes means quantity 3. Three lines would become three one-unit Sale rows
    // for one product, which is the wrong shape for the group and for returns against it.
    let lines = [emptyBatchLine('k0')];
    let result;
    for (let i = 0; i < 3; i += 1) {
      ({ lines, result } = applyScanToBatchLines(lines, item(11, 5), ctx(layer(11, 5))));
    }
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe('3');
    expect(result.kind).toBe('incremented');
  });

  it('refuses to scan past the layer\'s stock and says so', () => {
    let lines = [emptyBatchLine('k0')];
    for (let i = 0; i < 2; i += 1) {
      ({ lines } = applyScanToBatchLines(lines, item(11, 2), ctx(layer(11, 2))));
    }
    expect(lines[0].quantity).toBe('2');

    const capped = applyScanToBatchLines(lines, item(11, 2), ctx(layer(11, 2)));
    expect(capped.result.kind).toBe('at-stock-cap');
    expect(capped.lines).toBe(lines); // untouched, same reference
  });

  it('counts the whole basket against the cap, not one line at a time', () => {
    // A layer split across two lines by hand could otherwise be scanned past its stock, and the
    // server would reject the whole basket at submit — after everything had been scanned.
    const a = { ...applyLayerToLine(emptyBatchLine('k0'), '11', ctx(layer(11, 3))), quantity: '2' };
    const b = { ...applyLayerToLine(emptyBatchLine('k1'), '11', ctx(layer(11, 3))), quantity: '1' };
    const { result } = applyScanToBatchLines([a, b], item(11, 3), ctx(layer(11, 3)));
    expect(result.kind).toBe('at-stock-cap');
  });

  it('never mutates the lines it was given', () => {
    const original = [emptyBatchLine('k0')];
    const snapshot = JSON.stringify(original);
    applyScanToBatchLines(original, item(11, 5), ctx(layer(11, 5)));
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('a layer an unfinished sale has already spoken for', () => {
  /**
   * The goods are physically on the shelf but promised to a sale nobody has finished, so the
   * basket may not take them — and must say which sale to go and deal with. Reported apart from
   * a sold-out layer on purpose: "there is no more in stock" sends somebody to count a shelf that
   * visibly has the item on it, which reads as the screen being wrong.
   */
  const heldItem = (batchId, onShelf, available, sales) => ({
    value: String(batchId),
    label: `#${batchId} DS Runner`,
    layer: {
      ...layer(batchId, onShelf),
      available_quantity: available,
      held_by_sales: sales,
    },
  });

  it('refuses it and names the sale holding it', () => {
    const { lines, result } = applyScanToBatchLines(
      [emptyBatchLine('k0')], heldItem(11, 3, 0, [412]), ctx(layer(11, 3)),
    );
    expect(result.kind).toBe('at-hold-cap');
    expect(result.sales).toBe('#412');
    // Nothing was chosen: the blank line is still blank.
    expect(lines[0].layer).toBe('');
  });

  it('names every sale when more than one holds it', () => {
    const { result } = applyScanToBatchLines(
      [emptyBatchLine('k0')], heldItem(11, 3, 0, [412, 413]), ctx(layer(11, 3)),
    );
    expect(result.sales).toBe('#412, #413');
  });

  it('lets the free units through and stops at the hold', () => {
    // Five on the shelf, two free. The shop can still sell the two.
    const held = heldItem(11, 5, 2, [412]);
    let lines = [emptyBatchLine('k0')];
    for (let i = 0; i < 2; i += 1) {
      ({ lines } = applyScanToBatchLines(lines, held, ctx(layer(11, 5))));
    }
    expect(lines[0].quantity).toBe('2');

    const capped = applyScanToBatchLines(lines, held, ctx(layer(11, 5)));
    expect(capped.result.kind).toBe('at-hold-cap');
    expect(capped.lines).toBe(lines); // untouched, same reference
  });

  it('still calls an empty layer empty, even when it is also held', () => {
    // A layer that is both out of stock and held has nothing to reclaim by finishing that sale,
    // so the message that can actually be acted on is the sold-out one.
    const { result } = applyScanToBatchLines(
      [emptyBatchLine('k0')], heldItem(11, 0, 0, [412]), ctx(layer(11, 0)),
    );
    expect(result.kind).toBe('at-stock-cap');
  });
});
