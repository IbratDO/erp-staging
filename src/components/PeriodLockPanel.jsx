import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import './PeriodLockPanel.css';

/**
 * How far the books are closed, and — for whoever may — the control to move the line.
 *
 * **One date, not a row per month**, the owner's decision: "the books are closed through
 * 30 September" cannot produce the state a per-month table can, where September is closed while
 * August is open and no report has an answer for the gap.
 *
 * **The line is shown to everybody who can read this page, and moved only by `may_change`.** A
 * page that refuses a date has to be able to say what the date is, so hiding the line from a
 * reader who cannot move it would leave them guessing at the rule. The server decides
 * `may_change` — this component only declines to draw a control nobody would be allowed to use.
 *
 * **A reason is required in both directions, and matters more going back.** Closing a month is
 * routine; reopening one that has been reported is the entry that most needs an explanation
 * attached, which is why the warning below appears only when the date moves backwards.
 *
 * *Styling note: this shipped written entirely in inline styles, with `btn` / `btn-sm` /
 * `error-message` class names that **exist in no stylesheet in this project** — so its buttons
 * rendered as raw browser buttons beside a page of styled ones. It now uses the house classes
 * (`btn-primary`, `btn-edit`, `notification-banner`) and its own stylesheet, like every other
 * panel.*
 */
const PeriodLockPanel = () => {
  const { t } = useTranslation(['balanceSheet', 'common']);
  const { hasPermission } = usePermissions();
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Read even without the permission: the line itself is not a secret, and a refusal elsewhere is
  // only actionable if somebody can see what it refers to.
  const canRead = hasPermission('cash.view');

  const load = useCallback(async () => {
    if (!canRead) return;
    try {
      const { data } = await api.get('/cash-balance/books-closed-through/');
      setState(data);
      setDay(data.closed_through || '');
    } catch {
      // A failure to read the lock must not take the page down with it — the balance sheet above
      // is the thing somebody came for.
      setState(null);
    }
  }, [canRead]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!reason.trim()) {
      setError(t('periodLock.reasonRequired'));
      return;
    }
    const movingBack = state?.closed_through && day && day < state.closed_through;
    if (movingBack) {
      // Asks once, and says what reopening means rather than "are you sure".
      const ok = window.confirm(t('periodLock.confirmReopen', {
        from: state.closed_through,
        to: day,
      }));
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/cash-balance/books-closed-through/', {
        closed_through: day,
        reason,
      });
      setMessage(data?.message || t('periodLock.saved'));
      setReason('');
      setOpen(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || t('periodLock.errSave'));
    } finally {
      setBusy(false);
    }
  };

  if (!canRead || state === null) return null;

  const closed = state.closed_through;
  // Moving the line backwards reopens a month that has been read and acted on. Worth saying
  // before the press, not after.
  const movingBack = !!(closed && day && day < closed);

  return (
    <div className="period-lock">
      <div className="period-lock__head">
        <div className="period-lock__title">
          <span className="period-lock__label">{t('periodLock.title')}</span>
          {/* The date carries the state, so it carries the colour: closed reads as settled,
              nothing-closed as merely neutral. A date is the whole content of this panel and it
              should be findable without reading the sentence around it. */}
          <span className={`period-lock__date${closed ? '' : ' period-lock__date--none'}`}>
            {closed
              ? t('periodLock.closedThrough', { date: closed })
              : t('periodLock.nothingClosed')}
          </span>
        </div>
        {state.may_change ? (
          <button
            type="button"
            className="btn-edit"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t('actions.cancel', { ns: 'common' }) : t('periodLock.change')}
          </button>
        ) : null}
      </div>

      {closed && state.reason ? (
        <p className="period-lock__meta">
          {t('periodLock.setBy', { who: state.set_by || '—', reason: state.reason })}
        </p>
      ) : null}

      {error ? <div className="notification-banner error">{error}</div> : null}
      {message ? <div className="notification-banner success">{message}</div> : null}

      {open && state.may_change ? (
        <div className="period-lock__form">
          <div className="period-lock__field">
            <label htmlFor="period-lock-date">{t('periodLock.fieldDate')}</label>
            <input
              id="period-lock-date"
              type="date"
              // The books cannot close through a day that has not happened; the server refuses it
              // too, but offering it would be an invitation to be refused.
              max={new Date().toISOString().slice(0, 10)}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <div className="period-lock__field period-lock__field--grow">
            <label htmlFor="period-lock-reason">{t('periodLock.fieldReason')}</label>
            <input
              id="period-lock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="period-lock__actions">
            <button
              type="button"
              className={movingBack ? 'btn-danger-action' : 'btn-primary'}
              disabled={busy || !day}
              onClick={submit}
            >
              {t('periodLock.save')}
            </button>
          </div>

          <p className="period-lock__hint">{t('periodLock.hint')}</p>
        </div>
      ) : null}
    </div>
  );
};

export default PeriodLockPanel;
