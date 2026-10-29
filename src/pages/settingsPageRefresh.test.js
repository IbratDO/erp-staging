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

const CLICK_ROW = {
  provider: 'click',
  enabled: false,
  service_id: '',
  merchant_user_id: '',
  cashbox_code: '',
  secret_set: false,
  version: 1,
};

// Payme identifies itself with a cashbox id and has neither of Click's two. The rows differ because
// the providers differ -- a mock that returned Click's shape for both would hide a card asking for
// fields its provider does not have.
const PAYME_ROW = {
  provider: 'payme',
  enabled: false,
  payme_merchant_id: '',
  secret_set: false,
  version: 1,
};

// `/settings/` and `/settings/payment-providers/click/` are different endpoints with different
// permissions, so one blanket mock would have the page believing a cashier can read the merchant
// credentials. The default here is the common case: a role that may manage the shop's name but not
// its payment providers, which is what the server answers with a 403.
const mockGet = ({ clickAccess = false } = {}) => {
  api.get.mockImplementation((url) => {
    if (String(url).includes('payment-providers')) {
      if (!clickAccess) return Promise.reject({ response: { status: 403 } });
      return Promise.resolve({
        data: String(url).includes('/payme/') ? PAYME_ROW : CLICK_ROW,
      });
    }
    return Promise.resolve({ data: ROW });
  });
};

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
  mockGet();
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

describe('the page is separate cards', () => {
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

describe('the payment provider card', () => {
  it('is absent for a role that may not read the credentials', async () => {
    // Hidden rather than shown-and-refused: a CEO may take Click payments and may not hold the
    // merchant secret, so a card they can only be told off for opening is worse than no card.
    await mount();
    expect(container.querySelector('#click-service-id')).toBeNull();
    expect(forms()).toHaveLength(2);
  });

  it('appears for a role that may, one card per provider, each with its own save', async () => {
    // Four forms now: the shop name, the features, and one credentials card per provider. Each
    // provider has its own Save because each has its own row -- a failed Payme save must not paint
    // an error across the Click card.
    mockGet({ clickAccess: true });
    await mount();
    expect(container.querySelector('#click-service-id')).not.toBeNull();
    expect(container.querySelector('#payme-cashbox-id')).not.toBeNull();
    expect(forms()).toHaveLength(4);
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(4);
  });

  it('asks each provider only for the fields it actually has', async () => {
    // Payme has no service id and no merchant user id. Rendering Click's fields on the Payme card
    // would be a form asking for credentials that do not exist.
    mockGet({ clickAccess: true });
    await mount();
    expect(container.querySelector('#payme-service-id')).toBeNull();
    expect(container.querySelector('#payme-merchant-user')).toBeNull();
    expect(container.querySelector('#click-cashbox-id')).toBeNull();
  });

  it('sends only the credentials, so it cannot clobber the name', async () => {
    // The same property the other two cards have, and the reason all three are separate PATCHes.
    mockGet({ clickAccess: true });
    await mount();
    await submitForm(2);
    const [url, body] = api.patch.mock.calls[0];
    expect(url).toBe('/settings/payment-providers/click/');
    expect(body).not.toHaveProperty('shop_name');
    expect(body).not.toHaveProperty('nasiya_enabled');
  });

  it('does not refresh the user, because credentials mask no permissions', async () => {
    // Unlike a feature switch: that one has to re-read /users/me/ or the menu lies. Credentials
    // change what the till can talk to, not what anyone is allowed to do.
    mockGet({ clickAccess: true });
    await mount();
    await submitForm(2);
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('a failed credentials read does not report the page as broken', async () => {
    // The 403 is a normal answer for most roles. Surfacing it as "settings failed to load" would
    // have every Sales Manager seeing an error on a page that is working perfectly.
    await mount();
    expect(container.textContent).not.toContain('errors.loadFailed');
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
    expect(api.patch).toHaveBeenCalledWith('/settings/', {
      nasiya_enabled: true, pos_customer_required: true,
    });
    // Still only the switches. The name is on its own card with its own PATCH, which is what
    // stops one Save overwriting the other.
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty('shop_name');
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
    expect(api.patch).toHaveBeenCalledWith('/settings/', {
      nasiya_enabled: false, pos_customer_required: true,
    });
  });

  it('carries the till-customer switch through too', async () => {
    await mount();
    await act(async () => {
      container.querySelector('#pos-customer-required').click();
    });
    await submitForm(1);
    expect(api.patch).toHaveBeenCalledWith('/settings/', {
      nasiya_enabled: true, pos_customer_required: false,
    });
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


describe('showing the server\'s reason', () => {
  // Found in the wild: the credentials card refused with a perfectly clear sentence under the
  // `enabled` key, and the page showed the generic "saving failed" because the error reader named
  // `shop_name` and nothing else. The log showed four Saves in four seconds - which is what
  // somebody does when the screen will not tell them what is wrong.
  const refuse = (data) => {
    api.patch.mockReset();
    api.patch.mockRejectedValue({ response: { status: 400, data } });
  };

  it('shows a field error whatever key it arrives under', async () => {
    mockGet({ clickAccess: true });
    await mount();
    refuse({ enabled: ['Fill Merchant User ID before switching this provider on.'] });
    await submitForm(2);
    expect(container.textContent).toContain('Fill Merchant User ID');
    expect(container.textContent).not.toContain('errors.saveFailed');
  });

  it('still shows a shop_name error on the name card', async () => {
    await mount();
    refuse({ shop_name: ['This field may not be blank.'] });
    await submitForm(0);
    expect(container.textContent).toContain('This field may not be blank.');
  });

  it('prefers a plain detail or error message when there is one', async () => {
    await mount();
    refuse({ detail: 'You do not have permission to perform this action.' });
    await submitForm(0);
    expect(container.textContent).toContain('do not have permission');
  });

  it('shows non_field_errors too', async () => {
    mockGet({ clickAccess: true });
    await mount();
    refuse({ non_field_errors: ['Something is inconsistent.'] });
    await submitForm(2);
    expect(container.textContent).toContain('Something is inconsistent.');
  });

  it('falls back to the generic message when the body says nothing useful', async () => {
    await mount();
    refuse({ enabled: [{ nested: 'object' }] });
    await submitForm(0);
    expect(container.textContent).toContain('errors.saveFailed');
  });

  it('falls back when there is no body at all', async () => {
    await mount();
    api.patch.mockReset();
    api.patch.mockRejectedValue(new Error('network down'));
    await submitForm(0);
    expect(container.textContent).toContain('errors.saveFailed');
  });
});

describe('when the server itself fails', () => {
  // A valid form the server cannot process -- a missing library, an unapplied migration -- answers
  // 500 with an HTML error page, not JSON. The page used to read that as "saving failed, try
  // again", which is the one piece of advice guaranteed not to work: the owner pressed Save four
  // times in four seconds the first time it happened, and it happened again on a fresh staging
  // deploy.
  it('says it is a server problem rather than inviting a retry', async () => {
    await mount();
    api.patch.mockReset();
    api.patch.mockRejectedValue({
      response: { status: 500, data: '<!doctype html><title>Server Error (500)</title>' },
    });
    await submitForm(0);
    expect(container.textContent).toContain('errors.serverError');
    expect(container.textContent).not.toContain('errors.saveFailed');
  });

  it('still reads a normal validation failure', async () => {
    // The status check must not swallow the 400s the page already explains well.
    await mount();
    api.patch.mockReset();
    api.patch.mockRejectedValue({
      response: { status: 400, data: { shop_name: ['This field may not be blank.'] } },
    });
    await submitForm(0);
    expect(container.textContent).toContain('This field may not be blank.');
  });
});
