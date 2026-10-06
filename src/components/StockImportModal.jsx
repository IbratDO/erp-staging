import React, { useCallback, useMemo, useRef, useState } from 'react';
import Modal, { WIDE } from './Modal';
import ActionButton from './ActionButton';
import { saveBlob } from '../utils/productImportApi';
import { formatPlainAmount } from '../utils/currencyFormat';
import {
  commitStockImport,
  downloadStockTemplate,
  previewStockImport,
} from '../utils/stockImportApi';

/**
 * The verdicts that spend money. **Both** of them: a row creating a product buys stock too.
 *
 * This was `=== 'buy'` and dropped every create row on the way to the server, so a file of nothing
 * but new products sent an empty list and came back "rows must be a non-empty array". The server
 * keeps the same pair in `inventory_import.BUYING`; if a third verdict is ever added, both lists
 * have to learn it.
 */
const BUYS = ['buy', 'create_and_buy'];

/**
 * Buying a delivery's worth of stock from a spreadsheet.
 *
 * The Mahsulotlar version of this dialog could only ever produce a wrong list. **This one spends the
 * shop's money**, and a layer can only be cancelled one at a time — and not at all once a unit of it
 * has sold. So this dialog carries one thing that one does not: the money panel.
 *
 * It states what the file will spend in each currency, what the till holds, and what the till will
 * read afterwards, every time — not only when something is wrong. With no bulk undo, that line is the
 * last chance to notice a misplaced decimal point before the cash is gone.
 *
 * A till too short to cover the file is **not** a blocker: the owner's decision is that stock may be
 * loaded before the till is topped up, so the shortfall is shown as a warning and Confirm stays live.
 * A bad *row* is a blocker, because the server buys all rows or none.
 */
export default function StockImportModal({ open, onClose, api, t, lang, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    setRowErrors([]);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const messageOf = (err, fallback) =>
    err?.response?.data?.error || err?.response?.data?.detail || fallback;

  const getTemplate = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await downloadStockTemplate(api, lang);
      saveBlob(res.data, 'ombor_shablon.xlsx');
    } catch (err) {
      setError(messageOf(err, t('importExcel.templateFailed')));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (picked) => {
    // Each pick starts over: the previous preview describes a file that is no longer selected, and on
    // a money import acting on a stale preview is the worst outcome available.
    setPreview(null);
    setResult(null);
    setError('');
    setRowErrors([]);
    setFile(picked || null);
    if (!picked) return;
    setBusy(true);
    try {
      const res = await previewStockImport(api, picked);
      setPreview(res.data);
    } catch (err) {
      setError(messageOf(err, t('importExcel.readFailed')));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview?.can_commit) return;
    setBusy(true);
    setError('');
    setRowErrors([]);
    try {
      const rows = preview.rows
        .filter((r) => BUYS.includes(r.action))
        .map((r) => ({ row_num: r.row_num, ...r.values }));
      const res = await commitStockImport(api, rows);
      setResult(res.data);
      setPreview(null);
      if (onImported) onImported(res.data);
    } catch (err) {
      const data = err?.response?.data;
      setError(messageOf(err, t('importExcel.saveFailed')));
      setRowErrors(Array.isArray(data?.item_errors) ? data.item_errors : []);
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;
  const rows = preview?.rows || [];

  /**
   * Money the way every other screen writes it: digits grouped in threes, soum whole, dollars to
   * the cent. `formatPlainAmount` does the grouping by hand rather than through `toLocaleString`,
   * so the same figure does not read one way on the counter PC and another in the office.
   *
   * A blank cell stays blank. A cost column the owner left empty was showing `0`, which reads as a
   * deliberate zero cost — the one thing a stock row must never claim by accident.
   */
  const money = (raw, digits) =>
    (raw === '' || raw === null || raw === undefined ? '—' : formatPlainAmount(raw, digits));
  const uzs = (raw) => money(raw, 0);
  const usd = (raw) => money(raw, 2);

  const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const actionLabel = {
    buy: t('importExcel.willBuy'),
    create_and_buy: t('importExcel.willCreateAndBuy'),
    error: t('importExcel.hasProblem'),
  };
  // The create verdict gets its own colour: it is the one that changes Mahsulotlar as well.
  const actionColor = { buy: '#2f855a', create_and_buy: '#2b6cb0', error: '#c53030' };

  const moneyRows = useMemo(() => {
    if (!summary) return null;
    return [
      { key: 'spend', label: t('importExcel.willSpend') },
      { key: 'till', label: t('importExcel.tillNow') },
      { key: 'after', label: t('importExcel.tillAfter') },
    // Guarded: a money dialog that throws renders nothing at all, which is a worse failure
    // than a missing figure if a response ever arrives without one of these.
    ].map((r) => ({
      ...r,
      usd: usd(summary[r.key]?.usd),
      uzs: uzs(summary[r.key]?.uzs),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, t]);

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('importExcel.title')}
      closeLabel={t('actions.close', { ns: 'common' })}
      closeOnBackdrop={false}
      width={WIDE}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, color: '#4a5568', fontSize: '0.9em' }}>{t('importExcel.intro')}</p>

        <div className="form-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <ActionButton type="button" className="btn-edit btn-dialog" onClick={getTemplate}
                        disabled={busy}>
            {t('importExcel.downloadTemplate')}
          </ActionButton>
          <ActionButton type="button" className="btn-primary btn-dialog" disabled={busy}
                        onClick={() => fileRef.current?.click()}>
            {t('importExcel.chooseFile')}
          </ActionButton>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            aria-label={t('importExcel.chooseFile')}
            disabled={busy}
            style={{ display: 'none' }}
            onChange={(e) => choose(e.target.files?.[0] || null)}
          />
          <span style={{ color: file ? '#2c3e50' : '#718096', fontSize: '0.88em' }}>
            {file ? file.name : t('importExcel.noFileChosen')}
          </span>
        </div>

        <p style={{ margin: 0, color: '#b7791f', fontSize: '0.82em', fontWeight: 600 }}>
          {t('importExcel.spendsMoneyNote')}
        </p>

        {error ? <div style={{ color: '#c53030', fontSize: '0.9em' }}>{error}</div> : null}

        {rowErrors.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, color: '#c53030', fontSize: '0.85em' }}>
            {rowErrors.map((item) => (
              <li key={item.row_num ?? item.index}>
                {t('importExcel.rowLabel', { row: item.row_num ?? item.index })}
                {': '}
                {Array.isArray(item.errors) ? item.errors.join(' ') : String(item.errors ?? '')}
              </li>
            ))}
          </ul>
        ) : null}

        {/* The money panel. Shown whenever there is a preview, not only when something is wrong. */}
        {moneyRows ? (
          <table className="data-table" style={{ maxWidth: 640 }}>
            <thead>
              <tr>
                <th />
                <th style={{ textAlign: 'right' }}>USD</th>
                <th style={{ textAlign: 'right' }}>UZS</th>
              </tr>
            </thead>
            <tbody>
              {moneyRows.map((r) => {
                const negative = r.key === 'after'
                  && (summary.goes_negative?.usd || summary.goes_negative?.uzs);
                return (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td style={{
                      textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: r.key === 'after' && summary.goes_negative?.usd ? '#c53030' : undefined,
                      fontWeight: negative ? 700 : undefined,
                    }}>{r.usd}</td>
                    <td style={{
                      textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: r.key === 'after' && summary.goes_negative?.uzs ? '#c53030' : undefined,
                      fontWeight: negative ? 700 : undefined,
                    }}>{r.uzs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}

        {summary ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.85em' }}>
            <Chip color="#2f855a" label={t('importExcel.countBuy', { count: summary.to_buy })} />
            <Chip color="#2b6cb0" label={t('importExcel.countUnits', { count: summary.total_units })} />
            {summary.to_create_products ? (
              <Chip color="#2b6cb0"
                    label={t('importExcel.countNewProducts', { count: summary.to_create_products })} />
            ) : null}
            {summary.errors ? (
              <Chip color="#c53030" label={t('importExcel.countError', { count: summary.errors })} />
            ) : null}
          </div>
        ) : null}

        {(preview?.blockers || []).map((b) => (
          <div key={b} style={{ color: '#c53030', fontSize: '0.85em' }}>{b}</div>
        ))}
        {(preview?.warnings || []).map((w) => (
          <div key={w} style={{ color: '#b7791f', fontSize: '0.85em' }}>{w}</div>
        ))}

        {rows.length ? (
          <div className="data-table-scroll" style={{ maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('importExcel.rowColumn')}</th>
                  <th>{t('importExcel.whatHappens')}</th>
                  <th>{t('importExcel.product')}</th>
                  <th style={{ textAlign: 'right' }}>{t('importExcel.qty')}</th>
                  {/* Unit cost and line total are separate columns on purpose: one number beside a
                      quantity of 4 reads as the price of one, and it is the price of four. */}
                  <th style={{ textAlign: 'right' }}>{t('importExcel.unitCostUzs')}</th>
                  <th style={{ textAlign: 'right' }}>{t('importExcel.unitCostUsd')}</th>
                  <th style={{ textAlign: 'right' }}>{t('importExcel.totalUzs')}</th>
                  <th style={{ textAlign: 'right' }}>{t('importExcel.totalUsd')}</th>
                  {/* Both of these overwrite what the product already carries, so they belong on the
                      screen where the owner approves the purchase. */}
                  <th style={{ textAlign: 'right' }}>{t('importExcel.sellingPrice')}</th>
                  <th>{t('importExcel.whereFrom')}</th>
                  <th>{t('importExcel.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row_num}>
                    <td>{r.row_num}</td>
                    <td style={{ color: actionColor[r.action], fontWeight: 600 }}>
                      {actionLabel[r.action]}
                    </td>
                    <td>{r.product_label
                      || [r.values.brand, r.values.model, r.values.size, r.values.color]
                        .filter(Boolean).join(' / ')}</td>
                    <td style={{ textAlign: 'right' }}>{r.values.quantity}</td>
                    <td style={num}>{uzs(r.values.cost_uzs)}</td>
                    <td style={num}>{usd(r.values.cost_usd)}</td>
                    {/* A total is only a figure when a cost was given in that currency; otherwise the
                        server's 0 would read as a free line. */}
                    <td style={num}>{r.values.cost_uzs ? uzs(r.line_total_uzs) : '—'}</td>
                    <td style={num}>{r.values.cost_usd ? usd(r.line_total_usd) : '—'}</td>
                    <td style={num}>
                      {r.values.selling_price
                        ? `${r.values.selling_price} ${r.values.selling_price_currency || ''}`.trim()
                        : '—'}
                    </td>
                    <td>{r.values.location || '—'}</td>
                    <td style={{ fontSize: '0.85em' }}>
                      {r.errors.length
                        ? <span style={{ color: '#c53030' }}>{r.errors.join(' ')}</span>
                        : (r.warnings || []).map((w) => (
                            <div key={w} style={{ color: '#b7791f' }}>{w}</div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div style={{ color: '#2f855a', fontSize: '0.9em' }}>
            {t('importExcel.done', {
              bought: result.bought,
              units: result.units,
              usd: result.spent.usd,
              uzs: result.spent.uzs,
            })}
          </div>
        ) : null}

        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          {file && !result ? (
            <ActionButton type="button" className="btn-edit btn-dialog" onClick={reset}
                          disabled={busy}>
              {t('importExcel.startOver')}
            </ActionButton>
          ) : null}
          <ActionButton
            type="button"
            className="btn-primary btn-dialog"
            onClick={confirm}
            disabled={busy || !preview?.can_commit}
          >
            {t('importExcel.confirmBuy')}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}

function Chip({ color, label }) {
  return (
    <span style={{ border: `1px solid ${color}`, color, borderRadius: 999, padding: '2px 10px' }}>
      {label}
    </span>
  );
}
