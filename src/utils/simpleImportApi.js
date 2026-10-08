/**
 * The three import calls, for a page whose rows cost nothing to get wrong.
 *
 * Mahsulotlar, Mijozlar and Asosiy vositalar all want the same three endpoints under a different
 * base path, so this builds them rather than keeping a fourth near-copy. The Ombor import keeps its
 * own module, because its preview carries the cash panel and its confirm filters two verdicts.
 *
 * Both `api.js` hazards are handled here once, and they are the reason this file exists at all:
 *
 *  * **The axios instance pins `Content-Type: application/json`.** It will not add a multipart
 *    boundary while that header is set, and the server then reads an empty form.
 *  * **`dedupeWrites` keys on `JSON.stringify(body)`, and every FormData stringifies to `"{}"`.**
 *    Two different files posted to one URL would share a key, so the second would be handed the
 *    first one's answer — a preview of the file you just replaced. Going through `api.request`,
 *    which that wrapper does not patch, avoids it; `writeKey` also opts FormData out.
 *
 * The commit stays a plain `api.post` and *wants* the dedupe, so a double-click is one import.
 */
export function makeImportApi(base) {
  return {
    preview(api, file) {
      const form = new FormData();
      form.append('file', file);
      return api.request({
        method: 'post',
        url: `${base}/import_preview/`,
        data: form,
        headers: { 'Content-Type': undefined },
      });
    },

    /** Only each row's own values and its row number. The server re-decides every verdict. */
    commit(api, rows) {
      return api.post(`${base}/import_commit/`, { rows });
    },

    template(api, lang) {
      return api.get(`${base}/import_template/`, { params: { lang }, responseType: 'blob' });
    },
  };
}

export const customerImportApi = makeImportApi('/customers');
export const fixedAssetImportApi = makeImportApi('/fixed-assets');
