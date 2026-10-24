import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import api from '../utils/api';
import gatewayApi from '../utils/gatewayPayApi';
import { formatPlainAmount } from '../utils/currencyFormat';
import {
  canGiveBack,
  failureText,
  heldWithNoSale as sumHeldWithNoSale,
  isPending,
  needsHandResolution,
  statusKey,
  unapplied,
} from '../utils/gatewayPayHelpers';
import './TablePage.css';
import '../components/GatewayUI.css';

/**
 * Click to'lovlari — the charges nobody has finished with.
 *
 * **The population that matters is the first one: money Click confirmed that no sale has taken.**
 * That is the shop holding a customer's money without having accounted for it, and before this page
 * existed the only way to find it was a command on the server — which meant ringing the developer.
 *
 * Two actions, and the difference between them is the whole point:
 *
 * * **Ask Click** is always safe. A question can be repeated, and it is the only thing offered for a
 *   charge whose outcome is unclear, because Click may already have taken the money and charging
 *   again would take it twice.
 * * **Give it back** only appears for a charge no sale has used. The moment a sale has taken any of
 *   it the money is revenue, and handing it back means unwinding a sale — the Returns workflow, not
 *   this page. The server refuses it either way; the button simply does not lie about what is
 *   available.
 *
 * * **Enter Click's id** appears only for a charge we never got an id for. Those are the rows
 *   asking cannot fix: Click Pass answers `-404` to a lookup by our own reference, even for a
 *   payment that definitely succeeded, so without its id there is nothing to ask about and the row
 *   would block its sale forever. A person reads the id out of the Click cabinet and the server
 *   asks Click about *that* -- which works.
 *
 * Nobody can mark a charge paid by hand, here or anywhere. Only Click's own answer settles one:
 * even on the resolve path, what is typed is the id to ask about, never the outcome, and a payment
 * Click reports as cancelled settles the row that way.
 */
const GatewayPayments = () => {
  const { t } = useTranslation(['sales', 'common']);
  const [rows, setRows] = useState([]);
  const [staleCount, setStaleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyRef, setBusyRef] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Which row's id box is open, and what has been typed into it. One at a time, so there is no
  // chance of pressing the button on one row with another row's id still in the box.
  const [resolvingRef, setResolvingRef] = useState('');
  const [typedId, setTypedId] = useState('');
  // The close-by-hand box, kept separate from the id box so neither can be submitted with the
  // other's text in it.
  const [closingRef, setClosingRef] = useState('');
  const [closeReason, setCloseReason] = useState('');

  // The provider's name, as a cashier reads it, for whichever row is being talked about. Falls
  // back to Click only because every row that predates Payme is one.
  const nameOf = (row) => t(`gateway.method_${row?.provider || 'click'}`);
  const nameFor = (ref) => nameOf(rows.find((r) => r.merchant_trans_id === ref));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/gateway-payments/needs_check/');
      setRows(data?.results || []);
      setStaleCount(data?.stale_count || 0);
    } catch (err) {
      setError(err.response?.data?.detail || t('gatewayPage.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const ask = async (ref) => {
    setBusyRef(ref);
    setError('');
    setMessage('');
    try {
      const { data } = await gatewayApi.refresh(api, ref);
      setMessage(t('gatewayPage.asked', {
        ref, provider: nameFor(ref),
        state: t(statusKey(data).replace('gateway.', 'gateway.')),
      }));
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('gatewayPage.errAsk', { provider: nameFor(ref) }));
    } finally {
      setBusyRef('');
    }
  };

  const giveBack = async (ref) => {
    // Confirmed, because it moves real money and there is no undo short of charging again.
    if (!window.confirm(t('gatewayPage.confirmReverse', { ref }))) return;
    setBusyRef(ref);
    setError('');
    setMessage('');
    try {
      await gatewayApi.reverse(api, ref);
      setMessage(t('gatewayPage.reversed', { ref }));
      await load();
    } catch (err) {
      setError(
        err.response?.data?.error
        || err.response?.data?.gateway_payment_refs?.[0]
        || t('gatewayPage.errReverse'),
      );
    } finally {
      setBusyRef('');
    }
  };

  const resolveWithId = async (ref) => {
    setBusyRef(ref);
    setError('');
    setMessage('');
    try {
      const { data } = await gatewayApi.resolve(api, ref, typedId);
      // Says what Click answered, not that it worked: this endpoint settles a row as failed just
      // as readily as paid, and a message implying success would be a lie half the time.
      setMessage(t('gatewayPage.resolved', { ref, provider: nameFor(ref), state: t(statusKey(data)) }));
      setResolvingRef('');
      setTypedId('');
      await load();
    } catch (err) {
      setError(
        err.response?.data?.error
        || err.response?.data?.provider_payment_id?.[0]
        || err.response?.data?.detail
        || t('gatewayPage.errResolve', { provider: nameFor(ref) }),
      );
    } finally {
      setBusyRef('');
    }
  };

  const closeAsMissing = async (ref) => {
    if (!window.confirm(t('gatewayPage.confirmNoRecord', { ref, provider: nameFor(ref) }))) return;
    setBusyRef(ref);
    setError('');
    setMessage('');
    try {
      await gatewayApi.declareNoRecord(api, ref, closeReason);
      setMessage(t('gatewayPage.closedNoRecord', { ref, provider: nameFor(ref) }));
      setClosingRef('');
      setCloseReason('');
      await load();
    } catch (err) {
      setError(
        err.response?.data?.error
        || err.response?.data?.reason?.[0]
        || err.response?.data?.detail
        || t('gatewayPage.errNoRecord', { provider: nameFor(ref) }),
      );
    } finally {
      setBusyRef('');
    }
  };

  /** Money taken that no sale has recorded — said plainly, because it is the reason to be here. */
  const heldWithNoSale = sumHeldWithNoSale(rows);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('gatewayPage.title')}</h1>
      </div>
      <p className="page-intro">{t('gatewayPage.intro')}</p>

      {heldWithNoSale > 0 ? (
        <div className="form-card" style={{ padding: 12, marginBottom: 12 }}>
          <strong style={{ color: '#b45309' }}>
            {t('gatewayPage.heldTotal', {
              amount: formatPlainAmount(heldWithNoSale),
            })}
          </strong>
          <p className="form-hint" style={{ margin: '4px 0 0' }}>
            {t('gatewayPage.heldHint')}
          </p>
        </div>
      ) : null}

      {staleCount > 0 ? (
        <div className="error-message" style={{ marginBottom: 12 }}>
          {t('gatewayPage.staleWarning', { count: staleCount })}
        </div>
      ) : null}

      {error ? <div className="error-message">{error}</div> : null}
      {message ? (
        <div className="success-message" style={{ color: '#15803d', marginBottom: 12 }}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="loading-screen">{t('actions.loadingPage', { ns: 'common' })}</div>
      ) : rows.length === 0 ? (
        <p className="form-hint">{t('gatewayPage.empty')}</p>
      ) : (
        <div className="data-table-scroll">
          {/* `data-table-scroll` is the app's scroll container. This said `table-wrapper`, which
              is defined in no stylesheet, so the table had no horizontal scroll at all -- with ten
              columns and action buttons in the last one, it pushed the page sideways on anything
              narrower than a desktop.

              `data-table--wide` sets the 72rem floor the other many-column tables use: without it
              the table shrinks to the viewport instead of overflowing, the columns squash, and the
              Amal cell loses its buttons. */}
          <table className="data-table data-table--wide">
            <thead>
              <tr>
                <th>{t('gatewayPage.colProvider')}</th>
                <th>{t('gatewayPage.colRef')}</th>
                <th>{t('gatewayPage.colAmount')}</th>
                <th>{t('gatewayPage.colUnapplied')}</th>
                <th>{t('gatewayPage.colState')}</th>
                <th>{t('gatewayPage.colReason')}</th>
                <th>{t('gatewayPage.colSale')}</th>
                <th>{t('gatewayPage.colProviderId')}</th>
                <th>{t('gatewayPage.colTaken')}</th>
                <th>{t('gatewayPage.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ref = row.merchant_trans_id;
                const busy = busyRef === ref;
                // Extracted to `gatewayPayHelpers` so the one costly mistake here — offering to
                // reverse money a sale has already taken — is covered by a test.
                const mayGiveBack = canGiveBack(row);
                // Offered only where asking cannot work -- see `needsHandResolution`.
                const mayResolve = needsHandResolution(row);
                // Blank for a charge that has not failed: an empty cell reads as "nothing to say",
                // where a sentence would imply something went wrong.
                const reason = (row.failure_code || row.failure_message)
                  ? failureText(row, t, 'gatewayPage.unclear')
                  : { text: '\u2014', note: '' };
                return (
                  <tr key={ref}>
                    <td>{nameOf(row)}</td>
                    <td className="gw-ref">{ref}</td>
                    <td className="gw-num">{formatPlainAmount(row.amount_uzs)}</td>
                    <td className="gw-num">{formatPlainAmount(unapplied(row))}</td>
                    <td>
                      {t(statusKey(row))}
                      {isPending(row) ? ` (${t('gatewayPage.unclear')})` : ''}
                    </td>
                    {/* Why it failed, in the till's own language where we recognise the code,
                        with Click's wording underneath when it adds anything. This is the column
                        that tells somebody whether to fetch an admin or just ask for another
                        card. */}
                    <td className="gw-reason">
                      {reason.text}
                      {reason.note ? (
                        <span className="gw-provider-note">{reason.note}</span>
                      ) : null}
                    </td>
                    <td>{row.sale ? `#${row.sale}` : (row.sale_group ? `#${row.sale_group}*` : '—')}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.provider_payment_id || '—'}</td>
                    <td>{row.created_at ? String(row.created_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                    <td>
                      <div className="gw-actions">
                        {/* Always offered: asking is safe to repeat, and it is the only thing
                            offered for an unclear outcome. */}
                        <button
                          type="button"
                          className="btn-edit btn-dialog"
                          onClick={() => ask(ref)}
                          disabled={busy}
                        >
                          {busy ? t('gateway.checking') : t('gateway.check', { provider: nameOf(row) })}
                        </button>
                        {mayGiveBack ? (
                          <button
                            type="button"
                            className="btn-primary btn-dialog"
                            onClick={() => giveBack(ref)}
                            disabled={busy}
                          >
                            {t('gatewayPage.giveBack')}
                          </button>
                        ) : null}
                        {mayResolve && resolvingRef !== ref ? (
                          <button
                            type="button"
                            className="btn-edit btn-dialog"
                            onClick={() => { setResolvingRef(ref); setTypedId(''); setClosingRef(''); }}
                            disabled={busy}
                          >
                            {t('gatewayPage.enterId', { provider: nameOf(row) })}
                          </button>
                        ) : null}
                        {mayResolve && closingRef !== ref ? (
                          <button
                            type="button"
                            className="btn-delete btn-dialog"
                            onClick={() => { setClosingRef(ref); setCloseReason(''); setResolvingRef(''); }}
                            disabled={busy}
                          >
                            {t('gatewayPage.noRecord', { provider: nameOf(row) })}
                          </button>
                        ) : null}
                      </div>
                      {mayResolve && closingRef === ref ? (
                        <div className="gw-form gw-form--danger">
                          <label className="gw-form__label" htmlFor={`gw-reason-${ref}`}>
                            {t('gatewayPage.noRecordReason')}
                          </label>
                          <p className="gw-form__hint">{t('gatewayPage.noRecordHint', { provider: nameOf(row) })}</p>
                          <div className="gw-form__row">
                            <input
                              id={`gw-reason-${ref}`}
                              className="gw-form__input"
                              type="text"
                              value={closeReason}
                              onChange={(e) => setCloseReason(e.target.value)}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn-delete btn-dialog"
                              onClick={() => closeAsMissing(ref)}
                              disabled={busy || closeReason.trim().length < 5}
                            >
                              {t('gatewayPage.noRecordConfirm')}
                            </button>
                            <button
                              type="button"
                              className="btn-edit btn-dialog"
                              onClick={() => { setClosingRef(''); setCloseReason(''); }}
                              disabled={busy}
                            >
                              {t('actions.cancel', { ns: 'common' })}
                            </button>
                          </div>
                          {/* A disabled button that will not say why is a dead end. */}
                          {closeReason.trim().length < 5 ? (
                            <p className="gw-form__requirement">
                              {t('gatewayPage.noRecordNeedsReason')}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {mayResolve && resolvingRef === ref ? (
                        <div className="gw-form">
                          <label className="gw-form__label" htmlFor={`gw-id-${ref}`}>
                            {t('gatewayPage.colProviderId')}
                          </label>
                          <p className="gw-form__hint">{t('gatewayPage.enterIdHint', { provider: nameOf(row) })}</p>
                          <div className="gw-form__row">
                            <input
                              id={`gw-id-${ref}`}
                              className="gw-form__input gw-form__input--id"
                              type="text"
                              inputMode="numeric"
                              value={typedId}
                              onChange={(e) => setTypedId(e.target.value)}
                              placeholder={t('gatewayPage.clickIdPlaceholder')}
                              autoComplete="off"
                              onKeyDown={(e) => {
                                // Enter submits, because this field is typed into from a screen
                                // being read off beside it and reaching for the mouse loses the
                                // place.
                                if (e.key === 'Enter' && typedId.trim() && !busy) {
                                  e.preventDefault();
                                  resolveWithId(ref);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary btn-dialog"
                              onClick={() => resolveWithId(ref)}
                              disabled={busy || !typedId.trim()}
                            >
                              {busy ? t('gateway.checking') : t('gatewayPage.askAboutId', { provider: nameOf(row) })}
                            </button>
                            <button
                              type="button"
                              className="btn-edit btn-dialog"
                              onClick={() => { setResolvingRef(''); setTypedId(''); }}
                              disabled={busy}
                            >
                              {t('actions.cancel', { ns: 'common' })}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="form-hint" style={{ marginTop: 16 }}>{t('gatewayPage.footnote')}</p>
    </div>
  );
};

export default GatewayPayments;
