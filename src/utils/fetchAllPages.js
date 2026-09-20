import api from './api';

/**
 * `api.get` for list endpoints, but returning **every** page instead of only the first.
 *
 * The API paginates at `PAGE_SIZE` (50), so reading `data.results` from a single request
 * silently truncates any longer list. Pages that total their columns from the fetched rows
 * then show *wrong numbers*, not merely fewer rows — which reads as an accounting error
 * rather than a fetch bug. Route list reads through here.
 *
 * The return value is deliberately shaped like an axios response whose `data` is the flat
 * array, so the usual `response.data.results || response.data` call sites keep working
 * unchanged: `results` is undefined on an array, so they fall through to the array itself.
 * `count` is preserved alongside for the few callers that read it.
 *
 * Paging is by page number, not by following the `next` URL: `next` is absolute and carries
 * the backend's own scheme/host, which does not survive a proxy or an http/https mismatch.
 * Existing query params on `url` are preserved. Pages after the first are fetched in
 * parallel. An endpoint with pagination disabled returns a plain array and is passed
 * straight through, so this is safe to use everywhere.
 *
 * `config.onFirstPage` is for lists long enough that waiting for all of them is the delay: it is
 * handed the first page as soon as it arrives, so a page can paint its first rows while the rest
 * are still in flight. The promise still resolves with every row, so a caller that ignores it
 * behaves exactly as before. It is called once, always, including when the first page is the only
 * one — a caller must never have to handle "the callback did not fire" as a separate case.
 *
 * @param {string} url  Path relative to the api baseURL; query string allowed.
 * @param {object} [config]  Extra axios config, plus the optional `onFirstPage` callback.
 * @param {(rows: Array, info: { count: number, done: boolean }) => void} [config.onFirstPage]
 * @returns {Promise<{ data: Array, count: number }>}
 */
export default async function apiGetAll(url, config = {}) {
  // Kept out of the axios config: it is ours, not axios's, and it would otherwise be passed on
  // to every page request as an unknown option.
  const { onFirstPage, ...axiosConfig } = config;
  const announce = (rows, count, done) => {
    if (typeof onFirstPage === 'function') onFirstPage([...rows], { count, done });
  };

  const first = await api.get(url, axiosConfig);
  const body = first.data;

  if (Array.isArray(body)) {
    announce(body, body.length, true);
    return { data: body, count: body.length };
  }
  if (!body || !Array.isArray(body.results)) {
    announce([], 0, true);
    return { data: [], count: 0 };
  }

  const rows = [...body.results];
  const total = Number(body.count);

  if (!body.next || !Number.isFinite(total) || rows.length >= total) {
    const only = Number.isFinite(total) ? total : rows.length;
    announce(rows, only, true);
    return { data: rows, count: only };
  }

  // Announced before the remaining pages are requested, not after: the whole point is that the
  // caller paints these rows while the rest are still travelling.
  announce(rows, total, false);

  const pageSize = rows.length;
  if (pageSize <= 0) return { data: rows, count: total };

  const [path, query = ''] = url.split('?');
  const lastPage = Math.ceil(total / pageSize);

  const requests = [];
  for (let page = 2; page <= lastPage; page += 1) {
    const params = new URLSearchParams(query);
    params.set('page', String(page));
    // `axiosConfig`, not `config`: the latter still carries `onFirstPage`, which is ours and
    // would ride along on every one of these as an unknown axios option.
    requests.push(api.get(`${path}?${params.toString()}`, axiosConfig));
  }

  const responses = await Promise.all(requests);
  for (const res of responses) {
    const chunk = res.data?.results;
    if (Array.isArray(chunk)) rows.push(...chunk);
  }
  return { data: rows, count: total };
}
