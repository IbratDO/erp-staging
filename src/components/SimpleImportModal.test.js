/**
 * The dialog Mijozlar and Asosiy vositalar share.
 *
 * Neither page spends money, so what matters here is the plumbing every import depends on: nothing
 * is written until Confirm, Confirm is withheld while a row is bad, only the rows that do something
 * are sent, and picking a second file does not leave the first file's preview on screen.
 *
 * That last one is why this is a shared component rather than two copies — the bug it prevents is
 * the same bug on both pages.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SimpleImportModal from './SimpleImportModal';

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

const COLUMNS = [
  { key: 'name', label: 'Ism' },
  { key: 'telephone', label: 'Telefon' },
];

const row = (over = {}) => ({
  row_num: 2,
  action: 'create',
  values: { name: 'Aziz', telephone: '901234567', region: '' },
  errors: [],
  warnings: [],
  ...over,
});

const previewBody = ({ summary = {}, ...over } = {}) => ({
  summary: { total: 1, to_create: 1, skipped: 0, errors: 0, skipped_blank: 0, ...summary },
  can_commit: true,
  blockers: [],
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

const apiWith = (body = previewBody()) => ({
  request: jest.fn().mockResolvedValue({ data: body }),
  post: jest.fn().mockResolvedValue({ data: { created: 1, skipped: 0 } }),
  get: jest.fn().mockResolvedValue({ data: new Blob() }),
});

const importApi = {
  preview: (api, file) => api.request({ method: 'post', url: '/x/import_preview/', data: file }),
  commit: (api, rows) => api.post('/x/import_commit/', { rows }),
  template: (api, lang) => api.get('/x/import_template/', { params: { lang } }),
};

function mount({ api, onImported = () => {}, chips }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(
      <SimpleImportModal
        open
        onClose={() => {}}
        api={api}
        t={t}
        lang="uz"
        importApi={importApi}
        columns={COLUMNS}
        templateName="x.xlsx"
        chips={chips}
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

async function pickFile(name = 'x.xlsx') {
  const input = fileInput();
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], name, { type: 'application/octet-stream' })], configurable: true,
  });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('before a file is chosen', () => {
  it('withholds confirm and offers the template', () => {
    mount({ api: apiWith() });
    expect(confirmButton().disabled).toBe(true);
    expect(text()).toContain('importExcel.downloadTemplate');
  });
});

describe('after a file is chosen', () => {
  it('shows the configured columns', async () => {
    mount({ api: apiWith() });
    await pickFile();
    expect(text()).toContain('Ism');
    expect(text()).toContain('Telefon');
    expect(text()).toContain('901234567');
  });

  it('saves nothing by itself', async () => {
    const api = apiWith();
    mount({ api });
    await pickFile();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows a skipped row as skipped rather than added', async () => {
    mount({ api: apiWith(previewBody({
      summary: { to_create: 0, skipped: 1 },
      can_commit: false,
      blockers: ['There is nothing new to add in this file.'],
      rows: [row({ action: 'skip', warnings: ['901234567 is already in Mijozlar as "Aziz aka".'] })],
    })) });
    await pickFile();
    expect(text()).toContain('importExcel.willSkip');
    expect(text()).toContain('already in Mijozlar');
    expect(confirmButton().disabled).toBe(true);
  });

  it('renders an extra chip when the page supplies one', async () => {
    // Asosiy vositalar uses this for what the shop will owe once the assets are in.
    mount({
      api: apiWith(previewBody({ summary: { owed: { usd: '1700', uzs: '0' } } })),
      chips: [{ key: 'owed', label: (s) => (s.owed ? `owed ${s.owed.usd}` : '') }],
    });
    await pickFile();
    expect(text()).toContain('owed 1700');
  });
});

describe('confirming', () => {
  it('sends only the rows that add something', async () => {
    const api = apiWith(previewBody({
      summary: { to_create: 1, skipped: 1 },
      rows: [row(), row({ row_num: 3, action: 'skip' })],
    }));
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/x/import_commit/');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].row_num).toBe(2);
    expect(body.rows[0]).not.toHaveProperty('action');
  });

  it('reports what was saved and tells the page to refresh', async () => {
    const onImported = jest.fn();
    mount({ api: apiWith(), onImported });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onImported).toHaveBeenCalledWith({ created: 1, skipped: 0 });
    expect(text()).toContain('importExcel.done');
  });

  it('names the rows the server refused', async () => {
    const api = apiWith();
    api.post.mockRejectedValue({
      response: { data: {
        error: 'Some rows could not be imported, so nothing was saved.',
        item_errors: [{ index: 0, row_num: 5, errors: ['Name is required.'], line: {} }],
      } },
    });
    mount({ api });
    await pickFile();
    await act(async () => {
      confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).toContain('"row":5');
    expect(text()).toContain('Name is required.');
  });
});

describe('choosing a second file', () => {
  it('clears the first file s preview', async () => {
    // Acting on a stale preview is the bug this component exists to prevent on both pages.
    const api = apiWith();
    mount({ api });
    await pickFile('first.xlsx');
    expect(text()).toContain('901234567');

    api.request.mockImplementation(() => new Promise(() => {}));
    await pickFile('second.xlsx');
    expect(text()).not.toContain('901234567');
    expect(confirmButton().disabled).toBe(true);
  });
});
