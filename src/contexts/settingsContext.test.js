/**
 * Where the shop's name comes from, and what happens when it cannot be fetched.
 *
 * This is the only place in the app that talks to the settings endpoints, so four decisions live
 * here and nowhere else:
 *
 *   * the **first** fetch goes to the public route, because this provider mounts around the login
 *     screen and whoever is looking at that has no token;
 *   * a fetch that fails **keeps** whatever name we already had. This is the property the whole
 *     cache exists for: a chek must never print nameless because one request timed out;
 *   * the public route carries only `shop_name`, so its answer is **merged** into the row rather
 *     than replacing it — otherwise a refresh would drop the address and phone every time;
 *   * the row is written to localStorage, so the *next* cold start has a name before the network
 *     answers.
 *
 * A mutation test showed the last one was undetectable without this file: deleting the cache write
 * broke nothing that any test asked about.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SettingsProvider, useSettings } from './SettingsContext';
import api from '../utils/api';
import { SHOP_SETTINGS_STORAGE_KEY } from '../utils/shopIdentity';

jest.mock('../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

let container;
let root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  api.get.mockReset();
  localStorage.clear();
  document.title = 'ERP - Sneaker Shop';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Shows the name, and exposes `refreshSettings` through a button so a test can trigger it. */
const Probe = () => {
  const { settings, refreshSettings } = useSettings();
  return (
    <div>
      <span data-testid="name">{settings?.shop_name ?? '(none)'}</span>
      <span data-testid="phone">{settings?.phone ?? '(none)'}</span>
      <button type="button" onClick={() => refreshSettings()}>refresh</button>
    </div>
  );
};

const mount = async () => {
  await act(async () => {
    root.render(<SettingsProvider><Probe /></SettingsProvider>);
  });
};

const text = (id) => container.querySelector(`[data-testid="${id}"]`).textContent;
const cached = () => JSON.parse(localStorage.getItem(SHOP_SETTINGS_STORAGE_KEY) || 'null');

describe('the first fetch', () => {
  it('asks the public route, because nobody is signed in yet', async () => {
    api.get.mockResolvedValue({ data: { shop_name: 'Immense Shop' } });
    await mount();
    expect(api.get).toHaveBeenCalledWith('/settings/public/');
    expect(text('name')).toBe('Immense Shop');
  });

  it('does not ask the authenticated route on mount', async () => {
    api.get.mockResolvedValue({ data: { shop_name: 'Immense Shop' } });
    await mount();
    expect(api.get).not.toHaveBeenCalledWith('/settings/');
  });

  it('puts the name in the browser tab', async () => {
    api.get.mockResolvedValue({ data: { shop_name: 'Lady Luxe Shop' } });
    await mount();
    expect(document.title).toBe('Lady Luxe Shop');
  });

  it('leaves the tab alone when there is no name to show', async () => {
    // A fresh deployment, before an Admin has typed one. Better the product name than a blank tab.
    api.get.mockResolvedValue({ data: { shop_name: '' } });
    await mount();
    expect(document.title).toBe('ERP - Sneaker Shop');
  });
});

describe('the cache', () => {
  it('remembers the row for the next cold start', async () => {
    api.get.mockResolvedValue({ data: { shop_name: 'Immense Shop' } });
    await mount();
    expect(cached()).toEqual({ shop_name: 'Immense Shop' });
  });

  it('has a name before the network answers, on a later visit', async () => {
    localStorage.setItem(
      SHOP_SETTINGS_STORAGE_KEY, JSON.stringify({ shop_name: 'Immense Shop' }),
    );
    // Never resolves — this is the slow-network case, not the failure case.
    api.get.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      root.render(<SettingsProvider><Probe /></SettingsProvider>);
    });
    expect(text('name')).toBe('Immense Shop');
  });
});

describe('when the request fails', () => {
  it('keeps the cached name rather than blanking it', async () => {
    // The property the cache exists for. A chek printed in this state still names the shop.
    localStorage.setItem(
      SHOP_SETTINGS_STORAGE_KEY, JSON.stringify({ shop_name: 'Immense Shop' }),
    );
    api.get.mockRejectedValue(new Error('offline'));
    await mount();
    expect(text('name')).toBe('Immense Shop');
  });

  it('does not throw', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    await expect(mount()).resolves.toBeUndefined();
    expect(text('name')).toBe('(none)');
  });

  it('survives a body that is not an object', async () => {
    api.get.mockResolvedValue({ data: 'Immense Shop' });
    await mount();
    expect(text('name')).toBe('(none)');
  });
});

describe('refreshing the full row', () => {
  it('reads the authenticated route and keeps the fields the public one does not carry', async () => {
    api.get.mockResolvedValueOnce({ data: { shop_name: 'Immense Shop' } });
    await mount();
    api.get.mockResolvedValueOnce({
      data: { shop_name: 'Immense Shop', phone: '+998 90 000 00 00' },
    });
    await act(async () => {
      container.querySelector('button').click();
    });
    expect(api.get).toHaveBeenLastCalledWith('/settings/');
    expect(text('phone')).toBe('+998 90 000 00 00');
  });

  it('merges rather than replaces, so a name-only answer cannot drop the phone', async () => {
    // The public route returns `shop_name` alone. Replacing the row with it would blank everything
    // else on every refresh — and the settings page refreshes right after saving.
    api.get.mockResolvedValueOnce({ data: { shop_name: 'Immense Shop' } });
    await mount();
    api.get.mockResolvedValueOnce({
      data: { shop_name: 'Immense Shop', phone: '+998 90 000 00 00' },
    });
    await act(async () => {
      container.querySelector('button').click();
    });
    // Now a public-shaped answer arrives again, as it would on any later refresh.
    api.get.mockResolvedValueOnce({ data: { shop_name: 'Lady Luxe Shop' } });
    await act(async () => {
      container.querySelector('button').click();
    });
    expect(text('name')).toBe('Lady Luxe Shop');
    expect(text('phone')).toBe('+998 90 000 00 00');
  });
});

describe('using it outside the provider', () => {
  it('throws, rather than silently reading nothing', async () => {
    // A page that read `undefined` here would print a nameless chek and look like it worked.
    const Bare = () => {
      useSettings();
      return null;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        createRoot(document.createElement('div')).render(<Bare />);
      });
    }).toThrow(/SettingsProvider/);
    spy.mockRestore();
  });
});
