/**
 * The dialog that stands between a spreadsheet and the shop's cash.
 *
 * The Mahsulotlar dialog only ever risked a wrong list. This one buys stock, so the test that matters
 * most is that **the money is on the screen before the button is pressed** — what the file will spend,
 * what the till holds, and what it will read afterwards. With no bulk undo, that panel is the last
 * chance to notice a misplaced decimal point.
 *
 * The other half is which states block the button. A bad *row* blocks it, because the server buys all
 * rows or none. A till too short to cover the file does **not**: the owner's decision is that stock may
 * be loaded before the till is topped up.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import StockImportModal from './StockImportModal';

jest.mock('react-i18next', () => {
  const t = (key) => key;
  return {
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({ t, i18n: { language: 'uz' } }),
  };
});

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = false; });

const t = (key, opts) => (opts ? `${key} ${JSON.stringify(opts)}` : key);

const row = (over = {}) => ({
  row_num: 2,
  action: 'buy',
  product_id: 7,
  product_label: 'Nike / Air / 41 / Oq',
  values: {
    brand: 'Nike', model: 'Air', size: '41', color: 'Oq', quantity: '2',
    cost_uzs: '950000', cost_usd: '', selling_price: '100',
    selling_price_currency: 'USD', location: '',
  },
  line_total_uzs: '1900000',
  line_total_usd: '0.00',
  errors: [],
  warnings: [],
  ...over,
});

// `summary` is pulled out of the overrides so the spread below cannot put the partial one back and
// undo the merge — which it did, leaving the money panel with no figures to read.
const previewBody = ({ summary = {}, ...over } = {}) => ({
  summary: {
    total: 1, to_buy: 1, errors: 0, warnings: 0, skipped_blank: 0, total_units: 2,
    rate: '12000.00',
    spend: { usd: '0.00', uzs: '1900000' },
    till: { usd: '5000.00', uzs: '500000000' },
    after: { usd: '5000.00', uzs: '498100000' },
    goes_negative: { usd: false, uzs: false },
    ...summary,
  },
  can_commit: true,
  blockers: [],
  warnings: [],
  rows: [row()],
  ...over,
});

const mounted = [];
afterEach(() => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    act(() => root.unmount());
    container.remove();
  }
  jest.clearAllMocks();
});

function mount({ api, onImported = () => {} }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(
      <StockImportModal open onClose={() => {}} api={api} t={t} lang="uz" onImported={onImported} />,
    );
  });
  return container;
}

const fileInput = () => document.querySelector('input[type="file"]');
const text = () => document.body.textContent;
const buttons = () => Array.from(document.querySelectorAll('button'));
const confirmButton = () => buttons().find((b) => b.textContent.includes('importExcel.confirmBuy'));

async function pickFile(name = 'ombor.xlsx') {
  const input = fileInput();
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], name, { type: 'application/octet-stream' })], configurable: true,
  });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

const apiWith = (body = previewBody()) => ({
  request: jest.fn().mockResolvedValue({ data: body }),
  post: jest.fn().mockResolvedValue({
    data: { bought: 1, units: 2, spent: { usd: '0.00', uzs: '1900000' }, batch_ids: [1] },
  }),
  get: jest.fn().mockResolvedValue({ data: new Blob() }),
});

describe('before a file is chosen', () => {
  it('warns that confirming spends real money', () => {
    // Said up front, not after the fact: undo is per layer and impossible once a unit has sold.
    mount({ api: apiWith() });
    expect(text()).toContain('importExcel.spendsMoneyNote');
    expect(confirmButton().disabled).toBe(true);
  });
});

describe('the money panel', () => {
  it('shows what the file spends, what the till holds, and what is left', async () => {
    mount({ api: apiWith() });
    await pickFile();
    expect(text()).toContain('importExcel.willSpend');
    expect(text()).toContain('importExcel.tillNow');
    expect(text()).toContain('importExcel.tillAfter');
    // Grouped the way every other screen writes money — this is what the owner reads.
    expect(text()).toContain('1 900 000');
    expect(text()).toContain('498 100 000');
  });

  it('shows it even when the file fits comfortably', async () => {
    // Not an error state — it is the figure the owner checks every time.
    mount({ api: apiWith() });
    await pickFile();
    expect(text()).toContain('importExcel.willSpend');
  });

  it('shows the shortfall when the till cannot cover the file', async () => {
    mount({ api: apiWith(previewBody({
      summary: { after: { usd: '5000.00', uzs: '-26500000' },
                 goes_negative: { usd: false, uzs: true } },
      warnings: ['The till will be short 26500000 UZS after this. Top it up afterwards.'],
    })) });
    await pickFile();
    expect(text()).toContain('-26 500 000');
    expect(text()).toContain('Top it up afterwards');
  });
});

describe('what the row shows', () => {
  it("shows the selling price, because confirming overwrites the product's price", async () => {
    // It was absent from the first version: a money-affecting value the owner could not check.
    mount({ api: apiWith() });
    await pickFile();
    expect(text()).toContain('importExcel.sellingPrice');
    expect(text()).toContain('100 USD');
  });

  it("shows where the stock came from, because that overwrites the product's country", async () => {
    mount({ api: apiWith(previewBody({
      rows: [row({ values: { ...row().values, location: 'AQSh' } })],
    })) });
    await pickFile();
    expect(text()).toContain('AQSh');
  });

  it('keeps the unit cost apart from the line total', async () => {
    // One number beside a quantity of 4 reads as the price of one, and it is the price of four.
    mount({ api: apiWith() });
    await pickFile();
    expect(text()).toContain('importExcel.unitCostUzs');
    expect(text()).toContain('importExcel.totalUzs');
    expect(text()).toContain('950 000');       // per unit
    expect(text()).toContain('1 900 000');     // x2
  });

  it('leaves a cost the owner did not enter blank rather than zero', async () => {
    /**
     * `0` reads as a deliberate zero cost, which is the one thing a stock row must not claim — a
     * layer with no cost makes every sale off it look like pure profit.
     *
     * Asserted on the exact cells, because the first version of this test only checked that *some*
     * cell on the row said `—`, which was true whatever the cost columns did.
     */
    mount({ api: apiWith() });   // the fixture leaves the USD cost blank
    await pickFile();
    const cells = Array.from(document.querySelectorAll('tbody tr')).pop()
      .querySelectorAll('td');
    const text = (i) => cells[i].textContent.trim();

    expect(text(4)).toBe('950 000');     // unit cost, soum
    expect(text(5)).toBe('—');           // unit cost, dollars — not entered
    expect(text(6)).toBe('1 900 000');   // line total, soum
    expect(text(7)).toBe('—');           // line total, dollars — not a zero
  });

  it('does the same when it is the soum column that was left empty', async () => {
    // The mirror of the case above. Without it, only one of the two guards is ever exercised and
    // the other can be deleted without a test noticing.
    mount({ api: apiWith(previewBody({
      rows: [row({
        values: { ...row().values, cost_uzs: '', cost_usd: '4' },
        line_total_uzs: '0', line_total_usd: '8.00',
      })],
    })) });
    await pickFile();
    const cells = Array.from(document.querySelectorAll('tbody tr')).pop()
      .querySelectorAll('td');
    const text = (i) => cells[i].textContent.trim();

    expect(text(4)).toBe('—');           // unit cost, soum — not entered
    expect(text(5)).toBe('4.00');
    expect(text(6)).toBe('—');           // line total, soum — not a zero
    expect(text(7)).toBe('8.00');
  });

  it('shows no raw translation keys', async () => {
    // `table.product` leaked onto the screen because the key did not exist in that namespace.
    mount({ api: apiWith() });
    await pickFile();
    expect(text()).not.toContain('table.');
  });
});

describe('a row that also creates a product', () => {
  const creating = () => previewBody({
    summary: { to_buy: 1, to_create_products: 1 },
    rows: [row({
      action: 'create_and_buy',
      product_id: null,
      product_label: 'Puma / RS-X / 42 / Oq',
      values: { ...row().values, brand: 'Puma', model: 'RS-X',
                category_type: 'sports', category: 'Krossovka' },
      warnings: ['This creates a new product "Puma / RS-X / 42 / Oq". Did you mean the existing "Puma / RS-Z / 42 / Oq"?'],
    })],
  });

  it('says so on the row rather than calling it an ordinary buy', async () => {
    mount({ api: apiWith(creating()) });
    await pickFile();
    expect(text()).toContain('importExcel.willCreateAndBuy');
  });

  it('counts the new products separately from the rows', async () => {
    // Buying stock and changing the catalogue are two different things to agree to.
    mount({ api: apiWith(creating()) });
    await pickFile();
    expect(text()).toContain('importExcel.countNewProducts');
  });

  it('sends the create rows to the server when confirmed', async () => {
    /**
     * The bug this file shipped with. The confirm filter kept only `action === 'buy'`, so a file of
     * nothing but new products posted an empty list and the server answered "rows must be a
     * non-empty array" — a dead end with no way to tell what was wrong.
     *
     * Nothing caught it because the confirm tests all used rows with the plain `buy` verdict, and
     * the create-verdict tests only looked at what was rendered. A verdict is not supported until
     * something confirms it.
     */
    const api = apiWith(creating());
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    const [, body] = api.post.mock.calls[0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].brand).toBe('Puma');
    // The two columns that only a new product needs must travel with it.
    expect(body.rows[0].category_type).toBe('sports');
    expect(body.rows[0].category).toBe('Krossovka');
  });

  it('shows the did-you-mean warning without blocking the file', async () => {
    // Air Max 90 and Air Max 95 are different shoes, so this can only ever be a warning.
    mount({ api: apiWith(creating()) });
    await pickFile();
    expect(text()).toContain('Did you mean');
    expect(confirmButton().disabled).toBe(false);
  });
});

describe('what blocks the button', () => {
  it('a short till does not', async () => {
    // The owner's decision: load the stock, top the till up afterwards.
    mount({ api: apiWith(previewBody({
      summary: { after: { usd: '5000.00', uzs: '-26500000' },
                 goes_negative: { usd: false, uzs: true } },
      warnings: ['short'],
    })) });
    await pickFile();
    expect(confirmButton().disabled).toBe(false);
  });

  it('a bad row does', async () => {
    // The server buys all rows or none, so offering to buy the good ones would be a false promise.
    mount({ api: apiWith(previewBody({
      summary: { errors: 1, to_buy: 0 },
      can_commit: false,
      blockers: ['1 row(s) have a problem. Nothing is bought while any row is unusable.'],
      rows: [row({ action: 'error', errors: ['No product "Nosuch / Ghost / 41 / Oq" is in Mahsulotlar.'] })],
    })) });
    await pickFile();
    expect(confirmButton().disabled).toBe(true);
    expect(text()).toContain('is in Mahsulotlar');
    expect(text()).toContain('Nothing is bought');
  });
});

describe('confirming', () => {
  it('sends back only the rows that buy something', async () => {
    const api = apiWith(previewBody({
      summary: { to_buy: 1, errors: 1 },
      rows: [row(), row({ row_num: 3, action: 'error', errors: ['bad'] })],
    }));
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/inventory/import_commit/');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].row_num).toBe(2);
    // No verdict and no product id: the server decides again.
    expect(body.rows[0]).not.toHaveProperty('action');
    expect(body.rows[0]).not.toHaveProperty('product_id');
  });

  it('reports what was bought and tells the page to refresh', async () => {
    const onImported = jest.fn();
    mount({ api: apiWith(), onImported });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onImported).toHaveBeenCalledWith(
      expect.objectContaining({ bought: 1, units: 2 }));
    expect(text()).toContain('importExcel.done');
  });

  it('names the rows the server refused', async () => {
    const api = apiWith();
    api.post.mockRejectedValue({
      response: { data: {
        error: 'Some rows could not be imported, so nothing was bought.',
        item_errors: [{ index: 0, row_num: 7, errors: ['Quantity: must be a whole number above zero.'],
                        line: {} }],
      } },
    });
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).toContain('"row":7');
    expect(text()).toContain('whole number above zero');
  });
});

describe('choosing a file', () => {
  it('opens the hidden input from its own button', () => {
    // The input is hidden so the dialog matches the rest of the UI, which makes this wiring the only
    // way in: if the button stops reaching it, no file can be chosen at all.
    mount({ api: apiWith() });
    const input = fileInput();
    expect(input.style.display).toBe('none');
    const opened = jest.fn();
    input.click = opened;
    act(() => {
      buttons().find((b) => b.textContent.includes('importExcel.chooseFile'))
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(opened).toHaveBeenCalled();
  });

  it('clears the previous preview when a second file is picked', async () => {
    // Acting on a stale preview here would buy stock from the file that was replaced.
    const api = apiWith();
    mount({ api });
    await pickFile('wrong.xlsx');
    expect(text()).toContain('importExcel.willSpend');

    api.request.mockImplementation(() => new Promise(() => {}));   // never resolves
    await pickFile('right.xlsx');
    expect(text()).not.toContain('importExcel.willSpend');
    expect(confirmButton().disabled).toBe(true);
  });
});
