/**
 * The credentials card, and the one rule that can take a till offline.
 *
 * The server ignores a blank secret on Save, and this form must not send one either — belt and
 * braces, because the failure is silent and expensive: an owner opens the page to change the cashbox
 * code, presses Save, and Click stops working at the counter.
 *
 * The other thing worth pinning is the placeholder. The secret is never sent back, so an empty box
 * means two different things — "nothing stored" and "something stored, leave it alone" — and the
 * placeholder is the only thing distinguishing them.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import PaymentProviderForm from './PaymentProviderForm';

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = false; });

const LABELS = {
  loading: 'loading',
  title: 'Click Pass',
  intro: 'intro',
  serviceId: 'Service ID',
  merchantUserId: 'Merchant User ID',
  secretKey: 'Secret key',
  secretStored: 'Stored - leave empty to keep it',
  secretMissing: 'Not set',
  secretKeepHint: 'A key is stored.',
  secretNewHint: 'Paste the secret key.',
  clearSecret: 'Delete the key',
  clearing: 'Deleting',
  cashboxCode: 'Cashbox code',
  cashboxHint: 'which till',
  enabledLabel: 'Click Pass is on',
  enabledHint: 'off means no button',
  check: 'Check',
  checking: 'Checking',
  checkOk: 'The details look complete.',
  checkNotReady: 'Not ready yet.',
  checkNoCharge: 'This check creates no payment.',
  checkChecksSaved: 'The check looks at what is saved.',
  checkNeedsSave: 'There are unsaved changes - save first, then check.',
  save: 'Save',
  saving: 'Saving',
};

const CONFIGURED = {
  provider: 'click',
  enabled: true,
  service_id: '12345',
  merchant_user_id: 'shop_a_user',
  cashbox_code: 'POS-01',
  secret_set: true,
  version: 3,
};

const BLANK = {
  provider: 'click',
  enabled: false,
  service_id: '',
  merchant_user_id: '',
  cashbox_code: '',
  secret_set: false,
  version: 1,
};

const mounted = [];
afterEach(() => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    act(() => root.unmount());
    container.remove();
  }
  jest.clearAllMocks();
});

function mount(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(<PaymentProviderForm labels={LABELS} initial={CONFIGURED} {...props} />);
  });
  return container;
}

const field = (id) => document.getElementById(`click-${id}`);
const buttons = () => Array.from(document.querySelectorAll('button'));
const byText = (text) => buttons().find((b) => b.textContent.includes(text));
const text = () => document.body.textContent;

// Through the native value setter, not `el.value = x`: React tracks the last value it wrote and
// treats a direct assignment as no change, so onChange never fires. Same helper as
// `pages/shopSettingsForm.test.js` and `components/customerQuickAdd.test.js`.
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  ).set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const submit = async () => {
  await act(async () => {
    document.querySelector('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
};

describe('what the secret field says about itself', () => {
  it('says a key is stored when one is', () => {
    mount({ initial: CONFIGURED });
    expect(field('secret').placeholder).toBe(LABELS.secretStored);
    expect(text()).toContain(LABELS.secretKeepHint);
  });

  it('says nothing is set when nothing is', () => {
    mount({ initial: BLANK });
    expect(field('secret').placeholder).toBe(LABELS.secretMissing);
    expect(text()).toContain(LABELS.secretNewHint);
  });

  it('never renders the secret itself', () => {
    // The server does not send it, so there is nothing to render - this pins that the form does not
    // invent a placeholder value that looks like one.
    mount({ initial: CONFIGURED });
    expect(field('secret').value).toBe('');
  });

  it('offers to delete the key only when there is one', () => {
    mount({ initial: CONFIGURED });
    expect(byText(LABELS.clearSecret)).toBeTruthy();
    act(() => { mounted[mounted.length - 1].root.unmount(); });
    mounted.pop().container.remove();
    mount({ initial: BLANK });
    expect(byText(LABELS.clearSecret)).toBeFalsy();
  });
});

describe('saving', () => {
  it('does not send the secret when the box was left alone', async () => {
    // The rule. Sending an empty string here would ask the server to change the secret to nothing.
    const onSave = jest.fn();
    mount({ initial: CONFIGURED, onSave });
    await type(field('cashbox'), 'POS-02');
    await submit();

    expect(onSave).toHaveBeenCalledTimes(1);
    const body = onSave.mock.calls[0][0];
    expect(body).not.toHaveProperty('secret_key');
    expect(body.cashbox_code).toBe('POS-02');
  });

  it('does not send a secret of only spaces', async () => {
    const onSave = jest.fn();
    mount({ initial: CONFIGURED, onSave });
    await type(field('secret'), '   ');
    await submit();
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('secret_key');
  });

  it('sends the secret when one was typed', async () => {
    const onSave = jest.fn();
    mount({ initial: CONFIGURED, onSave });
    await type(field('secret'), 'a-new-secret');
    await submit();
    expect(onSave.mock.calls[0][0].secret_key).toBe('a-new-secret');
  });

  it('trims what it sends', async () => {
    const onSave = jest.fn();
    mount({ initial: BLANK, onSave });
    await type(field('service-id'), '  12345  ');
    await type(field('secret'), '  spaced  ');
    await submit();
    const body = onSave.mock.calls[0][0];
    expect(body.service_id).toBe('12345');
    expect(body.secret_key).toBe('spaced');
  });

  it('sends the switch as a boolean', async () => {
    const onSave = jest.fn();
    mount({ initial: BLANK, onSave });
    await act(async () => {
      field('enabled').click();
    });
    await submit();
    expect(onSave.mock.calls[0][0].enabled).toBe(true);
  });

  it('does not submit twice while a save is in flight', async () => {
    const onSave = jest.fn();
    mount({ initial: CONFIGURED, onSave, saving: true });
    await submit();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('checking the configuration', () => {
  it('asks the page to check, rather than saving', async () => {
    const onCheck = jest.fn();
    const onSave = jest.fn();
    mount({ initial: CONFIGURED, onCheck, onSave });
    await act(async () => {
      byText(LABELS.check).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the problems it was given', () => {
    mount({
      initial: BLANK,
      checkResult: { ok: false, problems: ['Service ID is empty.'], charged_anything: false },
    });
    expect(text()).toContain(LABELS.checkNotReady);
    expect(text()).toContain('Service ID is empty.');
  });

  it('says plainly that nothing was charged', () => {
    // "Test the connection" normally implies something was sent, so the panel has to say otherwise.
    mount({ initial: CONFIGURED, checkResult: { ok: true, problems: [], charged_anything: false } });
    expect(text()).toContain(LABELS.checkOk);
    expect(text()).toContain(LABELS.checkNoCharge);
  });

  it('shows no panel before a check has been run', () => {
    mount({ initial: CONFIGURED });
    expect(text()).not.toContain(LABELS.checkNoCharge);
  });
});

describe('catching up with the server', () => {
  it('fills the fields once the row arrives', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => {
      root.render(<PaymentProviderForm labels={LABELS} initial={null} />);
    });
    expect(field('service-id').value).toBe('');
    act(() => {
      root.render(<PaymentProviderForm labels={LABELS} initial={CONFIGURED} />);
    });
    expect(field('service-id').value).toBe('12345');
  });

  it('does not throw away a typed secret when the row is refreshed to the same values', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => {
      root.render(<PaymentProviderForm labels={LABELS} initial={CONFIGURED} />);
    });
    await type(field('secret'), 'half-typed');
    act(() => {
      root.render(<PaymentProviderForm labels={LABELS} initial={CONFIGURED} />);
    });
    expect(field('secret').value).toBe('half-typed');
  });
});

describe('the check describes what is saved, not what is typed', () => {
  // Found in the wild: the fields were filled, Tekshirish was pressed before Save, and it reported
  // "Service ID is empty" - truthfully about the stored row, and uselessly about the screen.
  it('refuses to run while there are unsaved edits', async () => {
    const onCheck = jest.fn();
    mount({ initial: CONFIGURED, onCheck });
    await type(field('service-id'), '999');
    expect(byText(LABELS.check).disabled).toBe(true);
    await act(async () => {
      byText(LABELS.check).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('says why it is unavailable', async () => {
    mount({ initial: CONFIGURED });
    await type(field('cashbox'), 'POS-99');
    expect(text()).toContain(LABELS.checkNeedsSave);
  });

  it('a typed secret alone counts as unsaved', async () => {
    mount({ initial: CONFIGURED });
    await type(field('secret'), 'new-one');
    expect(byText(LABELS.check).disabled).toBe(true);
  });

  it('toggling the switch counts as unsaved', async () => {
    mount({ initial: CONFIGURED });
    await act(async () => { field('enabled').click(); });
    expect(byText(LABELS.check).disabled).toBe(true);
  });

  it('runs when the form matches what was saved', () => {
    const onCheck = jest.fn();
    mount({ initial: CONFIGURED, onCheck });
    expect(byText(LABELS.check).disabled).toBe(false);
    expect(text()).toContain(LABELS.checkChecksSaved);
  });

  it('hides a result that no longer describes the form', async () => {
    // A green "complete" sitting under edited fields would be a lie by omission.
    mount({
      initial: CONFIGURED,
      checkResult: { ok: true, problems: [], charged_anything: false },
    });
    expect(text()).toContain(LABELS.checkOk);
    await type(field('service-id'), '777');
    expect(text()).not.toContain(LABELS.checkOk);
  });
});
