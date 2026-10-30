import React, { useCallback, useMemo, useRef, useState } from 'react';
import Modal, { WIDE } from './Modal';
import ActionButton from './ActionButton';
import {
  commitProductImport,
  downloadProductTemplate,
  previewProductImport,
  saveBlob,
} from '../utils/productImportApi';

/**
 * Filling Mahsulotlar from a spreadsheet, in three steps the owner can back out of.
 *
 * **Nothing is saved until Confirm.** Choosing a file only asks the server what it *would* do, and the
 * answer is shown row by row: these are new, these already exist and will have their category
 * corrected, these have a problem. That is the point of the preview — a wrong file costs a click.
 *
 * **Confirm is withheld while any row has a problem**, because the server imports all rows or none.
 * A button that offered to import "the good ones" would be promising something the server refuses.
 *
 * The rule that catches people out is on screen as well as in the template: brand, model, size and
 * colour are how a row is matched to a product, so on a product that already exists only Turi and
 * Kategoriya can change. A row differing in any of those four is a different product, and is created.
 */
export default function ProductImportModal({ open, onClose, api, t, lang, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  /**
   * Has a commit been sent for this file?
   *
   * **Deliberately not cleared in the `finally` below**, which is the whole point and the thing
   * `busy` could not do. A write that fails in the browser has *not* necessarily failed on the
   * server: a request that outlives the gateway's patience comes back as a 504 while the work
   * carries on behind it and commits. The button lit up again, the error said it had failed, and
   * pressing it once more sent a second import that also succeeded — a shop's opening stock went
   * in three times that way, with the till debited three times for it.
   *
   * So after one attempt the button stays down whatever the outcome. Only picking a file again,
   * or closing the dialog, arms it. Choosing to retry is then a decision somebody takes after
   * looking, instead of a reflex against a message that may be untrue.
   *
   * The preview button is deliberately left alone: it writes nothing, so retrying it is free.
   */
  const [commitSent, setCommitSent] = useState(false);
  const fileRef = useRef(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    setRowErrors([]);
    setBusy(false);
    setCommitSent(false);
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
      const res = await downloadProductTemplate(api, lang);
      saveBlob(res.data, 'mahsulotlar_shablon.xlsx');
    } catch (err) {
      setError(messageOf(err, t('importExcel.templateFailed')));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (picked) => {
    // Each pick starts over: the previous preview describes a file that is no longer selected.
    setPreview(null);
    setResult(null);
    setError('');
    setRowErrors([]);
    setCommitSent(false);
    setFile(picked || null);
    if (!picked) return;
    setBusy(true);
    try {
      const res = await previewProductImport(api, picked);
      setPreview(res.data);
    } catch (err) {
      setError(messageOf(err, t('importExcel.readFailed')));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview?.can_commit || commitSent) return;
    // Set before the request, not after it: an await cannot be relied on to come back, and this
    // has to hold even if the tab is throttled or the connection drops mid-flight.
    setCommitSent(true);
    setBusy(true);
    setError('');
    setRowErrors([]);
    try {
      const rows = preview.rows
        .filter((r) => r.action === 'create' || r.action === 'update')
        .map((r) => ({ row_num: r.row_num, ...r.values }));
      const res = await commitProductImport(api, rows);
      setResult(res.data);
      setPreview(null);
      if (onImported) onImported(res.data);
    } catch (err) {
      const data = err?.response?.data;
      // **A failure with no answer from the server is not a failure.** A 502/504 is the
      // gateway giving up while the request runs on; a dropped connection says nothing at all
      // about whether the transaction committed. Only a real status code carries a real verdict,
      // so anything else gets the "check before retrying" wording instead of "saving failed".
      const status = err?.response?.status;
      const unknown = !err?.response || status === 502 || status === 503 || status === 504;
      setError(unknown
        ? t('importExcel.saveUnknown')
        : messageOf(err, t('importExcel.saveFailed')));
      // Same shape the batch endpoints use, so the rows can be named rather than counted.
      setRowErrors(Array.isArray(data?.item_errors) ? data.item_errors : []);
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;
  const problems = useMemo(
    () => (preview?.rows || []).filter((r) => r.action === 'error'),
    [preview],
  );

  const actionLabel = {
    create: t('importExcel.willAdd'),
    update: t('importExcel.willUpdate'),
    unchanged: t('importExcel.unchanged'),
    error: t('importExcel.hasProblem'),
  };
  const actionColor = {
    create: '#2f855a', update: '#2b6cb0', unchanged: '#718096', error: '#c53030',
  };

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
        <p style={{ margin: 0, color: '#4a5568', fontSize: '0.9em' }}>
          {t('importExcel.intro')}
        </p>

        {/* The file input itself is hidden and driven by the button beside it. A bare
            `<input type="file">` renders as the browser's own grey control, which looks like nothing
            else on the page and cannot be sized or coloured; the shop should see two buttons that
            match the rest of the UI, with the chosen filename after them. */}
        <div className="form-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Both buttons in this row carry `btn-dialog`, so they are the same box and only the
              colour differs. See the rule: the symbol in this label would otherwise make it taller
              than the plain-text button beside it. */}
          <ActionButton
            type="button"
            className="btn-edit btn-dialog"
            onClick={getTemplate}
            disabled={busy}
          >
            {t('importExcel.downloadTemplate')}
          </ActionButton>
          <ActionButton
            type="button"
            className="btn-primary btn-dialog"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
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

        <p style={{ margin: 0, color: '#718096', fontSize: '0.82em' }}>
          {t('importExcel.identityNote')}
        </p>

        {error ? (
          <div style={{ color: '#c53030', fontSize: '0.9em' }}>{error}</div>
        ) : null}

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
            <Chip color="#2b6cb0" label={t('importExcel.countUpdate', { count: summary.to_update })} />
            <Chip color="#718096" label={t('importExcel.countUnchanged', { count: summary.unchanged })} />
            {summary.errors ? (
              <Chip color="#c53030" label={t('importExcel.countError', { count: summary.errors })} />
            ) : null}
          </div>
        ) : null}

        {problems.length ? (
          <div style={{ color: '#c53030', fontSize: '0.85em' }}>
            {t('importExcel.blockedByProblems')}
          </div>
        ) : null}

        {preview?.rows?.length ? (
          <div className="data-table-scroll" style={{ maxHeight: 320 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('importExcel.rowColumn')}</th>
                  <th>{t('importExcel.whatHappens')}</th>
                  <th>{t('brand')}</th>
                  <th>{t('model')}</th>
                  <th>{t('size')}</th>
                  <th>{t('color')}</th>
                  <th>{t('categoryType')}</th>
                  <th>{t('category')}</th>
                  <th>{t('importExcel.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row_num}>
                    <td>{r.row_num}</td>
                    <td style={{ color: actionColor[r.action], fontWeight: 600 }}>
                      {actionLabel[r.action]}
                    </td>
                    <td>{r.values.brand}</td>
                    <td>{r.values.model}</td>
                    <td>{r.values.size}</td>
                    <td>{r.values.color}</td>
                    <td>{r.values.category_type}</td>
                    <td>{r.values.category}</td>
                    <td style={{ fontSize: '0.85em' }}>
                      {r.action === 'error'
                        ? <span style={{ color: '#c53030' }}>{r.errors.join(' ')}</span>
                        : Object.entries(r.changes || {}).map(([fld, pair]) => (
                            <div key={fld}>
                              {`${fld === 'category' ? t('category') : t('categoryType')}: `}
                              {`${pair[0] || '—'} → ${pair[1]}`}
                            </div>
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
              created: result.created,
              updated: result.updated,
              unchanged: result.unchanged,
            })}
          </div>
        ) : null}

        {/* `form-actions` is the row every other dialog in the project uses for its buttons, with the
            secondary action in `btn-edit` and the one that commits in `btn-primary`. */}
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          {file && !result ? (
            <ActionButton
              type="button"
              className="btn-edit btn-dialog"
              onClick={reset}
              disabled={busy}
            >
              {t('importExcel.startOver')}
            </ActionButton>
          ) : null}
          <ActionButton
            type="button"
            className="btn-primary btn-dialog"
            onClick={confirm}
            disabled={busy || commitSent || !preview?.can_commit}
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
    <span style={{
      border: `1px solid ${color}`, color, borderRadius: 999, padding: '2px 10px',
    }}>
      {label}
    </span>
  );
}
