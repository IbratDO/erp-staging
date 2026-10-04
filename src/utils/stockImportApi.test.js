/**
 * Uploading a stock file through an api client that pins JSON and de-duplicates writes.
 *
 * The same two hazards as the Mahsulotlar import, but the stakes are different: this import spends
 * money, so a preview of the *previous* file is not a cosmetic bug — it is confirming a purchase of
 * stock you did not choose. `dedupeWrites` keys on `JSON.stringify(body)`, and every FormData
 * stringifies to `"{}"`, so two different files posted to one URL would share a key.
 */
import {
  commitStockImport,
  downloadStockTemplate,
  previewStockImport,
} from './stockImportApi';

const fileNamed = (name) => new File(['x'], name, { type: 'application/octet-stream' });

describe('uploading a stock file for preview', () => {
  it('sends it as a form with the JSON content type cleared', async () => {
    const api = { request: jest.fn().mockResolvedValue({ data: {} }) };
    await previewStockImport(api, fileNamed('ombor.xlsx'));

    const [config] = api.request.mock.calls[0];
    expect(config.url).toBe('/inventory/import_preview/');
    expect(config.data).toBeInstanceOf(FormData);
    expect(config.data.get('file').name).toBe('ombor.xlsx');
    expect(config.headers).toHaveProperty('Content-Type');
    expect(config.headers['Content-Type']).toBeUndefined();
  });

  it('goes through request, not post, so the write dedupe cannot collapse two uploads', async () => {
    const api = { request: jest.fn().mockResolvedValue({ data: {} }), post: jest.fn() };
    await previewStockImport(api, fileNamed('ombor.xlsx'));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends each file separately when the wrong one is replaced', async () => {
    // The regression that matters here: the second preview must describe the second file.
    const api = { request: jest.fn().mockResolvedValue({ data: {} }) };
    await previewStockImport(api, fileNamed('wrong.xlsx'));
    await previewStockImport(api, fileNamed('right.xlsx'));

    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request.mock.calls.map(([c]) => c.data.get('file').name))
      .toEqual(['wrong.xlsx', 'right.xlsx']);
  });
});

describe('buying the previewed rows', () => {
  it('posts them as ordinary JSON', async () => {
    // Plain api.post on purpose: here the dedupe is wanted, so a double-click is one purchase.
    const api = { post: jest.fn().mockResolvedValue({ data: {} }) };
    const rows = [{ row_num: 2, brand: 'Nike' }];
    await commitStockImport(api, rows);
    expect(api.post).toHaveBeenCalledWith('/inventory/import_commit/', { rows });
  });
});

describe('downloading the template', () => {
  it('asks for a blob in the current language', async () => {
    const api = { get: jest.fn().mockResolvedValue({ data: new Blob() }) };
    await downloadStockTemplate(api, 'ru');
    expect(api.get).toHaveBeenCalledWith('/inventory/import_template/', {
      params: { lang: 'ru' },
      responseType: 'blob',
    });
  });
});
