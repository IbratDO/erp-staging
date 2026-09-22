/**
 * The order the Sotuvlar table puts its rows in.
 *
 * **The bug these start from.** A multi-item group shows one synthetic status, and when its
 * lines disagree that status is `mixed` — rendered "Aralash". The default sort asked whether
 * that *label* was terminal; `mixed` is not, so every such group counted as unfinished and was
 * pinned above the genuinely open sales. One completed line beside one returned line was enough,
 * and nothing about the group ever finishing could release it: the shop saw a block of Aralash
 * rows on top and the work actually needing attention pushed below them.
 *
 * The rule now reads the lines themselves. A row is finished when every line that still counts
 * has reached a terminal status, whatever the badge says — and the badge is left exactly as it
 * was, because it describes something different and the two sharing one function is what stopped
 * them drifting apart in the first place.
 *
 * Tested here rather than in the page: this is a pure comparator, and the page it used to live
 * in is four thousand lines of component that no test could reach — which is how a sort defect
 * this visible survived in the first place.
 */
import {
  compareSaleDisplayRows,
  displayRowIsFinished,
  displayRowStageRank,
} from './saleGroupDisplay';

/** A single-sale row, as `buildSaleDisplayRows` emits one. */
const single = (id, status, date) => ({
  type: 'single',
  key: `sale-${id}`,
  sale: { id, status, sale_date: date },
});

/** A group row: several sale lines drawn as one. */
const group = (id, lines) => ({
  type: 'group',
  key: `group-${id}`,
  groupId: id,
  sales: lines.map(([lineId, status, date]) => ({ id: lineId, status, sale_date: date })),
});

const order = (rows) => [...rows].sort(compareSaleDisplayRows).map((r) => r.key);

describe('a finished group that shows "Aralash"', () => {
  const mixedButDone = group(1, [
    [10, 'completed', '2026-09-01T09:00:00Z'],
    [11, 'returned', '2026-09-01T09:00:00Z'],
  ]);

  test('counts as finished even though its label is not a terminal status', () => {
    // `mixed` is not in {completed, returned, cancelled}; the lines are. The lines decide.
    expect(displayRowIsFinished(mixedButDone)).toBe(true);
  });

  test('sorts below a sale that is still open', () => {
    const openSale = single(20, 'pending', '2026-08-01T09:00:00Z');

    // Note the open sale is the *older* row. Under the old rule the Aralash group won on status
    // alone and sat on top; the whole complaint was that finished groups outranked live work.
    expect(order([mixedButDone, openSale])).toEqual(['sale-20', 'group-1']);
  });
});

describe('a group that really is unfinished', () => {
  test('one open line among finished ones keeps the whole row open', () => {
    const partly = group(2, [
      [30, 'completed', '2026-09-01T09:00:00Z'],
      [31, 'pending', '2026-09-01T09:00:00Z'],
    ]);

    expect(displayRowIsFinished(partly)).toBe(false);
  });

  test('a cancelled line does not make the row finished on its own', () => {
    const oneCancelled = group(3, [
      [40, 'cancelled', '2026-09-01T09:00:00Z'],
      [41, 'confirmed', '2026-09-01T09:00:00Z'],
    ]);

    expect(displayRowIsFinished(oneCancelled)).toBe(false);
  });

  test('a wholly cancelled group is finished', () => {
    // Nothing left to do with it, so it belongs with the finished rows rather than at the top.
    const allCancelled = group(4, [
      [50, 'cancelled', '2026-09-01T09:00:00Z'],
      [51, 'cancelled', '2026-09-01T09:00:00Z'],
    ]);

    expect(displayRowIsFinished(allCancelled)).toBe(true);
  });
});

describe('the open rows are ordered by how far from done they are', () => {
  test('earlier workflow stages come first', () => {
    const rows = [
      single(1, 'dispatched', '2026-09-10T09:00:00Z'),
      single(2, 'pending', '2026-09-10T09:00:00Z'),
      single(3, 'confirmed', '2026-09-10T09:00:00Z'),
      single(4, 'reserved', '2026-09-10T09:00:00Z'),
    ];

    expect(order(rows)).toEqual(['sale-2', 'sale-4', 'sale-3', 'sale-1']);
  });

  test('a group ranks by its least advanced line, not its most advanced', () => {
    /*
      The outstanding work is the pending line even though the other has already shipped, so the
      group belongs among the pending sales — above a confirmed one.

      Asserted as an absolute rank and an ordering, rather than by comparing two
      `displayRowStageRank` results. That comparison holds whenever both sides degrade together:
      flattening the ranking function to a constant left the earlier version of this test green,
      which is to say it pinned nothing at all.
    */
    const behind = group(5, [
      [60, 'dispatched', '2026-09-10T09:00:00Z'],
      [61, 'pending', '2026-09-10T09:00:00Z'],
    ]);
    const confirmedSale = single(9, 'confirmed', '2026-09-10T09:00:00Z');

    expect(displayRowStageRank(behind)).toBe(0);
    expect(order([confirmedSale, behind])).toEqual(['group-5', 'sale-9']);
  });

  test('within one stage the longest-waiting sale is first', () => {
    const rows = [
      single(1, 'pending', '2026-09-10T09:00:00Z'),
      single(2, 'pending', '2026-09-02T09:00:00Z'),
      single(3, 'pending', '2026-09-06T09:00:00Z'),
    ];

    expect(order(rows)).toEqual(['sale-2', 'sale-3', 'sale-1']);
  });

  test('an unknown status is listed last among the open rows, not dropped', () => {
    // A status added to the model later must not scramble the table or hide the row.
    const rows = [
      single(1, 'something_new', '2026-09-10T09:00:00Z'),
      single(2, 'pending', '2026-09-10T09:00:00Z'),
    ];

    expect(order(rows)).toEqual(['sale-2', 'sale-1']);
  });
});

describe('the finished rows', () => {
  test('are listed newest first', () => {
    const rows = [
      single(1, 'completed', '2026-09-02T09:00:00Z'),
      single(2, 'completed', '2026-09-09T09:00:00Z'),
      single(3, 'returned', '2026-09-05T09:00:00Z'),
    ];

    expect(order(rows)).toEqual(['sale-2', 'sale-3', 'sale-1']);
  });

  test('always sit below every open row, however old the open one is', () => {
    const rows = [
      single(1, 'completed', '2026-09-20T09:00:00Z'),
      single(2, 'pending', '2026-01-04T09:00:00Z'),
    ];

    expect(order(rows)).toEqual(['sale-2', 'sale-1']);
  });
});
