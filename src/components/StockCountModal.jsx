import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Modal, { WIDE } from './Modal';
import api from '../utils/api';
import { getCachedProducts } from '../utils/catalogCache';
import { categoryTypeLabel } from '../utils/productCategoryTypes';
import useAppTranslation from '../hooks/useAppTranslation';
import useBarcodeScanner from '../hooks/useBarcodeScanner';
import { normalizeScan } from '../utils/layerBarcode';
import { beepError, beepOk, primeScanBeep } from '../utils/scanBeep';
import StockCountReport from './StockCountReport';

/**
 * Inventarizatsiya — walking the shop with a scanner and putting the books right afterwards.
 *
 * One window with three faces, decided by the count's own status rather than by local state, so
 * closing the page and coming back lands exactly where the work was left:
 *
 *   no count   → choose what is being counted, and start
 *   open       → scan, with a running tally
 *   counted    → what was found
 *
 * **There is no hand-correction box.** The counting table used to carry one, so a miscount or a
 * double scan could be typed over. It was removed at the owner's request; the `set_counted`
 * endpoint behind it is untouched and permission-gated, so putting it back is a matter of wiring
 * a control to it again. Until then the only way out of a scan made in error is to cancel the
 * count and start it again — which costs nothing but the walk, since counting writes nothing.
 *
 * **Nothing in this window changes stock or money.** It used to end with an Apply button that
 * wrote the shortage off; that was removed at the owner's instruction, so a count now records
 * what was seen and stops there. Every count is kept on the Ombor nazorati page, which is where
 * what it found gets read and acted on.
 */
export default function StockCountModal({ open, onClose }) {
  const { t } = useAppTranslation(['inventory', 'common']);

  const [count, setCount] = useState(null);
  const [lines, setLines] = useState([]);
  const [report, setReport] = useState(null);
  const [scope, setScope] = useState('partial');
  const [categoryType, setCategoryType] = useState('');
  const [category, setCategory] = useState('');
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const seqRef = useRef(0);

  const status = count?.status || null;

  const say = useCallback((kind, text) => {
    seqRef.current += 1;
    setFeedback({ kind, text, seq: seqRef.current });
    if (kind === 'ok') beepOk();
    else beepError();
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const loadLines = useCallback(async (id) => {
    const res = await api.get(`/stock-counts/${id}/lines/`);
    setLines(res.data.lines || []);
  }, []);

  const loadReport = useCallback(async (id) => {
    const res = await api.get(`/stock-counts/${id}/report/`);
    setReport(res.data);
  }, []);

  // Resume whatever was left open. A count spans shelves and coffee breaks; the browser is not
  // where it lives.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/stock-counts/open/');
        const existing = res.data.stock_count;
        if (cancelled) return;
        setCount(existing);
        if (existing) await loadLines(existing.id);
      } catch (err) {
        console.error('Error loading stock count:', err);
      }
    })();
    primeScanBeep();
    getCachedProducts(api).then((list) => {
      if (!cancelled) setProducts(list || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, loadLines]);

  // The two dropdowns are cascaded: choosing a type narrows the categories to the ones that
  // actually exist within it, so the operator cannot pick a pair that matches no stock.
  const categoryTypes = useMemo(
    () => [...new Set(products.map((p) => p.category_type).filter(Boolean))].sort(),
    [products],
  );
  const categories = useMemo(() => [...new Set(
    products
      .filter((p) => !categoryType || p.category_type === categoryType)
      .map((p) => p.category)
      .filter(Boolean),
  )].sort(), [products, categoryType]);

  useEffect(() => {
    if (status === 'counted' && count?.id) loadReport(count.id);
  }, [status, count?.id, loadReport]);

  const handleScan = useCallback(async (raw) => {
    const code = normalizeScan(raw);
    if (!code || !count || count.status !== 'open') return;
    try {
      const res = await api.post(`/stock-counts/${count.id}/scan/`, { barcode: code });
      const line = res.data.line;
      const name = line.product_detail
        ? `${line.product_detail.brand} | ${line.product_detail.model} · ${line.product_detail.size}`
        : `#${line.batch_id}`;
      say('ok', t('stockCount.scanned', { name, counted: line.counted_quantity }));
      await loadLines(count.id);
    } catch (err) {
      const msg = err?.response?.data?.error;
      say('error', msg || t('stockCount.scanUnknown', { code }));
    }
  }, [count, say, t, loadLines]);

  useBarcodeScanner({ enabled: open && status === 'open', onScan: handleScan });

  const act = async (fn, label) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      say('error', err?.response?.data?.error || t('stockCount.errGeneric', { step: label }));
    } finally {
      setBusy(false);
    }
  };

  const start = () => act(async () => {
    const res = await api.post('/stock-counts/start/', {
      scope,
      // Narrowing belongs to a partial walk only; «Butun omborni» means the whole shop by
      // definition, and the server refuses the combination outright.
      category_type: scope === 'partial' ? categoryType : '',
      category: scope === 'partial' ? category : '',
    });
    setCount(res.data.stock_count);
    await loadLines(res.data.stock_count.id);
  }, 'start');

  const finish = () => act(async () => {
    const res = await api.post(`/stock-counts/${count.id}/finish/`);
    setCount(res.data.stock_count);
  }, 'finish');

  const cancel = () => act(async () => {
    if (!window.confirm(t('stockCount.confirmCancel'))) return;
    await api.post(`/stock-counts/${count.id}/cancel/`);
    setCount(null);
    setLines([]);
    setReport(null);
  }, 'cancel');

  const productName = (line) => (line.product_detail
    ? `${line.product_detail.brand} | ${line.product_detail.model}`
    : `#${line.batch_id}`);

  const scanned = useMemo(
    () => lines.filter((l) => l.counted_quantity != null)
      .sort((a, b) => b.batch_id - a.batch_id),
    [lines],
  );

  const narrowed = Boolean(count?.category_type || count?.category);

  /**
   * What the counting screen lists.
   *
   * A **narrowed** count shows the whole shelf as a checklist: these are the things that ought to
   * be there, and each turns green as it is found. That is only usable because the category cut
   * the list to a shelf's worth — an unnarrowed count is every layer in the shop, and a list of
   * hundreds would bury the two rows the person is actually looking at, so it keeps showing only
   * what has been scanned.
   *
   * Sorted by product and held there. A checklist that reordered itself every time a box was
   * scanned would lose the operator their place on the shelf, which is the one thing it exists to
   * keep.
   */
  const visibleLines = useMemo(() => {
    if (!narrowed) return scanned;
    return [...lines].sort((a, b) => {
      const byName = productName(a).localeCompare(productName(b));
      if (byName !== 0) return byName;
      return String(a.product_detail?.size || '').localeCompare(
        String(b.product_detail?.size || ''),
      );
    });
  }, [narrowed, lines, scanned]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('stockCount.title')}
      closeLabel={t('actions.close', { ns: 'common' })}
      width={WIDE}
      closeOnBackdrop={false}
    >
      <div
        className={`scan-strip__feedback scan-strip__feedback--${feedback?.kind === 'ok' ? 'added' : (feedback?.kind || 'idle')}`}
        role="status"
        aria-live="polite"
        style={{ display: 'block', minHeight: 20, marginBottom: 8 }}
      >
        {feedback?.text || ''}
      </div>

      {/* ---- nothing open yet: say what is being counted ------------------------------ */}
      {!count && (
        <div>
          <p style={{ color: '#666', marginBottom: 12 }}>{t('stockCount.intro')}</p>
          <div className="form-group">
            <label>{t('stockCount.scopeLabel')}</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="partial">{t('stockCount.scopePartial')}</option>
              <option value="full">{t('stockCount.scopeFull')}</option>
            </select>
            {/*
              The dangerous option, named plainly. A full count treats anything never scanned as
              gone, so choosing it by accident on a half-walked shop would write off the rest.
            */}
            <small className={scope === 'full' ? 'stock-count__warn' : 'label-print__hint'}>
              {scope === 'full' ? t('stockCount.scopeFullWarn') : t('stockCount.scopePartialHint')}
            </small>
          </div>

          {/* Only on a partial walk. A full count covers the shop by definition, so offering to
              narrow it would be offering something the server refuses. */}
          {scope === 'partial' && (
            <>
              <div className="form-group">
                <label>{t('stockCount.categoryType')}</label>
                <select
                  value={categoryType}
                  onChange={(e) => { setCategoryType(e.target.value); setCategory(''); }}
                >
                  <option value="">{t('stockCount.allCategories')}</option>
                  {categoryTypes.map((c) => (
                    // The stored value is English (`sports`, `casual`); the shop reads Uzbek.
                    // `categoryTypeLabel` is what every other page already uses for it.
                    <option key={c} value={c}>{categoryTypeLabel(c, t)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('stockCount.category')}</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{t('stockCount.allCategories')}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <small className="label-print__hint">
                  {categoryType || category
                    ? t('stockCount.narrowedHint')
                    : t('stockCount.wholeShopHint')}
                </small>
              </div>
            </>
          )}
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={start} disabled={busy}>
              {t('stockCount.start')}
            </button>
          </div>
        </div>
      )}

      {/* ---- counting -------------------------------------------------------------------- */}
      {status === 'open' && (
        <div>
          <p style={{ color: '#666', marginBottom: 12 }}>
            {t('stockCount.scanning', {
              scope: t(count.scope === 'full' ? 'stockCount.scopeFull' : 'stockCount.scopePartial'),
              scanned: scanned.length,
              total: lines.length,
            })}
            {/* A narrowed walk names its shelf, because resuming after a break otherwise looks
                identical to a whole-shop count that is mysteriously short of layers. */}
            {narrowed ? (
              <strong>
                {' · '}
                {[categoryTypeLabel(count.category_type, t), count.category]
                  .filter(Boolean).join(' / ')}
              </strong>
            ) : null}
          </p>
          {narrowed ? (
            <p className="label-print__hint" style={{ marginBottom: 10 }}>
              {t('stockCount.checklistHint')}
            </p>
          ) : null}
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('table.layerNo')}</th>
                  <th>{t('table.product')}</th>
                  <th>{t('table.size')}</th>
                  <th>{t('stockCount.counted')}</th>
                  <th>{t('stockCount.systemNow')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center' }}>
                    {narrowed ? t('stockCount.shelfEmpty') : t('stockCount.nothingYet')}
                  </td></tr>
                ) : visibleLines.map((line) => (
                  // Green once it has been found. On a checklist that is the whole point: what is
                  // left plain is what is still to look for.
                  <tr
                    key={line.id}
                    className={line.counted_quantity != null ? 'stock-count-row--found' : ''}
                  >
                    <td>#{line.batch_id}</td>
                    <td>{productName(line)}</td>
                    <td>{line.product_detail?.size || '-'}</td>
                    <td>
                      {line.counted_quantity == null
                        ? <span className="stock-count-pending">—</span>
                        : <strong>{line.counted_quantity}</strong>}
                    </td>
                    <td>{line.system_now}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={finish} disabled={busy}>
              {t('stockCount.finish')}
            </button>
            <button type="button" className="btn-edit" onClick={cancel} disabled={busy}>
              {t('stockCount.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ---- the result, and the decision ----------------------------------------------- */}
      {(status === 'counted' || status === 'applied') && report && (
        <StockCountReport report={report} status={status} onClose={onClose} />
      )}
    </Modal>
  );
}
