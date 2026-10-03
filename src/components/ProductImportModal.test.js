/**
 * The dialog that stands between a spreadsheet and the Mahsulotlar table.
 *
 * Its whole job is that nothing is saved by accident. Choosing a file only asks what *would* happen;
 * the rows and their verdicts are shown; and Confirm is withheld while any row has a problem, because
 * the server imports all rows or none — a button offering to import "the good ones" would be
 * promising something the server refuses.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ProductImportModal from './ProductImportModal';

// One `t` built once in the factory, never per render: a fresh one changes the identity of everything
// derived from it and the effects that depend on it re-run forever.
jest.mock('react-i18next', () => {
  const t = (key) => key;
  return {
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({ t, i18n: { language: 'uz' } }),
  };
});

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

/** Keys plus their values, so a count or a row number can be asserted on. */
const t = (key, opts) => (opts ? `${key} ${JSON.stringify(opts)}` : key);

const PREVIEW = {
  summary: { total: 3, to_create: 1, to_update: 1, unchanged: 1, errors: 0, skipped_blank: 0 },
  can_commit: true,
  rows: [
    { row_num: 2, action: 'create', values: rowValues({ size: '43' }), errors: [] },
    {
      row_num: 3, action: 'update', product_id: 7, errors: [],
      values: rowValues({ category: 'Oyoq kiyim' }),
      changes: { category: ['Krossovka', 'Oyoq kiyim'] },
    },
    { row_num: 4, action: 'unchanged', product_id: 8, values: rowValues(), errors: [] },
  ],
};

function rowValues(over = {}) {
  return {
    category_type: 'sports', category: 'Krossovka', brand: 'Nike',
    model: 'Air', size: '41', color: 'Oq', ...over,
  };
}

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
      <ProductImportModal
        open
        onClose={() => {}}
        api={api}
        t={t}
        lang="uz"
        onImported={onImported}
      />,
    );
  });
  return container;
}

const fileInput = () => document.querySelector('input[type="file"]');
const text = () => document.body.textContent;
const buttons = () => Array.from(document.querySelectorAll('button'));
const confirmButton = () => buttons().find((b) => b.textContent.includes('importExcel.confirm'));

async function pickFile(name = 'products.xlsx') {
  const input = fileInput();
  const file = new File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return file;
}

const previewingApi = (payload = PREVIEW) => ({
  request: jest.fn().mockResolvedValue({ data: payload }),
  post: jest.fn().mockResolvedValue({ data: { created: 1, updated: 1, unchanged: 1 } }),
  get: jest.fn().mockResolvedValue({ data: new Blob() }),
});

describe('before a file is chosen', () => {
  it('offers the template and withholds confirm', () => {
    mount({ api: previewingApi() });
    expect(text()).toContain('importExcel.downloadTemplate');
    expect(confirmButton().disabled).toBe(true);
  });

  it('says that only the category can change on a product that exists', () => {
    // The rule people trip over, on screen as well as in the template's cell notes.
    mount({ api: previewingApi() });
    expect(text()).toContain('importExcel.identityNote');
  });
});

describe('after a file is chosen', () => {
  it('uploads it and shows what each row would do', async () => {
    const api = previewingApi();
    mount({ api });
    await pickFile();

    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.calls[0][0].url).toBe('/products/import_preview/');
    expect(text()).toContain('importExcel.willAdd');
    expect(text()).toContain('importExcel.willUpdate');
    expect(text()).toContain('importExcel.unchanged');
  });

  it('shows the counts it was given', async () => {
    mount({ api: previewingApi() });
    await pickFile();
    expect(text()).toContain('"count":1');
  });

  it('shows the before and after of a category being corrected', async () => {
    mount({ api: previewingApi() });
    await pickFile();
    expect(text()).toContain('Krossovka → Oyoq kiyim');
  });

  it('saves nothing by itself', async () => {
    const api = previewingApi();
    mount({ api });
    await pickFile();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('confirm', () => {
  it('is withheld while any row has a problem', async () => {
    // Rows are saved all together, so offering to import the good ones would be a false promise.
    const api = previewingApi({
      summary: { total: 2, to_create: 1, to_update: 0, unchanged: 0, errors: 1, skipped_blank: 0 },
      can_commit: false,
      rows: [
        { row_num: 2, action: 'create', values: rowValues(), errors: [] },
        { row_num: 3, action: 'error', values: rowValues({ brand: '' }), errors: ['Brand is required.'] },
      ],
    });
    mount({ api });
    await pickFile();

    expect(confirmButton().disabled).toBe(true);
    expect(text()).toContain('Brand is required.');
    expect(text()).toContain('importExcel.blockedByProblems');
  });

  it('sends back only the rows that do something, with their values', async () => {
    const api = previewingApi();
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/products/import_commit/');
    // The unchanged row is left out; no product_id or action is sent, because the server re-decides.
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((r) => r.row_num)).toEqual([2, 3]);
    expect(body.rows[0]).not.toHaveProperty('action');
    expect(body.rows[0]).not.toHaveProperty('product_id');
    expect(body.rows[0].brand).toBe('Nike');
  });

  it('reports what was saved and tells the page to refresh', async () => {
    const onImported = jest.fn();
    mount({ api: previewingApi(), onImported });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onImported).toHaveBeenCalledWith({ created: 1, updated: 1, unchanged: 1 });
    expect(text()).toContain('importExcel.done');
  });
});

describe('when something goes wrong', () => {
  it('shows the server s own message for a file it cannot read', async () => {
    const api = previewingApi();
    api.request.mockRejectedValue({ response: { data: { error: 'Only .xlsx files can be read.' } } });
    mount({ api });
    await pickFile('products.csv');
    expect(text()).toContain('Only .xlsx files can be read.');
    expect(confirmButton().disabled).toBe(true);
  });

  it('names the rows the commit refused', async () => {
    const api = previewingApi();
    api.post.mockRejectedValue({
      response: {
        data: {
          error: 'Some rows could not be imported, so nothing was saved.',
          item_errors: [{ index: 1, row_num: 3, errors: ['Brand is required.'], line: {} }],
        },
      },
    });
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(text()).toContain('"row":3');
    expect(text()).toContain('Brand is required.');
  });
});
