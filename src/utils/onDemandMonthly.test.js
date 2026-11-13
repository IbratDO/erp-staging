/**
 * Oylik on-demand buyurtmalar -- the bars count items ordered, not order lines.
 *
 * The owner's report of 2026-11-13. The chart plotted `fact.count`, which is a count of `Order`
 * rows, and one row is one product: a customer ordering a jacket and two pairs of socks is three
 * lines and four items, so the bar said three. Both figures travel in the payload now, because
 * neither can be derived from the other -- `units` is what was ordered, `count` is how many lines
 * it took, and a line is the unit of work for ordering, cargo splitting and shortfalls.
 *
 * Worth saying why a quantity-1 fixture would have proved nothing: on the dev copy almost every
 * on-demand order is for a single unit, so the two figures agree on 167 rows of 169. Every case
 * below therefore uses a quantity above one.
 */
import { buildOnDemandMonthly } from './dashboardAnalytics';

const LABELS = { sold: 'Sold', inProcess: 'In process', cancelled: 'Cancelled' };

const monthRow = (out, month) => out.data.find((r) => r.month === month);

describe('buildOnDemandMonthly', () => {
  it('plots the items ordered, not the number of lines', () => {
    const out = buildOnDemandMonthly(
      [{ month: 3, status: 'sold', count: 1, units: 4 }],
      LABELS,
    );
    const march = monthRow(out, 3);
    expect(march[LABELS.sold]).toBe(4);
    expect(march.total).toBe(4);
  });

  it('adds up several lines of the same status', () => {
    const out = buildOnDemandMonthly(
      [
        { month: 5, status: 'sold', count: 1, units: 4 },
        { month: 5, status: 'sold', count: 1, units: 2 },
      ],
      LABELS,
    );
    expect(monthRow(out, 5)[LABELS.sold]).toBe(6);
  });

  it('ignores the line count entirely', () => {
    // The mutation that reintroduces the bug: `count` is present and wrong on purpose here, so
    // a builder reading it cannot pass.
    const out = buildOnDemandMonthly(
      [{ month: 7, status: 'sold', count: 99, units: 3 }],
      LABELS,
    );
    expect(monthRow(out, 7)[LABELS.sold]).toBe(3);
    expect(monthRow(out, 7).total).toBe(3);
  });

  it('draws nothing rather than a plausible wrong number when units are absent', () => {
    // Deliberate: no fall back to `count`. A backend too old to send `units` gives an empty
    // chart, which somebody reports; falling back would give a believable wrong figure, which
    // nobody does. This is the behaviour, documented, not a wish.
    const out = buildOnDemandMonthly(
      [{ month: 7, status: 'sold', count: 12 }],
      LABELS,
    );
    expect(monthRow(out, 7)[LABELS.sold]).toBe(0);
  });

  it('splits the three statuses and sums them into the total', () => {
    const out = buildOnDemandMonthly(
      [
        { month: 9, status: 'sold', count: 1, units: 5 },
        { month: 9, status: 'cancelled', count: 1, units: 2 },
        { month: 9, status: 'received', count: 1, units: 3 },
      ],
      LABELS,
    );
    const sept = monthRow(out, 9);
    expect(sept[LABELS.sold]).toBe(5);
    expect(sept[LABELS.cancelled]).toBe(2);
    // Everything that is neither sold nor cancelled is still in the pipeline.
    expect(sept[LABELS.inProcess]).toBe(3);
    expect(sept.total).toBe(10);
  });

  it('keeps every month of the year, empty ones included', () => {
    const out = buildOnDemandMonthly([{ month: 2, status: 'sold', count: 1, units: 8 }], LABELS);
    expect(out.data).toHaveLength(12);
    expect(out.data.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(monthRow(out, 1).total).toBe(0);
  });

  it('stacks finished work at the base and cancellations on top', () => {
    const out = buildOnDemandMonthly([], LABELS);
    expect(out.keys).toEqual([LABELS.sold, LABELS.inProcess, LABELS.cancelled]);
  });

  it('drops a row whose month is not a month', () => {
    const out = buildOnDemandMonthly(
      [
        { month: 0, status: 'sold', count: 1, units: 4 },
        { month: 13, status: 'sold', count: 1, units: 4 },
        { month: null, status: 'sold', count: 1, units: 4 },
      ],
      LABELS,
    );
    expect(out.data.reduce((sum, r) => sum + r.total, 0)).toBe(0);
  });

  it('survives no facts at all', () => {
    expect(buildOnDemandMonthly(undefined, LABELS).data).toHaveLength(12);
  });
});
