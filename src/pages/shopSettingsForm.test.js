/**
 * The box the shop's name is typed into.
 *
 * Small, but three of its properties are the kind that only show up in front of a real user:
 *
 *   * the saved name arrives *after* the first paint, so the box has to catch up — without throwing
 *     away what somebody is halfway through typing;
 *   * pressing Save twice must not send two writes;
 *   * what the server normalised is what the box should end up showing, not what was typed.
 *
 * Rendered with raw `react-dom/client` and `act`, which is how every component test in this repo
 * works — there is no React Testing Library here. That is also why the form takes its values as
 * props: a component that reached for `useSettings()` itself could not be mounted on its own.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ShopSettingsForm from './ShopSettingsForm';

const labels = {
  loading: 'Yuklanmoqda…',
  shopNameLabel: 'Do‘kon nomi',
  shopNameHint: 'Chekda shu nom chiqadi.',
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
    root.render(<ShopSettingsForm labels={labels} {...props} />);
  });
};

const input = () => container.querySelector('#shop-name');
const submit = () => container.querySelector('button[type="submit"]');

// Through the native value setter, not `el.value = x`: React tracks the last value it wrote and
// treats a direct assignment as no change, so the onChange never fires. Same helper as
// `components/customerQuickAdd.test.js`.
const type = (value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  ).set;
  act(() => {
    const el = input();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('while it is loading', () => {
  it('shows nothing to type into', () => {
    render({ loading: true });
    expect(input()).toBeNull();
    expect(container.textContent).toContain('Yuklanmoqda…');
  });
});

describe('the box', () => {
  it('starts with the saved name', () => {
    render({ initialName: 'Immense Shop' });
    expect(input().value).toBe('Immense Shop');
  });

  it('catches up when the saved name arrives after the first paint', () => {
    // The real sequence: the page renders, then the GET answers.
    render({ initialName: '' });
    expect(input().value).toBe('');
    render({ initialName: 'Immense Shop' });
    expect(input().value).toBe('Immense Shop');
  });

  it('does not throw away what is being typed when the parent re-renders', () => {
    // Any re-render — a toast appearing, a saving flag flipping — would reset the box if the sync
    // were unconditional rather than keyed on the saved value.
    render({ initialName: 'Immense Shop' });
    type('Lady Luxe Shop');
    render({ initialName: 'Immense Shop', error: 'something else happened' });
    expect(input().value).toBe('Lady Luxe Shop');
  });

  it('will not accept more than the column holds', () => {
    render({});
    expect(input().maxLength).toBe(120);
  });
});

describe('saving', () => {
  it('hands over what was typed', () => {
    const onSave = jest.fn();
    render({ initialName: 'Immense Shop', onSave });
    type('Lady Luxe Shop');
    act(() => {
      submit().click();
    });
    expect(onSave).toHaveBeenCalledWith({ shop_name: 'Lady Luxe Shop' });
  });

  it('sends an emptied box through, rather than silently doing nothing', () => {
    // Clearing the name is a legitimate act — it returns the shop to the bundled default.
    const onSave = jest.fn();
    render({ initialName: 'Immense Shop', onSave });
    type('');
    act(() => {
      submit().click();
    });
    expect(onSave).toHaveBeenCalledWith({ shop_name: '' });
  });

  it('does not fire again while a save is already in flight', () => {
    // Submitted through the form, not the button, and that distinction is the whole test: a click
    // on a disabled button never reaches the handler, so clicking would pass whether the guard
    // exists or not. Pressing Enter in the text box submits the form directly — which is exactly
    // the path a disabled submit button does not reliably block.
    const onSave = jest.fn();
    render({ initialName: 'Immense Shop', onSave, saving: true });
    act(() => {
      container.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does fire on that same path when nothing is in flight', () => {
    // The other half of the one above: proves it is the `saving` flag doing the refusing, not the
    // form submission failing to reach the handler at all.
    const onSave = jest.fn();
    render({ initialName: 'Immense Shop', onSave, saving: false });
    act(() => {
      container.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onSave).toHaveBeenCalledWith({ shop_name: 'Immense Shop' });
  });

  it('returns the save promise so the button stays held down for the whole request', async () => {
    // BusyForm keeps the button disabled for exactly as long as the handler's promise is pending,
    // so the handler has to hand that promise back. A handler that returns nothing is busy for a
    // single microtask, which is the same as not being busy at all.
    //
    // The microtask flush below is what makes this test able to fail. `useBusy.run` is async and
    // `await`s the action, so even a handler returning `undefined` leaves the button disabled for
    // the synchronous render — checking straight after the submit passes either way.
    let resolveSave;
    const onSave = jest.fn(() => new Promise((r) => { resolveSave = r; }));
    render({ initialName: 'Immense Shop', onSave });

    await act(async () => {
      container.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onSave).toHaveBeenCalled();
    // Still in flight, because the promise has not been resolved yet.
    expect(submit().disabled).toBe(true);

    await act(async () => {
      resolveSave();
    });
    expect(submit().disabled).toBe(false);
  });

  it('says it is saving on the button', () => {
    render({ saving: true });
    expect(submit().textContent).toBe('Saqlanmoqda…');
    render({ saving: false });
    expect(submit().textContent).toBe('Saqlash');
  });

  it('survives having no handler at all', () => {
    render({ initialName: 'x' });
    expect(() => act(() => submit().click())).not.toThrow();
  });
});

describe('what it tells the user', () => {
  it('shows an error when there is one', () => {
    render({ error: 'Saqlanmadi.' });
    expect(container.querySelector('.error-message').textContent).toBe('Saqlanmadi.');
  });

  it('shows a success note when there is one', () => {
    render({ success: 'Saqlandi.' });
    expect(container.querySelector('.success-message').textContent).toBe('Saqlandi.');
  });

  it('shows neither when there is nothing to say', () => {
    render({});
    expect(container.querySelector('.error-message')).toBeNull();
    expect(container.querySelector('.success-message')).toBeNull();
  });

  it('labels the field and explains where the name shows up', () => {
    render({});
    expect(container.querySelector('label[for="shop-name"]').textContent).toBe('Do‘kon nomi');
    expect(container.textContent).toContain('Chekda shu nom chiqadi.');
  });
});

