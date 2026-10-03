/**
 * Uploading a file through an api client that was never built for one.
 *
 * Two things in `api.js` quietly break a multipart post, and both are the kind that fail without an
 * error message:
 *
 *  * the instance pins `Content-Type: application/json`, and axios will not add a multipart boundary
 *    while that header is set — the server then reads an empty form;
 *  * `dedupeWrites` keys on `JSON.stringify(body)`, and every FormData stringifies to `"{}"`, so two
 *    *different* files posted to one URL share a key and the second is handed the first one's promise.
 *    Pick the wrong file, fix it, upload again, and you are reading a preview of the file you replaced.
 *
 * The second is the one worth a test, because nothing about it looks wrong on screen.
 */
import {
  commitProductImport,
  downloadProductTemplate,
  previewProductImport,
} from './productImportApi';

const fileNamed = (name) => new File(['x'], name, { type: 'application/octet-stream' });

describe('uploading a file for preview', () => {
  it('sends it as a form, with the JSON content type cleared', async () => {
    const api = { request: jest.fn().mockResolvedValue({ data: {} }) };
    await previewProductImport(api, fileNamed('a.xlsx'));

    const [config] = api.request.mock.calls[0];
    expect(config.method).toBe('post');
    expect(config.url).toBe('/products/import_preview/');
    expect(config.data).toBeInstanceOf(FormData);
    expect(config.data.get('file').name).toBe('a.xlsx');
    // Set, and set to undefined: axios only adds the boundary when no content type is pinned.
    expect(config.headers).toHaveProperty('Content-Type');
    expect(config.headers['Content-Type']).toBeUndefined();
  });

  it('goes through request, not post, so the write dedupe cannot collapse two uploads', async () => {
    // `dedupeWrites` patches post/put/patch/delete and leaves `request` alone. If this ever moves to
    // api.post, the FormData guard in writeKey is the second line of defence — see apiDedupe.test.js.
    const api = { request: jest.fn().mockResolvedValue({ data: {} }), post: jest.fn() };
    await previewProductImport(api, fileNamed('a.xlsx'));
    expect(api.post).not.toHaveBeenCalled();
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('sends each file separately when two are uploaded one after the other', async () => {
    const api = { request: jest.fn().mockResolvedValue({ data: {} }) };
    await previewProductImport(api, fileNamed('wrong.xlsx'));
    await previewProductImport(api, fileNamed('right.xlsx'));

    expect(api.request).toHaveBeenCalledTimes(2);
    const names = api.request.mock.calls.map(([c]) => c.data.get('file').name);
    expect(names).toEqual(['wrong.xlsx', 'right.xlsx']);
  });
});

describe('saving the previewed rows', () => {
  it('posts them as ordinary JSON', async () => {
    // Plain api.post on purpose: here the dedupe is wanted, so a double-click on Confirm is one import.
    const api = { post: jest.fn().mockResolvedValue({ data: {} }) };
    const rows = [{ row_num: 2, brand: 'Nike' }];
    await commitProductImport(api, rows);
    expect(api.post).toHaveBeenCalledWith('/products/import_commit/', { rows });
  });
});

describe('downloading the template', () => {
  it('asks for a blob in the current language', async () => {
    const api = { get: jest.fn().mockResolvedValue({ data: new Blob() }) };
    await downloadProductTemplate(api, 'ru');
    expect(api.get).toHaveBeenCalledWith('/products/import_template/', {
      params: { lang: 'ru' },
      responseType: 'blob',
    });
  });
});
