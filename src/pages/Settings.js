import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import './TablePage.css';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../hooks/usePermissions';
import ShopSettingsForm from './ShopSettingsForm';
import ShopFeaturesForm from './ShopFeaturesForm';

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

  useEffect(() => {
    load();
  }, [load]);

  const errorMessage = (err) => {
    const data = err.response?.data;
    const msg = data?.shop_name?.[0] || data?.detail || data?.error || t('errors.saveFailed');
    return typeof msg === 'string' ? msg : t('errors.saveFailed');
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
    </div>
  );
};

export default Settings;
