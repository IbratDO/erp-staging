import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../utils/api';
import {
  readCachedShopSettings,
  writeCachedShopSettings,
} from '../utils/shopIdentity';

/**
 * The shop's own settings, available to the whole app — including before anyone signs in.
 *
 * **Why this sits outside `AuthProvider`.** The login screen shows the shop's name, and whoever is
 * looking at the login screen has no token. So the first fetch goes to `/settings/public/`, which
 * answers anonymously with the name and nothing else. Once somebody is signed in, `refreshSettings`
 * reads `/settings/` for the whole row — the address and phone the settings page edits.
 *
 * The cache in localStorage is not an optimisation. It is what makes a failed request harmless: a
 * cold start with no network still knows what the shop is called, so a chek still prints a name.
 * See `utils/shopIdentity.js` for the full chain and why the locale string is still its last rung.
 */

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider = ({ children }) => {
  // Seeded from the cache so the first paint has a name rather than a gap that fills in late.
  const [settings, setSettings] = useState(() => readCachedShopSettings());
  const [loading, setLoading] = useState(true);

  const fetchFrom = useCallback(async (url) => {
    try {
      const { data } = await api.get(url);
      if (!data || typeof data !== 'object') return null;
      setSettings((prev) => {
        // Merged, not replaced: the public route carries only `shop_name`, and overwriting a full
        // row with it would drop the address and phone every time this ran.
        const next = { ...(prev || {}), ...data };
        writeCachedShopSettings(next);
        return next;
      });
      return data;
    } catch {
      // Keep whatever we already had. A settings request that fails must never blank the name.
      return null;
    }
  }, []);

  /** The full row. For signed-in callers — the settings page calls this after saving. */
  const refreshSettings = useCallback(() => fetchFrom('/settings/'), [fetchFrom]);

  /** Just the name, for callers with no token. */
  const refreshPublicSettings = useCallback(
    () => fetchFrom('/settings/public/'),
    [fetchFrom],
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // The public route, because this runs before we know whether anyone is signed in. It is
      // authoritative for the name, which is all the login screen and the sidebar need; the rest of
      // the row arrives when the settings page asks for it.
      await refreshPublicSettings();
      if (!cancelled) setLoading(false);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [refreshPublicSettings]);

  // The browser tab. `public/index.html` ships a static <title> that cannot read the database, so
  // the shop's name has to be applied here, at runtime, once we know it.
  useEffect(() => {
    const name = settings?.shop_name?.trim();
    if (name) document.title = name;
  }, [settings]);

  const value = {
    settings,
    loading,
    refreshSettings,
    refreshPublicSettings,
    setSettings,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};
