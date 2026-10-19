import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import './TablePage.css';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../hooks/usePermissions';
import ShopSettingsForm from './ShopSettingsForm';
import ShopFeaturesForm from './ShopFeaturesForm';
import PaymentProviderForm from './PaymentProviderForm';

/**
 * Sozlamalar — what the shop is called, and what it does.
 *
 * Only an Admin reaches this page: the route is gated on `settings.manage`, which the Founder role is
 * withheld from at the owner's request. The server checks the same code, so the gate here is for the
 * menu and the URL bar, not for security.
 *
 * **Two cards, two saves, two PATCHes.** The name and the feature switches are separate because they
 * do separate things, and because a partial PATCH means saving one can never clobber the other.
 *
 * **Why saving a feature also refreshes the user.** A feature switch takes effect by *masking
 * permission codes* on the server, and the frontend learns its permissions from `/users/me/`. So
 * refreshing the settings alone updates the shop's name everywhere and leaves the menu and the Nasiya
 * checkbox showing the old answer until the page is reloaded by hand — which is exactly what was
 * happening. `refreshUser()` re-reads the permission list, so Qarzdorlik appears or disappears and the
 * checkbox follows immediately.
 *
 * It only fixes *this* browser. The switch is shop-wide, so anyone else already signed in keeps their
 * old permission list until their own next `/users/me/` — on a reload, or when their token refreshes.
 * Nothing pushes it to them; that would need the server to be able to talk to a session it is not
 * answering.
 */
const Settings = () => {
  const { t } = useTranslation(['settings', 'common']);
  const { settings, refreshSettings } = useSettings();
  const { refreshUser } = usePermissions();

  const [savedName, setSavedName] = useState(settings?.shop_name || '');
  // Defaults to true, matching the column: an unread setting must never read as "nasiya is off".
  const [savedNasiya, setSavedNasiya] = useState(settings?.nasiya_enabled !== false);
  const [loading, setLoading] = useState(true);

  // A pair of states per card, so a failure on one does not paint an error across the other.
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [featuresError, setFeaturesError] = useState('');
  const [featuresSuccess, setFeaturesSuccess] = useState('');
  // Its own set again, for the same reason: a failed credential save must not paint an error
  // across the shop's name.
  const [click, setClick] = useState(null);
  const [clickLoading, setClickLoading] = useState(true);
  const [savingClick, setSavingClick] = useState(false);
  const [clickError, setClickError] = useState('');
  const [clickSuccess, setClickSuccess] = useState('');
  const [clickCheck, setClickCheck] = useState(null);
  const [checkingClick, setCheckingClick] = useState(false);
  const [clearingClick, setClearingClick] = useState(false);

  const applyRow = useCallback((data) => {
    setSavedName(data?.shop_name || '');
    setSavedNasiya(data?.nasiya_enabled !== false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings/');
      applyRow(data);
    } catch {
      setNameError(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applyRow, t]);

  // Separate from `load()` on purpose: only an Admin may read the credentials, so a 403 here is a
  // normal answer for some roles and must not surface as "settings failed to load".
  const loadClick = useCallback(async () => {
    setClickLoading(true);
    try {
      const { data } = await api.get('/settings/payment-providers/click/');
      setClick(data);
    } catch {
      setClick(null);
    } finally {
      setClickLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadClick();
  }, [load, loadClick]);

  const errorMessage = (err) => {
    const data = err.response?.data;
    const status = err.response?.status;
    // **A 500 is not something to try again.** The old message said "saving failed, try again",
    // which is exactly the wrong advice when the server threw: the owner pressed Save four times
    // in four seconds the first time this happened. A server that fails on a *valid* form -- a
    // missing `cryptography`, an unapplied migration -- fails the same way every time, and the
    // body it returns is an HTML error page rather than the JSON read below. So the status is
    // checked before the body, and the message sends somebody to the logs instead of to the
    // button.
    if (status >= 500) return t('errors.serverError', { status });
    if (!data) return t('errors.saveFailed');
    // A plain message, however this endpoint chose to name it.
    const direct = data.detail || data.error;
    if (typeof direct === 'string') return direct;
    // Then any field error, whatever key it arrived under. This used to name `shop_name` and
    // nothing else, which was fine while the page had one form: the credentials card returns a
    // perfectly clear sentence under `enabled` — "Fill Merchant User ID before switching this
    // provider on." — and the screen showed the generic "saving failed" instead, so the owner had
    // no idea which box to fill and simply pressed Save again.
    if (typeof data === 'object') {
      const found = Object.values(data).find(
        (v) => typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'string'),
      );
      if (typeof found === 'string') return found;
      if (Array.isArray(found)) return found[0];
    }
    return t('errors.saveFailed');
  };

  const handleSaveName = async (values) => {
    setNameError('');
    setNameSuccess('');
    setSavingName(true);
    try {
      const { data } = await api.patch('/settings/', values);
      // Filled from the response, not the request: the server trims the name, so '  Lady Luxe  '
      // would otherwise sit on screen as though it had been saved that way.
      applyRow(data);
      setNameSuccess(t('saved'));
      // The sidebar, the browser tab and the next printed chek.
      await refreshSettings();
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveFeatures = async (values) => {
    setFeaturesError('');
    setFeaturesSuccess('');
    setSavingFeatures(true);
    try {
      const { data } = await api.patch('/settings/', values);
      applyRow(data);
      setFeaturesSuccess(t('saved'));
      // Both, and in this order. The settings row is what the page itself reads back; the user's
      // permission list is what decides whether Qarzdorlik is in the menu and whether the Nasiya
      // checkbox is offered. Without the second call the toggle appears to do nothing until a manual
      // reload — see the note at the top of this file.
      await refreshSettings();
      await refreshUser();
    } catch (err) {
      setFeaturesError(errorMessage(err));
    } finally {
      setSavingFeatures(false);
    }
  };

  const handleSaveClick = async (values) => {
    setClickError('');
    setClickSuccess('');
    // A stale "ready to go" panel beside freshly changed credentials would be a lie.
    setClickCheck(null);
    setSavingClick(true);
    try {
      const { data } = await api.patch('/settings/payment-providers/click/', values);
      // From the response: the secret is never echoed, so `secret_set` is the only way the form
      // learns that what it just sent was stored.
      setClick(data);
      setClickSuccess(t('saved'));
    } catch (err) {
      setClickError(errorMessage(err));
    } finally {
      setSavingClick(false);
    }
  };

  const handleCheckClick = async () => {
    setClickError('');
    setCheckingClick(true);
    try {
      const { data } = await api.post('/settings/payment-providers/click/', { action: 'check' });
      setClickCheck(data);
    } catch (err) {
      setClickError(errorMessage(err));
    } finally {
      setCheckingClick(false);
    }
  };

  const handleClearClickSecret = async () => {
    // Confirmed, because it switches the provider off: the till stops taking Click payments the
    // moment this succeeds, and there is no undo short of typing the secret in again.
    if (!window.confirm(t('click.confirmClear'))) return;
    setClickError('');
    setClickSuccess('');
    setClickCheck(null);
    setClearingClick(true);
    try {
      const { data } = await api.post(
        '/settings/payment-providers/click/', { action: 'clear_secret' },
      );
      setClickSuccess(data?.message || t('saved'));
      await loadClick();
    } catch (err) {
      setClickError(errorMessage(err));
    } finally {
      setClearingClick(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('title')}</h1>
      </div>
      <p className="page-intro">{t('intro')}</p>

      <ShopSettingsForm
        initialName={savedName}
        loading={loading}
        saving={savingName}
        error={nameError}
        success={nameSuccess}
        onSave={handleSaveName}
        labels={{
          loading: t('actions.loadingPage', { ns: 'common' }),
          shopNameLabel: t('form.shopName'),
          shopNameHint: t('form.shopNameHint'),
          save: t('form.save'),
          saving: t('form.saving'),
        }}
      />

      <ShopFeaturesForm
        initialNasiya={savedNasiya}
        loading={loading}
        saving={savingFeatures}
        error={featuresError}
        success={featuresSuccess}
        onSave={handleSaveFeatures}
        labels={{
          loading: t('actions.loadingPage', { ns: 'common' }),
          featuresTitle: t('featuresTitle'),
          featuresIntro: t('featuresIntro'),
          nasiyaLabel: t('form.nasiya'),
          nasiyaHint: t('form.nasiyaHint'),
          save: t('form.save'),
          saving: t('form.saving'),
        }}
      />

      {/* Hidden rather than shown-and-refused when the role cannot read it: `loadClick` swallows
          the 403 and leaves `click` null, so a CEO sees the page without a card they cannot use. */}
      {click ? (
        <PaymentProviderForm
          provider="click"
          initial={click}
          loading={clickLoading}
          saving={savingClick}
          checking={checkingClick}
          clearing={clearingClick}
          error={clickError}
          success={clickSuccess}
          checkResult={clickCheck}
          onSave={handleSaveClick}
          onCheck={handleCheckClick}
          onClearSecret={handleClearClickSecret}
          labels={{
            loading: t('actions.loadingPage', { ns: 'common' }),
            title: t('click.title'),
            intro: t('click.intro'),
            serviceId: t('click.serviceId'),
            merchantUserId: t('click.merchantUserId'),
            secretKey: t('click.secretKey'),
            secretStored: t('click.secretStored'),
            secretMissing: t('click.secretMissing'),
            secretKeepHint: t('click.secretKeepHint'),
            secretNewHint: t('click.secretNewHint'),
            clearSecret: t('click.clearSecret'),
            clearing: t('click.clearing'),
            cashboxCode: t('click.cashboxCode'),
            cashboxHint: t('click.cashboxHint'),
            enabledLabel: t('click.enabledLabel'),
            enabledHint: t('click.enabledHint'),
            check: t('click.check'),
            checking: t('click.checking'),
            checkOk: t('click.checkOk'),
            checkNotReady: t('click.checkNotReady'),
            checkNoCharge: t('click.checkNoCharge'),
            checkChecksSaved: t('click.checkChecksSaved'),
            checkNeedsSave: t('click.checkNeedsSave'),
            save: t('form.save'),
            saving: t('form.saving'),
          }}
        />
      ) : null}
    </div>
  );
};

export default Settings;
