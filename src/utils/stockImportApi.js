/**
 * The three calls behind "fill Ombor from Excel": take the template, see what a file would buy, buy it.
 *
 * The same two `api.js` hazards as the Mahsulotlar import, and they matter more here because this
 * import spends money:
 *
 *  * **The instance pins `Content-Type: application/json`.** Axios will not add a multipart boundary
 *    while that header is set, and the server reads an empty form.
 *  * **`dedupeWrites` keys on `JSON.stringify(body)`, and a FormData stringifies to `"{}"`.** Two
 *    different files posted to the same URL would share a key, so the second gets the first one's
 *    answer. On this import that means confirming a preview of the file you just replaced — and
 *    buying the wrong stock with real cash. `api.request` is not one of the four methods that wrapper
 *    patches, and `writeKey` also opts FormData out; both, because one is not enough.
 *
 * The commit is a plain `api.post` and *wants* the dedupe: a double-click on Confirm must collapse
 * into one purchase, not two.
 */

/** Upload a filled template and get back what it would buy, and what it would cost. Buys nothing. */
export function previewStockImport(api, file) {
  const form = new FormData();
  form.append('file', file);
  return api.request({
    method: 'post',
    url: '/inventory/import_preview/',
    data: form,
    headers: { 'Content-Type': undefined },
  });
}

/**
 * Buy the previewed rows.
 *
 * Only each row's own values and its row number go back. The server matches the rows to products
 * again and re-decides every one, so there is no point sending the verdict it gave us — and no way to
 * talk it into buying against a product the file did not name.
 */
export function commitStockImport(api, rows) {
  return api.post('/inventory/import_commit/', { rows });
}

/** The empty workbook, with its headings in the language the screen is in. */
export function downloadStockTemplate(api, lang) {
  return api.get('/inventory/import_template/', {
    params: { lang },
    responseType: 'blob',
  });
}
