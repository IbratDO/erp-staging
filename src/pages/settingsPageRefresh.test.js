/**
 * Saving a feature switch has to refresh **two** things, and forgetting the second was a real bug.
 *
 * A feature switch takes effect on the server by masking permission codes, and the frontend learns its
 * permissions from `/users/me/`. So refreshing the settings row alone updates the shop's name
 * everywhere and leaves the menu and the Nasiya checkbox showing the old answer — the toggle appears
 * to do nothing until the page is reloaded by hand, which is exactly what was reported.
 *
 * Nothing else in this repo renders a page in a test, because pages need their providers. The contexts
 * are mocked here instead of provided, which keeps the test about the one decision worth pinning: what
 * gets refreshed after which save.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import Settings from './Settings';
import api from '../utils/api';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../hooks/usePermissions';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
}));
jest.mock('../contexts/SettingsContext', () => ({ useSettings: jest.fn() }));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: jest.fn() }));
jest.mock('react-i18next', () => {
  // Keys straight through, so an assertion reads as the key it is about — and **one** `t`, created
  // once. Handing back a fresh function per call changes the identity of the page's `load` callback
  // on every render, its effect re-runs, and the render never settles. Real i18next returns a stable
  // `t`, so this is a property of the mock rather than of the page.
  const t = (key) => key;
  return { useTranslation: () => ({ t }) };
});

let container;
let root;
let refreshSettings;
let refreshUser;

const ROW = { shop_name: 'Immense Shop', nasiya_enabled: true };

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
  api.get.mockResolvedValue({ data: ROW });
  api.patch.mockImplementation((_url, body) => Promise.resolve({ data: { ...ROW, ...body } }));
  refreshSettings = jest.fn().mockResolvedValue(undefined);
  refreshUser = jest.fn().mockResolvedValue(undefined);
  useSettings.mockReturnValue({ settings: ROW, refreshSettings });
  usePermissions.mockReturnValue({ refreshUser });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = async () => {
  await act(async () => {
    root.render(<Settings />);
  });
};

const forms = () => Array.from(container.querySelectorAll('form'));
const submitForm = async (index) => {
  await act(async () => {
    forms()[index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

describe('the page is two separate cards', () => {
  it('renders a form for the name and a form for the features', async () => {
    await mount();
    expect(forms()).toHaveLength(2);
    expect(container.querySelector('#shop-name')).not.toBeNull();
    expect(container.querySelector('#nasiya-enabled')).not.toBeNull();
  });

  it('each card carries its own save button', async () => {
    await mount();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(2);
  });
});

describe('saving the name', () => {
  it('sends only the name', async () => {
    await mount();
    await submitForm(0);
    expect(api.patch).toHaveBeenCalledWith('/settings/', { shop_name: 'Immense Shop' });
  });

  it('refreshes the settings, because the name is on the chek and in the sidebar', async () => {
    await mount();
    await submitForm(0);
    expect(refreshSettings).toHaveBeenCalled();
  });
});

describe('saving a feature switch', () => {
  it('sends only the switch, so it cannot clobber the name', async () => {
    await mount();
    await submitForm(1);
    expect(api.patch).toHaveBeenCalledWith('/settings/', { nasiya_enabled: true });
  });

  it('refreshes the settings AND the user', async () => {
    // The second call is the whole point. Without it the switch saves, the server masks the codes,
    // and the menu keeps showing Qarzdorlik until somebody reloads by hand.
    await mount();
    await submitForm(1);
    expect(refreshSettings).toHaveBeenCalled();
    expect(refreshUser).toHaveBeenCalled();
  });

  it('carries the flipped value through', async () => {
    await mount();
    await act(async () => {
      container.querySelector('#nasiya-enabled').click();
    });
    await submitForm(1);
    expect(api.patch).toHaveBeenCalledWith('/settings/', { nasiya_enabled: false });
  });

  it('does not refresh the user when the save failed', async () => {
    // Re-reading permissions after a rejected write would be noise at best, and at worst would look
    // like the switch had taken effect.
    api.patch.mockRejectedValueOnce({ response: { data: { detail: 'Nasiya is locked' } } });
    await mount();
    await submitForm(1);
    expect(refreshUser).not.toHaveBeenCalled();
    // The server's own sentence, not a generic fallback — the reason is worth showing.
    expect(container.textContent).toContain('Nasiya is locked');
  });
});

describe('the two cards do not share their state', () => {
  it('a failed feature save leaves no error on the name card', async () => {
    api.patch.mockRejectedValueOnce({ response: { data: {} } });
    await mount();
    await submitForm(1);
    // One error message on the page, and it belongs to the features form.
    const errors = container.querySelectorAll('.error-message');
    expect(errors).toHaveLength(1);
    expect(forms()[1].contains(errors[0])).toBe(true);
  });

  it('a failed name save leaves no error on the features card', async () => {
    api.patch.mockRejectedValueOnce({ response: { data: {} } });
    await mount();
    await submitForm(0);
    const errors = container.querySelectorAll('.error-message');
    expect(errors).toHaveLength(1);
    expect(forms()[0].contains(errors[0])).toBe(true);
  });
});
