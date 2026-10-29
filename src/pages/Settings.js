import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import './TablePage.css';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../hooks/usePermissions';
import ShopSettingsForm from './ShopSettingsForm';
import ShopFeaturesForm from './ShopFeaturesForm';
import PaymentProviderForm, { CLICK_FIELDS, PAYME_FIELDS } from './PaymentProviderForm';
import useProviderCredentials from '../hooks/useProviderCredentials';

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
  // Same shape, and for the mirror-image reason: an unread setting must never read as "the till
  // stopped asking for a customer". Both default to the strict side of their own column.
  const [savedPosCustomer, setSavedPosCustomer] = useState(
    settings?.pos_customer_required !== false,
  );
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
  // One hook per provider, each with its own row, flags and messages. Click's version was nine
  // `useState` calls and four handlers written out longhand here; Payme would have been a second
  // copy of all of it, which is how two cards end up behaving differently after a fix lands in
  // only one of them.
  const click = useProviderCredentials('click');
  const payme = useProviderCredentials('payme');

  const applyRow = useCallback((data) => {
    setSavedName(data?.shop_name || '');
    setSavedNasiya(data?.nasiya_enabled !== false);
    setSavedPosCustomer(data?.pos_customer_required !== false);
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

  useEffect(() => {
    load();
    // The provider cards load themselves -- see `useProviderCredentials`. Deliberately not here:
    // only an Admin may read credentials, so a 403 on them is a normal answer for some roles and
    // must never surface as "settings failed to load".
  }, [load]);


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

  /**
   * Every string a credentials card needs, for one provider.
   *
   * Built from a prefix rather than written twice: the Click card had twenty-six label lines, and
   * a second hand-written set is twenty-six chances for the two cards to disagree about a word.
   * A provider that has no `cashboxId` string simply gets `undefined` for a field it never renders.
   */
  const providerLabels = (prefix) => ({
    loading: t('actions.loadingPage', { ns: 'common' }),
    title: t(`${prefix}.title`),
    intro: t(`${prefix}.intro`),
    serviceId: t(`${prefix}.serviceId`),
    merchantUserId: t(`${prefix}.merchantUserId`),
    cashboxId: t(`${prefix}.cashboxId`),
    cashboxIdHint: t(`${prefix}.cashboxIdHint`),
    secretKey: t(`${prefix}.secretKey`),
    secretStored: t(`${prefix}.secretStored`),
    secretMissing: t(`${prefix}.secretMissing`),
    secretKeepHint: t(`${prefix}.secretKeepHint`),
    secretNewHint: t(`${prefix}.secretNewHint`),
    clearSecret: t(`${prefix}.clearSecret`),
    clearing: t(`${prefix}.clearing`),
    cashboxCode: t(`${prefix}.cashboxCode`),
    cashboxHint: t(`${prefix}.cashboxHint`),
    enabledLabel: t(`${prefix}.enabledLabel`),
    enabledHint: t(`${prefix}.enabledHint`),
    check: t(`${prefix}.check`),
    checking: t(`${prefix}.checking`),
    checkOk: t(`${prefix}.checkOk`),
    checkNotReady: t(`${prefix}.checkNotReady`),
    checkNoCharge: t(`${prefix}.checkNoCharge`),
    checkChecksSaved: t(`${prefix}.checkChecksSaved`),
    checkNeedsSave: t(`${prefix}.checkNeedsSave`),
    save: t('form.save'),
    saving: t('form.saving'),
  });

  const saveProvider = (hook) => (values) => hook.save(values, {
    errorMessage, savedMessage: t('saved'),
  });

  const checkProvider = (hook) => () => hook.runCheck({ errorMessage });

  const clearProvider = (hook, prefix) => () => hook.clearSecret({
    errorMessage,
    savedMessage: t('saved'),
    confirmMessage: t(`${prefix}.confirmClear`),
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('title')}</h1>
      </div>
      <p className="page-intro">{t('intro')}</p>

      {/*
        Grouped by the question each card answers, rather than listed. The two payment providers
        belong together and read as a pair under one heading; the shop's name and its feature
        switches are both "about this shop" but do very different things, so they sit side by side
        under one heading and keep their separate Saves.

        Widths and columns come from `.settings-group__cards` in TablePage.css -- see the note
        there on why they could not stay as inline styles on the cards.
      */}
      <section className="settings-group">
        <h2 className="settings-group__title">{t('groups.shop')}</h2>
        <div className="settings-group__cards">
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
            initialPosCustomerRequired={savedPosCustomer}
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
              posCustomerLabel: t('form.posCustomer'),
              posCustomerHint: t('form.posCustomerHint'),
              save: t('form.save'),
              saving: t('form.saving'),
            }}
          />
        </div>
      </section>

      {/* Hidden rather than shown-and-refused when the role cannot read them: the hook swallows
          the 403 and leaves the row null, so a CEO sees the page without a card they cannot use.

          The heading goes with them. A group title over an empty grid reads as a card that failed
          to load, which is the one thing this page must not imply about payment credentials. */}
      {click.row || payme.row ? (
        <section className="settings-group">
          <h2 className="settings-group__title">{t('groups.payments')}</h2>
          <div className="settings-group__cards">
            {click.row ? (
              <PaymentProviderForm
                provider="click"
                fields={CLICK_FIELDS}
                initial={click.row}
                loading={click.loading}
                saving={click.saving}
                checking={click.checking}
                clearing={click.clearing}
                error={click.error}
                success={click.success}
                checkResult={click.check}
                onSave={saveProvider(click)}
                onCheck={checkProvider(click)}
                onClearSecret={clearProvider(click, 'click')}
                labels={providerLabels('click')}
              />
            ) : null}

            {payme.row ? (
              <PaymentProviderForm
                provider="payme"
                fields={PAYME_FIELDS}
                initial={payme.row}
                loading={payme.loading}
                saving={payme.saving}
                checking={payme.checking}
                clearing={payme.clearing}
                error={payme.error}
                success={payme.success}
                checkResult={payme.check}
                onSave={saveProvider(payme)}
                onCheck={checkProvider(payme)}
                onClearSecret={clearProvider(payme, 'payme')}
                labels={providerLabels('payme')}
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default Settings;
