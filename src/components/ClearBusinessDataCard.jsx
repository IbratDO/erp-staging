import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import api from '../utils/api';
import Modal from './Modal';
import BusyForm, { SubmitButton } from './BusyForm';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Wiping every business record — stock, sales, orders, money, the lot.
 *
 * **It lives on Sozlamalar now, not on Foydalanuvchilar.** It was never really a user-accounts
 * action; it sat there because that was the only page an Admin had to themselves at the time.
 * Sozlamalar is that page now, and the owner asked for it to move.
 *
 * Moving it changed who may press it, and deliberately. It used to ask `is_admin()`, which
 * despite its old docstring meant Founder *or* Admin *or* any superuser. It now asks for
 * `data.clear_business`, held by the Admin role alone — the same account that owns this page.
 * The alternative was a Founder holding a power whose only route is a page they cannot open,
 * which `rbac.py` already calls out as a gap that looks deliberate rather than a restriction.
 *
 * **The strings stay in the `users` namespace.** Fourteen keys in three languages, every one of
 * them still accurate; moving them would have been a rename with no reader-visible effect and
 * three chances to drop a translation. The namespace is a filing decision, not a statement about
 * which page a string belongs to.
 *
 * Two guards on the button, and they are not the same guard. The typed phrase proves the person
 * meant this particular thing; `busy` proves they only did it once. A wipe that ran twice would
 * be harmless — there is nothing left to delete the second time — but a button that re-arms
 * itself under an error message is how a thousand-row import went in three times, so it stays
 * down for the duration either way.
 */
const ClearBusinessDataCard = () => {
  // `useTranslation`, not `useAppTranslation`, and for a mechanical reason rather than a stylistic
  // one: the wrapper imports `localeFormat`, which imports the i18n bootstrap and runs
  // `i18n.init()` on import. Pulling that into this component put it into Sozlamalar's import
  // graph, and the page's own test — which mocks `react-i18next` — blew up on the real init
  // before it could render anything. Settings.js reaches for `useTranslation` directly for the
  // same reason; only `t` is needed here.
  const { t } = useTranslation(['users', 'common']);
  const { hasPermission } = usePermissions();
  const mayClear = hasPermission('data.clear_business');

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState(null);

  const confirmPhrase = useMemo(() => t('clearDataConfirmPhrase').trim().toUpperCase(), [t]);
  const confirmMatches = confirmText.trim().toUpperCase() === confirmPhrase;
  const showMismatch = confirmText.length > 0 && !confirmMatches;

  // Nothing at all for a role that cannot do it — not a disabled button. A greyed-out "wipe
  // everything" invites somebody to go looking for the account that can.
  if (!mayClear) return null;

  const close = () => {
    if (clearing) return;
    setOpen(false);
    setConfirmText('');
  };

  const handleClear = async (e) => {
    e.preventDefault();
    if (!confirmMatches || clearing) return;
    setClearing(true);
    setMessage(null);
    try {
      await api.post('/users/clear-business-data/', {
        confirm: confirmText.trim().toUpperCase(),
      });
      setOpen(false);
      setConfirmText('');
      setMessage({ kind: 'success', text: t('clearDataSuccess') });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err.response?.data?.error
          || err.response?.data?.detail
          || t('clearDataFailed'),
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="form-card">
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.25rem' }}>{t('clearDataTitle')}</h2>
      <p className="form-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
        {t('clearDataWarningIntro')}
      </p>

      {message ? (
        <div
          className={message.kind === 'error' ? 'error-message' : 'success-message'}
          style={message.kind === 'error' ? undefined : { color: '#15803d', marginBottom: 12 }}
        >
          {message.text}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn-danger-action" onClick={() => setOpen(true)}>
          {t('clearDataButton')}
        </button>
      </div>

      <Modal
        open={open}
        onClose={close}
        closeLabel={t('actions.close', { ns: 'common' })}
        closeOnBackdrop={false}
        className="form-card--danger"
        title={t('clearDataTitle')}
      >
        <div className="danger-callout">
          <div>{t('clearDataWarningIntro')}</div>
          <ul>
            <li>{t('clearDataWarningItem1')}</li>
            <li>{t('clearDataWarningItem2')}</li>
            <li>{t('clearDataWarningItem3')}</li>
          </ul>
          <div className="danger-callout__kept">{t('clearDataWarningKept')}</div>
        </div>
        <BusyForm onSubmit={handleClear}>
          <div className="form-grid" style={{ gridTemplateColumns: 'minmax(0, 320px)' }}>
            <div className="form-group">
              <label htmlFor="clear-confirm">{t('clearDataConfirmLabel')}</label>
              <input
                id="clear-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t('clearDataConfirmPlaceholder')}
                autoComplete="off"
                disabled={clearing}
                aria-invalid={showMismatch}
              />
              {showMismatch && (
                <span className="form-hint-error">{t('clearDataConfirmMismatch')}</span>
              )}
            </div>
          </div>
          <div className="form-actions">
            <SubmitButton className="btn-danger-action" disabled={clearing || !confirmMatches}>
              {clearing ? t('actions.loading', { ns: 'common' }) : t('clearDataProceed')}
            </SubmitButton>
            <button type="button" className="btn-edit" onClick={close} disabled={clearing}>
              {t('actions.cancel', { ns: 'common' })}
            </button>
          </div>
        </BusyForm>
      </Modal>
    </div>
  );
};

export default ClearBusinessDataCard;
