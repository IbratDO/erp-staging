import React, { useCallback, useRef, useState } from 'react';
import Modal, { WIDE } from './Modal';
import ActionButton from './ActionButton';
import { saveBlob } from '../utils/productImportApi';

/**
 * Filling a list page from a spreadsheet: template, preview, confirm.
 *
 * Shared by Mijozlar and Asosiy vositalar, which differ only in their columns and their wording.
 * The Ombor import keeps a dialog of its own, because it spends cash and therefore needs the panel
 * showing what the till will read afterwards — folding that in here would make this component carry
 * money logic for two pages that have none.
 *
 * What it does have, like every other import in the project: **nothing is written until Confirm**,
 * Confirm is withheld while any row has a problem, and a second file replaces the first preview
 * rather than leaving a stale one on screen.
 *
 * `columns` is `[{ key, label, align, from }]`. `from(row)` reads the cell; the default reads
 * `row.values[key]`, which is what the server echoes back for every importer.
 */
export default function SimpleImportModal({
  open, onClose, api, t, lang, importApi, columns, templateName, chips, onImported,
}) {
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
      const res = await importApi.template(api, lang);
      saveBlob(res.data, templateName);
    } catch (err) {
      setError(messageOf(err, t('importExcel.templateFailed')));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (picked) => {
    // Every pick starts over: a preview describes one file, and acting on a stale one is the whole
    // failure this clears.
    setPreview(null);
    setResult(null);
    setError('');
    setRowErrors([]);
    setFile(picked || null);
    if (!picked) return;
    setBusy(true);
    try {
      const res = await importApi.preview(api, picked);
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
      // Only the rows that do something. A skipped row is already on file; an error row is why the
      // button would be disabled.
      const rows = preview.rows
        .filter((r) => r.action === 'create')
        .map((r) => ({ row_num: r.row_num, ...r.values }));
      const res = await importApi.commit(api, rows);
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
  const actionLabel = {
    create: t('importExcel.willAdd'),
    skip: t('importExcel.willSkip'),
    error: t('importExcel.hasProblem'),
  };
  const actionColor = { create: '#2f855a', skip: '#718096', error: '#c53030' };

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

        {summary ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.85em' }}>
            <Chip color="#2f855a" label={t('importExcel.countAdd', { count: summary.to_create })} />
            {summary.skipped ? (
              <Chip color="#718096" label={t('importExcel.countSkip', { count: summary.skipped })} />
            ) : null}
            {summary.errors ? (
              <Chip color="#c53030" label={t('importExcel.countError', { count: summary.errors })} />
            ) : null}
            {(chips || []).map((c) => {
              const label = c.label(summary);
              return label ? <Chip key={c.key} color={c.color || '#2b6cb0'} label={label} /> : null;
            })}
          </div>
        ) : null}

        {(preview?.blockers || []).map((b) => (
          <div key={b} style={{ color: '#c53030', fontSize: '0.85em' }}>{b}</div>
        ))}

        {rows.length ? (
          <div className="data-table-scroll" style={{ maxHeight: 320 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('importExcel.rowColumn')}</th>
                  <th>{t('importExcel.whatHappens')}</th>
                  {columns.map((c) => (
                    <th key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                      {c.label}
                    </th>
                  ))}
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
                    {columns.map((c) => (
                      <td key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                        {(c.from ? c.from(r) : r.values?.[c.key]) || '—'}
                      </td>
                    ))}
                    <td style={{ fontSize: '0.85em' }}>
                      {r.errors?.length
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
            {t('importExcel.done', result)}
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
            {t('importExcel.confirm')}
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
