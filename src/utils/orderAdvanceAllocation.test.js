/**
 * One advance for an on-demand order, split across its items.
 *
 * The owner's instruction of 2026-11-15: the advance field should be one for the whole order and
 * the system should apportion it. He chose selling price as the basis, falling back to quantity
 * where no selling price has been entered -- which is a real case, because a selling price is
 * optional at order time.
 *
 * Two properties matter more than any individual figure here, and both are asserted on awkward
 * numbers rather than tidy ones:
 *
 *   * **the shares sum back to the typed amount, exactly** -- two independently rounded shares
 *     do not, which is why the last weighted line takes the remainder; and
 *   * **every som share is a whole number** -- `advance_payment_amount_uzs` is in
 *     `whole_soum.TYPED_SOUM_KEYS`, so one fractional share makes the server refuse the whole
 *     order.
 */
import {
  allocateOrderAdvance,
  advanceWeights,
  orderLineTotals,
  lineCostTotals,
  sellingTotals,
} from './orderAdvanceAllocation';

const line = (over = {}) => ({
  key: over.key || Math.random().toString(36),
  ordered_quantity: '1',
  cost_usd_per_unit: '',
  cost_uzs_per_unit: '',
  selling_usd_per_unit: '',
  selling_uzs_per_unit: '',
  ...over,
});

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('allocating one advance across the lines', () => {
  it('follows the selling price', () => {
    // $100 over a $60 line and a $40 line: half each, because each is paid for in proportion
    // to what the customer owes on it.
    const lines = [
      line({ ordered_quantity: '2', selling_usd_per_unit: '30' }),
      line({ ordered_quantity: '1', selling_usd_per_unit: '40' }),
    ];
    const { shares, usdBasis } = allocateOrderAdvance(lines, { usd: '100' });
    expect(usdBasis).toBe('selling');
    expect(shares.map((s) => s.usd)).toEqual([60, 40]);
  });

  it('falls back to quantity when no selling price has been entered', () => {
    const lines = [line({ ordered_quantity: '2' }), line({ ordered_quantity: '1' })];
    const { shares, uzsBasis } = allocateOrderAdvance(lines, { uzs: '100000' });
    expect(uzsBasis).toBe('quantity');
    // 2:1 by unit, and whole som.
    expect(shares.map((s) => s.uzs)).toEqual([66667, 33333]);
    expect(sum(shares.map((s) => s.uzs))).toBe(100000);
  });

  it('gives each currency leg its own basis', () => {
    // **The case a single shared weight gets wrong.** One line is priced in dollars, the other
    // in som. The dollar advance belongs entirely on the dollar line and the som advance
    // entirely on the som line -- each line credited in the currency it is priced in. A shared
    // weight would spread one leg over prices it cannot be compared with, and the server, whose
    // caps are per currency, would refuse the result.
    const lines = [
      line({ selling_usd_per_unit: '50' }),
      line({ selling_uzs_per_unit: '600000' }),
    ];
    const { shares } = allocateOrderAdvance(lines, { usd: '20', uzs: '300000' });
    expect(shares[0]).toEqual({ usd: 20, uzs: 0 });
    expect(shares[1]).toEqual({ usd: 0, uzs: 300000 });
  });

  it('gives a line with no weight no share at all', () => {
    const lines = [
      line({ selling_usd_per_unit: '100' }),
      line({ selling_usd_per_unit: '0' }),
    ];
    const { shares } = allocateOrderAdvance(lines, { usd: '40' });
    expect(shares.map((s) => s.usd)).toEqual([40, 0]);
  });

  it('allocates nothing when there is no basis at all', () => {
    // No prices and no quantities either: any split would be inventing a basis.
    const lines = [line({ ordered_quantity: '0' }), line({ ordered_quantity: '0' })];
    const { shares } = allocateOrderAdvance(lines, { usd: '50', uzs: '50000' });
    expect(shares).toEqual([{ usd: 0, uzs: 0 }, { usd: 0, uzs: 0 }]);
  });
});

describe('the properties the server depends on', () => {
  it('sums back to the typed amount on a division that does not come out', () => {
    // Three equal lines and $100: 33.33 each leaves a cent over. The last weighted line takes
    // the remainder, so the parts reconstitute the whole.
    const lines = [line(), line(), line()];
    const { shares } = allocateOrderAdvance(lines, { usd: '100' });
    expect(shares.map((s) => s.usd)).toEqual([33.33, 33.33, 33.34]);
    expect(sum(shares.map((s) => s.usd))).toBeCloseTo(100, 10);
  });

  it('never produces a fractional som share', () => {
    // 1 000 001 som over three lines. Every share must be whole: one tiyin anywhere and the
    // server refuses the order outright, not just the line.
    const lines = [line(), line(), line()];
    const { shares } = allocateOrderAdvance(lines, { uzs: '1000001' });
    shares.forEach((s) => expect(Number.isInteger(s.uzs)).toBe(true));
    expect(sum(shares.map((s) => s.uzs))).toBe(1000001);
  });

  it('keeps both properties across a range of awkward splits', () => {
    const amounts = [1, 7, 101, 999, 1000001, 123457];
    const counts = [1, 2, 3, 4, 5, 7];
    counts.forEach((n) => {
      const lines = Array.from({ length: n }, (_x, i) => line({
        ordered_quantity: String(i + 1),
        selling_uzs_per_unit: String(100000 + i * 7),
      }));
      amounts.forEach((amount) => {
        const { shares } = allocateOrderAdvance(lines, { uzs: String(amount) });
        shares.forEach((s) => expect(Number.isInteger(s.uzs)).toBe(true));
        expect(sum(shares.map((s) => s.uzs))).toBe(amount);
      });
    });
  });

  it('allocates nothing for an empty or zero advance', () => {
    const lines = [line(), line()];
    expect(allocateOrderAdvance(lines, {}).shares).toEqual([
      { usd: 0, uzs: 0 }, { usd: 0, uzs: 0 },
    ]);
    expect(allocateOrderAdvance(lines, { usd: '', uzs: '0' }).shares).toEqual([
      { usd: 0, uzs: 0 }, { usd: 0, uzs: 0 },
    ]);
  });

  it('survives no lines at all', () => {
    expect(allocateOrderAdvance([], { usd: '50' }).shares).toEqual([]);
    expect(allocateOrderAdvance(undefined, { usd: '50' }).shares).toEqual([]);
  });
});

describe('the weights themselves', () => {
  it('reads a selling total as the per-unit price times the quantity', () => {
    expect(sellingTotals([line({ ordered_quantity: '3', selling_usd_per_unit: '12.5' })], 'usd'))
      .toEqual([37.5]);
    expect(sellingTotals([line({ ordered_quantity: '3', selling_uzs_per_unit: '100000' })], 'uzs'))
      .toEqual([300000]);
  });

  it('reports which basis it used, so the form can say so', () => {
    const priced = [line({ selling_usd_per_unit: '10' })];
    expect(advanceWeights(priced, 'usd').basis).toBe('selling');
    // The same lines, asked about the other currency: no som prices, so quantity.
    expect(advanceWeights(priced, 'uzs').basis).toBe('quantity');
  });

  it('ignores a negative or unreadable quantity rather than inverting a share', () => {
    const lines = [line({ ordered_quantity: '-5' }), line({ ordered_quantity: '2' })];
    const { shares } = allocateOrderAdvance(lines, { usd: '30' });
    expect(shares.map((s) => s.usd)).toEqual([0, 30]);
  });
});

describe('the totals shown on the form', () => {
  it('adds up quantity and cost, each currency on its own', () => {
    const lines = [
      line({ ordered_quantity: '2', cost_usd_per_unit: '12.50', cost_uzs_per_unit: '150000' }),
      line({ ordered_quantity: '1', cost_usd_per_unit: '8' }),
    ];
    expect(orderLineTotals(lines)).toEqual({
      quantity: 3,
      costUsd: 33,
      costUzs: 300000,
      sellingUsd: 0,
      sellingUzs: 0,
    });
  });

  it('gives one line its own cost in both currencies', () => {
    expect(lineCostTotals(
      line({ ordered_quantity: '3', cost_usd_per_unit: '4.45', cost_uzs_per_unit: '50000' }),
    )).toEqual({ usd: 13.35, uzs: 150000 });
  });

  it('reads an empty line as zero rather than NaN', () => {
    expect(orderLineTotals([line()])).toEqual({
      quantity: 1, costUsd: 0, costUzs: 0, sellingUsd: 0, sellingUzs: 0,
    });
    expect(lineCostTotals(undefined)).toEqual({ usd: 0, uzs: 0 });
    expect(orderLineTotals(undefined).quantity).toBe(0);
  });
});
