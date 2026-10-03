/**
 * The three calls behind "fill Mahsulotlar from Excel": take the template, see what a file would do,
 * then save it.
 *
 * This is the project's first file upload, and two things in `api.js` stand in the way of one:
 *
 *  * **The instance pins `Content-Type: application/json`.** Axios will not add a multipart boundary
 *    while an explicit content type is set, and the server then reads an empty form. Passing
 *    `undefined` for that header on this one request lets the browser set it properly.
 *  * **`dedupeWrites` keys on `JSON.stringify(body)`, and a FormData stringifies to `"{}"`.** Two
 *    *different* files posted to the same URL therefore share a key, so the second silently receives
 *    the first one's promise — pick the wrong file, fix it, re-upload, and you are looking at a
 *    preview of the file you just replaced. `api.request` is not one of the four methods that wrapper
 *    patches, so the upload goes through it. `writeKey` is hardened too, for the next upload that
 *    reaches for `api.post` without reading this comment.
 *
 * The commit, by contrast, is an ordinary `api.post` and *wants* the dedupe: a double-click on the
 * confirm button should collapse into one import, not two.
 */

/** Upload a filled template and get back what it would do. Writes nothing on the server. */
export function previewProductImport(api, file) {
  const form = new FormData();
  form.append('file', file);
  return api.request({
    method: 'post',
    url: '/products/import_preview/',
    data: form,
    headers: { 'Content-Type': undefined },
  });
}

/**
 * Save the previewed rows.
 *
 * Only the six values and the row number go back. The server re-decides every row from the database,
 * so there is no point sending the verdict it gave us — and no way to talk it into something else.
 */
export function commitProductImport(api, rows) {
  return api.post('/products/import_commit/', { rows });
}

/** The empty workbook, with its headings in the language the screen is in. */
export function downloadProductTemplate(api, lang) {
  return api.get('/products/import_template/', {
    params: { lang },
    responseType: 'blob',
  });
}

/** Hand the browser a file to save. Same object-URL dance as the CSV export in `tableCsv`. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
