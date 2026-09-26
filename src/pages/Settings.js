import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import './TablePage.css';
import { useSettings } from '../contexts/SettingsContext';
import ShopSettingsForm from './ShopSettingsForm';

/**
 * Sozlamalar — where the shop sets its own name.
 *
 * Only an Admin reaches this page: the route is gated on `settings.manage`, which the Founder role
 * is withheld from at the owner's request. The server checks the same code, so the gate here is for
 * the menu and the URL bar, not for security.
 *
 * Saving refreshes the app-wide settings so the sidebar, the browser tab and the next printed chek
 * pick up the new name without a reload.
 */
const Settings = () => {
  const { t } = useTranslation(['settings', 'common']);
  const { settings, refreshSettings } = useSettings();

  const [savedName, setSavedName] = useState(settings?.shop_name || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings/');
      setSavedName(data?.shop_name || '');
    } catch {
      setError(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (shopName) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.patch('/settings/', { shop_name: shopName });
      // The server normalises the name — it trims what was typed — so the box is filled from the
      // response rather than from the request. Otherwise '  Lady Luxe  ' would sit on screen as
      // though it had been saved that way.
      setSavedName(data?.shop_name || '');
      setSuccess(t('saved'));
      // Everywhere else the name appears: the sidebar, the tab title, the next chek.
      await refreshSettings();
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.shop_name?.[0] || data?.detail || data?.error || t('errors.saveFailed');
      setError(typeof msg === 'string' ? msg : t('errors.saveFailed'));
    } finally {
      setSaving(false);
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
        saving={saving}
        error={error}
        success={success}
        onSave={handleSave}
        labels={{
          loading: t('actions.loadingPage', { ns: 'common' }),
          shopNameLabel: t('form.shopName'),
          shopNameHint: t('form.shopNameHint'),
          save: t('form.save'),
          saving: t('form.saving'),
        }}
      />
    </div>
  );
};

export default Settings;
