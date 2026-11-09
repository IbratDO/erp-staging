import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

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

  return (
    <div className="form-card" style={{ padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{t('periodLock.title')}</strong>
        <span>
          {closed
            ? t('periodLock.closedThrough', { date: closed })
            : t('periodLock.nothingClosed')}
        </span>
        {state.may_change ? (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(!open)}>
            {open ? t('actions.cancel', { ns: 'common' }) : t('periodLock.change')}
          </button>
        ) : null}
      </div>

      {closed && state.reason ? (
        <small style={{ color: '#666', display: 'block', marginTop: 4 }}>
          {t('periodLock.setBy', { who: state.set_by || '—', reason: state.reason })}
        </small>
      ) : null}

      {error ? <div className="error-message" style={{ marginTop: 8 }}>{error}</div> : null}
      {message ? (
        <div style={{ color: '#15803d', marginTop: 8 }}>{message}</div>
      ) : null}

      {open && state.may_change ? (
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              {t('periodLock.fieldDate')}
            </label>
            <input
              type="date"
              // The books cannot close through a day that has not happened; the server refuses it
              // too, but offering it would be an invitation to be refused.
              max={new Date().toISOString().slice(0, 10)}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label style={{ display: 'block', marginBottom: 4 }}>
              {t('periodLock.fieldReason')}
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !day}
            onClick={submit}
          >
            {t('periodLock.save')}
          </button>
        </div>
      ) : null}

      {open && state.may_change ? (
        <small style={{ color: '#666', display: 'block', marginTop: 8 }}>
          {t('periodLock.hint')}
        </small>
      ) : null}
    </div>
  );
};

export default PeriodLockPanel;
