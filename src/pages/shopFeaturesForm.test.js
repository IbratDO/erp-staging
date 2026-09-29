/**
 * The card that says what the shop does.
 *
 * Separate from the name card because switching a feature off changes who can do what, not just a
 * label — so it saves on its own and its own failure never paints an error across the name.
 *
 * The property that matters most here is the **default**. A switch that rendered unchecked while the
 * real value was unknown would read as "this shop does not sell on nasiya" to whoever was looking, and
 * one press of Save would make that true. So absent means on, matching the column default.
 *
 * Rendered with raw `react-dom/client` and `act`, which is how every component test in this repo works.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ShopFeaturesForm from './ShopFeaturesForm';

const labels = {
  loading: 'Yuklanmoqda…',
  featuresTitle: 'Imkoniyatlar',
  featuresIntro: 'Do‘kon qaysi imkoniyatlardan foydalanadi.',
  nasiyaLabel: 'Nasiya savdo',
  nasiyaHint: 'O‘chirilsa, yangi nasiya ochilmaydi.',
  save: 'Saqlash',
  saving: 'Saqlanmoqda…',
};

let container;
let root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props = {}) => {
  act(() => {
    root.render(<ShopFeaturesForm labels={labels} {...props} />);
  });
};

const toggle = () => container.querySelector('#nasiya-enabled');
const submit = () => container.querySelector('button[type="submit"]');

describe('the nasiya switch', () => {
  it('starts from the saved value', () => {
    render({ initialNasiya: true });
    expect(toggle().checked).toBe(true);
    render({ initialNasiya: false });
    expect(toggle().checked).toBe(false);
  });

  it('defaults to on when nothing says otherwise', () => {
    // Matches the column default. Rendering it off while the value is unknown would misreport the
    // shop, and one Save would make the misreport true.
    render({});
    expect(toggle().checked).toBe(true);
  });

  it('catches up when the saved value arrives after the first paint', () => {
    render({ initialNasiya: true });
    render({ initialNasiya: false });
    expect(toggle().checked).toBe(false);
  });

  it('does not lose an unsaved click when the parent re-renders', () => {
    // Any re-render — a toast, a saving flag — would reset the switch if the sync were unconditional.
    render({ initialNasiya: true });
    act(() => toggle().click());
    render({ initialNasiya: true, error: 'something else happened' });
    expect(toggle().checked).toBe(false);
  });
});

describe('saving', () => {
  it('sends only the feature it owns', () => {
    // Not the name: a partial PATCH is what stops this card overwriting the other one.
    const onSave = jest.fn();
    render({ initialNasiya: true, onSave });
    act(() => toggle().click());
    act(() => submit().click());
    expect(onSave).toHaveBeenCalledWith({ nasiya_enabled: false });
  });

  it('can switch it back on', () => {
    const onSave = jest.fn();
    render({ initialNasiya: false, onSave });
    act(() => toggle().click());
    act(() => submit().click());
    expect(onSave).toHaveBeenCalledWith({ nasiya_enabled: true });
  });

  it('saves an unchanged value rather than doing nothing', () => {
    const onSave = jest.fn();
    render({ initialNasiya: true, onSave });
    act(() => submit().click());
    expect(onSave).toHaveBeenCalledWith({ nasiya_enabled: true });
  });

  it('does not fire while a save is already in flight', () => {
    // Through the form, not the button: a click on a disabled button never reaches the handler, so
    // clicking would pass whether the guard existed or not.
    const onSave = jest.fn();
    render({ initialNasiya: true, onSave, saving: true });
    act(() => {
      container.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('returns the promise so the button stays held for the whole request', async () => {
    let resolveSave;
    const onSave = jest.fn(() => new Promise((r) => { resolveSave = r; }));
    render({ initialNasiya: true, onSave });
    await act(async () => {
      container.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(submit().disabled).toBe(true);
    await act(async () => {
      resolveSave();
    });
    expect(submit().disabled).toBe(false);
  });

  it('survives having no handler at all', () => {
    render({});
    expect(() => act(() => submit().click())).not.toThrow();
  });
});

describe('what it tells the user', () => {
  it('shows its own error, not the name card’s', () => {
    render({ error: 'Saqlanmadi.' });
    expect(container.querySelector('.error-message').textContent).toBe('Saqlanmadi.');
  });

  it('shows a success note when there is one', () => {
    render({ success: 'Saqlandi.' });
    expect(container.querySelector('.success-message').textContent).toBe('Saqlandi.');
  });

  it('explains what the section is for and what switching it off does', () => {
    render({});
    expect(container.textContent).toContain('Imkoniyatlar');
    expect(container.textContent).toContain('Do‘kon qaysi imkoniyatlardan foydalanadi.');
    expect(container.textContent).toContain('O‘chirilsa, yangi nasiya ochilmaydi.');
  });

  it('shows nothing to switch while it is loading', () => {
    render({ loading: true });
    expect(toggle()).toBeNull();
    expect(container.textContent).toContain('Yuklanmoqda…');
  });
});
