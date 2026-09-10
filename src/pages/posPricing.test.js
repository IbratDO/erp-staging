/**
 * Pricing the first item into an empty till.
 *
 * The bug this file exists for: the first item picked came out at **0.01**.
 *
 * `resolveLayerListPrice` compares the layer's own currency against the currency the sale is being
 * rung up in, and converts when they differ. An empty basket has no currency yet — `null` — which
 * matches nothing, so a $100 item was divided by the som rate and rounded to the cent. The Sotuvlar
 * modal never hit it because its currency defaults to a real one; the till derived it from a basket
 * that was still empty.
 *
 * The rule: an item is priced in the basket's currency once there is one, and otherwise in **its
 * own** — the first item sets the currency rather than being converted into a guess.
 */
import { applyLayerToLine, currencyForLayer } from './batchSaleLines';
import { resolveLayerListPrice } from '../utils/productCost';

const RATE = 11789.33;

const usdLayer = {
  batch_id: 41, product: 7, quantity: 5,
  selling_price: '100', selling_price_currency: 'USD',
  product_detail: { id: 7, brand: 'On', model: 'Cloud', selling_price: '100' },
};
const uzsLayer = {
  batch_id: 42, product: 8, quantity: 5,
  selling_price: '1200000', selling_price_currency: 'UZS',
  product_detail: { id: 8, brand: 'Nike', model: 'Pegasus', selling_price: '1200000' },
};
const products = [usdLayer.product_detail, uzsLayer.product_detail];
const inventory = [usdLayer, uzsLayer];

describe('the bug, stated directly', () => {
  it('a dollar item priced against no currency collapses to a cent', () => {
    // Not a regression guard on our code — a demonstration of why the null must never reach here.
    expect(resolveLayerListPrice(usdLayer, usdLayer.product_detail, null, RATE)).toBe(0.01);
  });

  it('and priced against its own currency it is itself', () => {
    expect(resolveLayerListPrice(usdLayer, usdLayer.product_detail, 'USD', RATE)).toBe(100);
  });
});

describe('the first item sets the currency instead of being converted into one', () => {
  const priceFor = (layer) => {
    // What the till does: basket empty, so the item's own currency.
    const currency = currencyForLayer(String(layer.batch_id), inventory, products);
    return applyLayerToLine({ key: 'a' }, String(layer.batch_id), {
      inventory, products, saleCurrency: currency, cbuRate: RATE,
    });
  };

  it('keeps a dollar item at its dollar price', () => {
    expect(priceFor(usdLayer).selling_price).toBe('100');
  });

  it('keeps a som item at its som price', () => {
    expect(priceFor(uzsLayer).selling_price).toBe('1200000');
  });

  it('never produces the cent', () => {
    for (const layer of inventory) {
      expect(Number(priceFor(layer).selling_price)).toBeGreaterThan(1);
    }
  });
});

describe('a second item follows the basket, not itself', () => {
  it('is converted into the currency the first item established', () => {
    // Otherwise the total would add som to dollars — the mistake that put a 89% margin on a
    // report earlier in this system.
    const line = applyLayerToLine({ key: 'b' }, String(uzsLayer.batch_id), {
      inventory, products, saleCurrency: 'USD', cbuRate: RATE,
    });
    const asUsd = Number(line.selling_price);
    expect(asUsd).toBeGreaterThan(50);
    expect(asUsd).toBeLessThan(200);
  });
});
