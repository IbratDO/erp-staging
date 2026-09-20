/**
 * Reading a list that is longer than one page.
 *
 * The API paginates at 50. A caller that reads `data.results` from a single request gets the
 * first 50 rows and no indication that more exist — and pages which total their columns from the
 * fetched rows then display *wrong numbers*, not merely fewer rows. That reads as an accounting
 * error rather than a fetch bug, which is why every list read goes through this helper.
 *
 * Seventeen pages depend on it and, until these tests, nothing pinned it. They were written
 * against the helper as it already stood — characterising what it does before anything was added
 * to it — so they describe real behaviour rather than restating a change.
 *
 * Like `apiDedupe.test.js`, these drive the real axios instance and swap only its adapter. What
 * is exercised is therefore the helper as shipped, and counting adapter calls counts the requests
 * that actually left the browser.
 */
import api from './api';
import apiGetAll from './fetchAllPages';

/** A page of `count` total rows, `size` of them present, as DRF would send it. */
function page(rows, count, { next = null } = {}) {
  return { results: rows, count, next };
}

/**
 * Answer each request from a map of page number -> body, recording what was asked for.
 *
 * Requests resolve immediately: unlike the dedupe tests there is no window to hold open, and the
 * helper fires pages 2..N together, so the interesting question is what was requested, not when.
 */
function recordingAdapter(bodyForPage) {
  const calls = [];
  const adapter = (config) => {
    const url = config.baseURL ? `${config.baseURL}${config.url}` : config.url;
    const qs = new URLSearchParams((config.url.split('?')[1] || ''));
    const fromParams = config.params && config.params.page;
    const pageNum = Number(qs.get('page') || fromParams || 1);
    calls.push({ config, url, pageNum, params: { ...(config.params || {}) }, query: qs });
    return Promise.resolve({
      data: bodyForPage(pageNum),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
  adapter.calls = calls;
  return adapter;
}

/**
 * The rows the server would put on page `pageNum`.
 *
 * `stride` is how many rows a *full* page holds and `size` how many this page actually carries —
 * they differ only on the last page. Deriving the ids from `size` instead would renumber a short
 * final page on top of rows the earlier pages already returned, which is a fault in the stub that
 * looks exactly like the helper dropping and duplicating rows.
 */
const rowsFor = (pageNum, size = 50, stride = 50) =>
  Array.from({ length: size }, (_, i) => ({ id: (pageNum - 1) * stride + i + 1 }));

describe('a list that fits on one page', () => {
  test('one request, and the rows come back as a flat array', async () => {
    const adapter = recordingAdapter(() => page(rowsFor(1, 12), 12));
    api.defaults.adapter = adapter;

    const res = await apiGetAll('/dispatches/');

    expect(adapter.calls).toHaveLength(1);
    expect(res.data).toHaveLength(12);
    expect(res.count).toBe(12);
  });

  test('an endpoint with pagination switched off is passed straight through', async () => {
    // Several viewsets set `pagination_class = None` deliberately and answer with a bare array.
    // The helper has to stay safe to use on those, or it could not be the single list read.
    const bare = [{ id: 1 }, { id: 2 }];
    const adapter = recordingAdapter(() => bare);
    api.defaults.adapter = adapter;

    const res = await apiGetAll('/returns/');

    expect(adapter.calls).toHaveLength(1);
    expect(res.data).toEqual(bare);
    expect(res.count).toBe(2);
  });
});

describe('a list longer than one page', () => {
  test('every page is fetched and the rows are concatenated in page order', async () => {
    // 3 pages of 50 = 137 rows. The order matters: a list the server sorted must not be
    // reassembled out of order just because pages 2 and 3 are fetched in parallel.
    const adapter = recordingAdapter((p) =>
      page(p === 3 ? rowsFor(3, 37, 50) : rowsFor(p, 50), 137, { next: p < 3 ? 'x' : null }),
    );
    api.defaults.adapter = adapter;

    const res = await apiGetAll('/sales/');

    expect(adapter.calls).toHaveLength(3);
    expect(res.data).toHaveLength(137);
    expect(res.count).toBe(137);
    expect(res.data.map((r) => r.id)).toEqual(
      Array.from({ length: 137 }, (_, i) => i + 1),
    );
  });

  test('later pages are asked for by page number', async () => {
    // Deliberately not by following `next`: that URL is absolute and carries the backend's own
    // scheme and host, which does not survive a proxy or an http/https mismatch.
    const adapter = recordingAdapter((p) =>
      page(rowsFor(p, 50), 100, { next: p < 2 ? 'http://backend:8000/api/sales/?page=2' : null }),
    );
    api.defaults.adapter = adapter;

    await apiGetAll('/sales/');

    const second = adapter.calls.find((c) => c.pageNum === 2);
    expect(second).toBeDefined();
    expect(second.url).not.toContain('backend:8000');
  });

  test('a caller filter survives onto every page', async () => {
    // The trap: fetch page 1 filtered and pages 2..N unfiltered, and the extra rows are rows the
    // caller excluded — so the list silently contradicts its own filter.
    const adapter = recordingAdapter((p) =>
      page(rowsFor(p, 50), 100, { next: p < 2 ? 'x' : null }),
    );
    api.defaults.adapter = adapter;

    await apiGetAll('/sales/', { params: { lite: 1, open: 0 } });

    expect(adapter.calls).toHaveLength(2);
    for (const call of adapter.calls) {
      expect(call.params.lite).toBe(1);
      expect(call.params.open).toBe(0);
    }
  });

  test('a query string already on the url is preserved on later pages', async () => {
    const adapter = recordingAdapter((p) =>
      page(rowsFor(p, 50), 100, { next: p < 2 ? 'x' : null }),
    );
    api.defaults.adapter = adapter;

    await apiGetAll('/sales/?status=completed');

    const second = adapter.calls.find((c) => c.pageNum === 2);
    expect(second.query.get('status')).toBe('completed');
  });
});

describe('answers that are not a list at all', () => {
  test('a body with no results array yields nothing rather than throwing', async () => {
    // Defensive: a caller mid-refactor pointing this at a detail endpoint should get an empty
    // list and a visibly empty table, not a crash that takes the whole page down.
    const adapter = recordingAdapter(() => ({ detail: 'Not found' }));
    api.defaults.adapter = adapter;

    const res = await apiGetAll('/sales/1/');

    expect(res.data).toEqual([]);
    expect(res.count).toBe(0);
  });
});

describe('handing the first page over early', () => {
  /*
    For lists long enough that waiting for all of them is the delay. Dostavkalar sorts the
    deliveries still needing work to the top, so the first page is the rows worth showing first;
    the page paints those and lets the rest arrive behind them.
  */
  test('the first page is offered before the remaining pages are requested', async () => {
    const seen = [];
    const adapter = recordingAdapter((p) =>
      page(p === 3 ? rowsFor(3, 37, 50) : rowsFor(p, 50), 137, { next: p < 3 ? 'x' : null }),
    );
    api.defaults.adapter = adapter;

    const res = await apiGetAll('/dispatches/', {
      onFirstPage: (rows, info) =>
        seen.push({ rows: rows.length, ...info, requestsSoFar: adapter.calls.length }),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].rows).toBe(50);
    expect(seen[0].count).toBe(137);
    expect(seen[0].done).toBe(false);
    // The point of the whole thing: called while only page 1 had been asked for.
    expect(seen[0].requestsSoFar).toBe(1);
    // And the promise still resolves with everything, so a caller gets both.
    expect(res.data).toHaveLength(137);
  });

  test('it still fires when the list fits on one page, and says so', async () => {
    // A caller must never have to treat "the callback did not fire" as its own case, or every
    // short list would leave the page stuck on its loading state.
    const seen = [];
    const adapter = recordingAdapter(() => page(rowsFor(1, 12), 12));
    api.defaults.adapter = adapter;

    await apiGetAll('/dispatches/', { onFirstPage: (rows, info) => seen.push({ n: rows.length, ...info }) });

    expect(seen).toEqual([{ n: 12, count: 12, done: true }]);
  });

  test('it fires for an endpoint with pagination switched off', async () => {
    const seen = [];
    api.defaults.adapter = recordingAdapter(() => [{ id: 1 }, { id: 2 }]);

    await apiGetAll('/returns/', { onFirstPage: (rows, info) => seen.push({ n: rows.length, ...info }) });

    expect(seen).toEqual([{ n: 2, count: 2, done: true }]);
  });

  test('it fires even when the answer is not a list, so the caller stops waiting', async () => {
    const seen = [];
    api.defaults.adapter = recordingAdapter(() => ({ detail: 'Not found' }));

    await apiGetAll('/sales/1/', { onFirstPage: (rows, info) => seen.push({ n: rows.length, ...info }) });

    expect(seen).toEqual([{ n: 0, count: 0, done: true }]);
  });

  test('the rows handed over are a copy, not the array being assembled', async () => {
    // The caller puts these straight into React state. If it were the same array the helper is
    // still pushing later pages onto, that state would mutate underneath the render.
    let handed = null;
    api.defaults.adapter = recordingAdapter((p) =>
      page(rowsFor(p, 50), 100, { next: p < 2 ? 'x' : null }),
    );

    const res = await apiGetAll('/sales/', { onFirstPage: (rows) => { handed = rows; } });

    expect(handed).toHaveLength(50);
    expect(res.data).toHaveLength(100);
    expect(handed).not.toBe(res.data);
  });

  test('the callback is never passed on to axios', async () => {
    // It is ours, not axios's. Left in the config it would ride along on every page request as
    // an unknown option.
    const adapter = recordingAdapter((p) =>
      page(rowsFor(p, 50), 100, { next: p < 2 ? 'x' : null }),
    );
    api.defaults.adapter = adapter;

    await apiGetAll('/sales/', { params: { lite: 1 }, onFirstPage: () => {} });

    expect(adapter.calls).toHaveLength(2);
    for (const call of adapter.calls) {
      expect(call.config.onFirstPage).toBeUndefined();
      expect(call.params.lite).toBe(1);
    }
  });

  test('a caller that passes nothing is completely unaffected', async () => {
    // The seventeen existing callers.
    const adapter = recordingAdapter((p) =>
      page(rowsFor(p, 50), 100, { next: p < 2 ? 'x' : null }),
    );
    api.defaults.adapter = adapter;

    const res = await apiGetAll('/sales/');

    expect(adapter.calls).toHaveLength(2);
    expect(res.data).toHaveLength(100);
    expect(res.count).toBe(100);
  });
});
