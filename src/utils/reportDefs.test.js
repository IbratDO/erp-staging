/**
 * The report definitions, and the footer they produce.
 *
 * The «Jami» row is the part worth pinning. It is read as the answer — how much money is frozen,
 * how much came in — and it is built by summing the same rows the table drew, so the two can only
 * disagree if this code is wrong. The traps are the ordinary ones and they are all here: a missing
 * value must count as zero rather than poisoning the sum with NaN, a two-currency column must
 * never collapse into one number, and every total must land under its own heading.
 */
import {
  REPORTS,
  buildCurrencyTotals,
  buildTotals,
  findReport,
  reportsForTab,
  sortAccessors,
  sumField,
} from './reportDefs';

describe('summing a column', () => {
  it('adds what is there', () => {
    expect(sumField([{ n: 1 }, { n: 2 }, { n: 3.5 }], 'n')).toBe(6.5);
  });

  it('treats a missing value as zero, not as NaN', () => {
    // One absent cell poisoning the whole footer is the classic way a totals row turns into
    // "NaN" in front of the owner.
    expect(sumField([{ n: 1 }, {}, { n: null }, { n: 'x' }], 'n')).toBe(1);
  });

  it('reads decimal strings, which is how the API sends money', () => {
    expect(sumField([{ n: '10.50' }, { n: '0.25' }], 'n')).toBe(10.75);
  });

  it.each([[[]], [null], [undefined]])('survives %j', (rows) => {
    expect(sumField(rows, 'n')).toBe(0);
  });
});

describe('the Jami row', () => {
  const columns = [
    { key: 'name', type: 'text' },
    { key: 'quantity', type: 'int', total: true },
    { key: 'layers', type: 'int' },
  ];
  const rows = [{ name: 'a', quantity: 2, layers: 1 }, { name: 'b', quantity: 3, layers: 4 }];

  it('totals only the columns that asked for it', () => {
    expect(buildTotals(columns, rows)).toEqual({ quantity: 5 });
  });

  it('keys each total by its own column, so it lands under the right heading', () => {
    // A footer figure one cell left of its column is worse than no footer at all.
    expect(Object.keys(buildTotals(columns, rows))).toEqual(['quantity']);
  });

  it('counts rows when a column asks for a count rather than a sum', () => {
    expect(buildTotals([{ key: 'n', total: 'count' }], rows)).toEqual({ n: 2 });
  });

  it.each([[[]], [null]])('gives an empty footer for %j rows', (r) => {
    expect(buildTotals(columns, r)).toEqual({ quantity: 0 });
  });
});

describe('two-currency totals', () => {
  const columns = [{ key: 'cost', type: 'pair', totalUsd: 'cost_usd', totalUzs: 'cost_uzs' }];
  const rows = [
    { cost_usd: '10.00', cost_uzs: '500000' },
    { cost_usd: '5.50', cost_uzs: '250000' },
  ];

  it('keeps the legs apart', () => {
    // The one rule the TZ states outright: som and dollars are never added together.
    expect(buildCurrencyTotals(columns, rows)).toEqual({ cost: { usd: 15.5, uzs: 750000 } });
  });

  it('leaves alone a column that did not ask for a currency total', () => {
    expect(buildCurrencyTotals([{ key: 'x', type: 'pair' }], rows)).toEqual({});
  });
});

describe('sorting', () => {
  const accessors = sortAccessors([
    { key: 'name', type: 'text' },
    { key: 'quantity', type: 'int' },
    { key: 'cost', type: 'pair', usd: 'cost_usd', uzs: 'cost_uzs' },
  ]);

  it('sorts text case-insensitively', () => {
    expect(accessors.name({ name: 'Adidas' })).toBe('adidas');
  });

  it('sorts numbers as numbers, not as strings', () => {
    // '9' > '10' as text, and a stock column that sorts that way is simply broken.
    expect(accessors.quantity({ quantity: '10' })).toBe(10);
  });

  it('sorts a two-currency column on its dollar leg', () => {
    expect(accessors.cost({ cost_usd: '12.00', cost_uzs: '1' })).toBe(12);
  });

  it('falls back to the som leg for a row with no dollars', () => {
    // A som-only shop would otherwise have every row sort equal, and the header would look broken.
    expect(accessors.cost({ cost_usd: '0', cost_uzs: '500000' })).toBe(500000);
  });

  it('gives every column an accessor, so no header is dead', () => {
    for (const report of REPORTS) {
      const acc = sortAccessors(report.columns);
      expect(Object.keys(acc).sort()).toEqual(report.columns.map((c) => c.key).sort());
    }
  });
});

describe('the report catalogue', () => {
  it('places every report under one of the three tabs', () => {
    expect(reportsForTab('sotuv')).toHaveLength(7);
    expect(reportsForTab('ombor')).toHaveLength(3);
    expect(reportsForTab('moliya')).toHaveLength(1);
    expect(reportsForTab('sotuv').length + reportsForTab('ombor').length
      + reportsForTab('moliya').length).toBe(REPORTS.length);
  });

  it('covers every report with a tab', () => {
    expect(REPORTS.every((r) => ['sotuv', 'ombor', 'moliya'].includes(r.tab))).toBe(true);
  });

  it('gives every report a unique key', () => {
    // Two reports sharing a key would make one of them unreachable from the picker.
    const keys = REPORTS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every report a unique endpoint', () => {
    const urls = REPORTS.map((r) => r.endpoint);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('gives every report an endpoint and columns', () => {
    for (const report of REPORTS) {
      expect(report.endpoint).toMatch(/^\/reports\//);
      expect(report.columns.length).toBeGreaterThan(0);
    }
  });

  it('marks exactly the reports that cannot run without a period', () => {
    // ABC and Cash Flow are meaningless without one, and the server refuses them; the page has to
    // know that before it asks.
    // Everything except the two stock reports, which describe today rather than a span.
    const notNeeding = REPORTS.filter((r) => !r.needsPeriod).map((r) => r.key);
    expect(notNeeding.sort()).toEqual(['aging', 'stock']);
  });

  it('finds a report by key and returns null for one that does not exist', () => {
    expect(findReport('abc').tab).toBe('ombor');
    expect(findReport('nope')).toBeNull();
  });
});
