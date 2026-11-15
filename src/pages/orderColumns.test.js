/**
 * The Buyurtmalar table has to have the same number of cells in every row as it has headings.
 *
 * It did not. The group heading row carried 28 cells against 30 headings, because the two
 * per-unit cost columns were never given cells there — so from that point on every figure was
 * printing one column to the left of its own label. A group's order total in som appeared under
 * "Jami xarajat", and whoever created it appeared under "Yuk/dona (USD)".
 *
 * Nothing in the page could catch that: React is perfectly happy to render a short row, and the
 * result looks like data rather than like a bug. So it is counted here, against the source
 * itself, and counted again with the Purchasing Agent's sixteen hidden columns applied — the
 * case where the three lists are most likely to drift apart.
 */
import fs from 'fs';
import path from 'path';

// Normalised: the file is stored with CRLF endings, and every match below is written with \n.
const SOURCE = fs.readFileSync(path.join(__dirname, 'Orders.js'), 'utf8').replace(/\r\n/g, '\n');

/**
 * Cell openers at the row's own indent, so inner markup is not counted.
 *
 * One step deeper counts too: a cell wrapped in `{canSeeStockOrders && (` sits two spaces in
 * from its neighbours, and it is still one column.
 */
function countCells(block, indent) {
  return block.split('\n').filter((line) => {
    const depth = line.length - line.trimStart().length;
    if (depth !== indent.length && depth !== indent.length + 2) return false;
    const body = line.trimStart();
    // `<th>`/`<th ` only — never `<thead>`. Three headings are plain, the rest are sortable.
    return body.startsWith('<td')
      || body.startsWith('<SortableTh')
      || body.startsWith('<th>')
      || body.startsWith('<th ');
  }).length;
}

/** Every `showCol('x')` guard inside a block, in order. */
function guardedKeys(block) {
  return [...block.matchAll(/showCol\('([a-z_]+)'\)/g)].map((m) => m[1]);
}

function slice(from, to) {
  const start = SOURCE.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

// Anchored on the first heading itself, not on `<thead>`: the batch forms above have their own
// tables, and their thead comes first in the file.
const headerBlock = () => slice(
  '              <SortableTh columnId="id"',
  '</tr>\n          </thead>',
);
const singleRowBlock = () => slice(
  '        <td>#{order.id}</td>',
  '      </tr>\n    );\n  };',
);
const groupRowBlock = () => {
  const anchor = SOURCE.indexOf('const agg = aggregateGroupOrders(row.orders);');
  const start = SOURCE.indexOf('                    <tr\n', anchor);
  const end = SOURCE.indexOf('                    </tr>\n', start);
  return SOURCE.slice(start, end);
};

describe('every row has a cell for every heading', () => {
  test('the header still has the number of columns this file assumes', () => {
    // 31 with Buyurtma turi. `orderTableColumnCount` is written against this number, and the
    // empty-table row spans it.
    //
    // 30 until **Buyurtma berilgan sana** was added beside Sana on 2026-11-16. These three
    // tests are what caught the counts being left behind, which is the whole reason the number
    // is asserted against the source string as well as counted: the count alone would have
    // passed with `orderTableColumnCount` still saying 30 and only the empty-table row short.
    expect(countCells(headerBlock(), '              ')).toBe(31);
    expect(SOURCE).toContain('const base = canSeeStockOrders ? 31 : 30;');
    // The footer label spans everything before the first totalled column, so it moves with any
    // column added ahead of Miqdor -- which was missed once before and left the totals row one
    // cell out of line with its own headings.
    expect(SOURCE).toContain('canSeeStockOrders ? 16 : 15;');
  });

  test('a single order row matches the header', () => {
    expect(countCells(singleRowBlock(), '        ')).toBe(31);
  });

  test('a group heading row matches the header', () => {
    expect(countCells(groupRowBlock(), '                      ')).toBe(31);
  });
});

describe('the columns hidden from a Purchasing Agent', () => {
  const HIDDEN = [
    'order_type', 'customer', 'qty', 'weight',
    'selling_price_unit', 'selling_price_unit_uzs',
    'cost_per_unit', 'cost_per_unit_uzs', 'total_cost',
    'order_uzs', 'order_usd',
    'cargo_uzs', 'cargo_usd', 'cargo_unit_uzs', 'cargo_unit_usd',
    'created_by',
  ];

  test('the header guards exactly those sixteen, once each', () => {
    expect(guardedKeys(headerBlock()).sort()).toEqual([...HIDDEN].sort());
  });

  test('a single order row guards the same sixteen', () => {
    expect(guardedKeys(singleRowBlock()).sort()).toEqual([...HIDDEN].sort());
  });

  test('a group heading row guards the same sixteen', () => {
    expect(guardedKeys(groupRowBlock()).sort()).toEqual([...HIDDEN].sort());
  });

  test('the four columns the role actually works with are never guarded', () => {
    const guarded = new Set(guardedKeys(headerBlock()));
    for (const kept of ['status', 'supplier_country', 'supplier_cargo', 'ordered_note']) {
      expect(guarded.has(kept)).toBe(false);
    }
  });

  test('the totals row goes too, since every figure in it belongs to a hidden column', () => {
    expect(SOURCE).toContain("{showCol('qty') && (\n          <tfoot>");
  });
});
