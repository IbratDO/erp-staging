import { useCallback, useEffect, useState } from 'react';

import api from '../utils/api';

/**
 * One payment provider's credentials card: its row, its flags, and the four things it can do.
 *
 * Extracted when Payme arrived. Click's version was nine `useState` calls and four handlers written
 * out longhand in `Settings.js`, and a second provider meant a second copy of all of it with
 * `click` swapped for `payme` — which is how two cards end up behaving differently a year later
 * because a fix landed in one of them.
 *
 * **Each provider keeps its own everything.** A failed Payme save must not paint an error across
 * the Click card, the same reason the credentials state was separate from the shop-name state in
 * the first place.
 *
 * The endpoint has been per-provider since it was written — `settings/payment-providers/<provider>/`
 * validates against `PROVIDER_CHOICES` — so nothing on the server changed to allow this.
 */
export default function useProviderCredentials(provider, { onSaved } = {}) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [check, setCheck] = useState(null);

  const url = `/settings/payment-providers/${provider}/`;

  /**
   * Loaded separately from the rest of the page on purpose: only an Admin may read credentials, so
   * a 403 here is a normal answer for some roles and must not surface as "settings failed to load".
   * Swallowing it leaves `row` null, and the card is simply not rendered.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(url);
      setRow(data);
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (values, { errorMessage, savedMessage }) => {
    setError('');
    setSuccess('');
    // A stale "ready to go" panel beside freshly changed credentials would be a lie.
    setCheck(null);
    setSaving(true);
    try {
      const { data } = await api.patch(url, values);
      // From the response: the secret is never echoed back, so `secret_set` is the only way the
      // form learns that what it just sent was stored.
      setRow(data);
      setSuccess(savedMessage);
      onSaved?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async ({ errorMessage }) => {
    setError('');
    setChecking(true);
    try {
      const { data } = await api.post(url, { action: 'check' });
      setCheck(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const clearSecret = async ({ errorMessage, savedMessage, confirmMessage }) => {
    // Confirmed, because it switches the provider off: the till stops taking that provider's
    // payments the moment it succeeds, and there is no undo short of typing the secret in again.
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError('');
    setSuccess('');
    setCheck(null);
    setClearing(true);
    try {
      const { data } = await api.post(url, { action: 'clear_secret' });
      setSuccess(data?.message || savedMessage);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  return {
    row, loading, saving, checking, clearing, error, success, check,
    save, runCheck, clearSecret, reload: load,
  };
}
