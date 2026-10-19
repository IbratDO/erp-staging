/**
 * The charge dialog at the counter.
 *
 * Two assertions here are worth more than the rest, and both are about not taking money twice:
 *
 * 1. **A lower-case QR payload survives verbatim.** This is why the scan field is a plain input and
 *    not `useBarcodeScanner`, whose `event.code` handling turns `KeyL` into `"L"`.
 * 2. **An unresolved charge offers a check, never a retry.** The provider may already have taken the
 *    customer's money.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ClickChargeModal from './ClickChargeModal';

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = false; });

const LABELS = {
  title: 'Click Pass',
  intro: 'Scan the QR',
  close: 'Close',
  amount: 'Amount',
  amountHint: 'editable',
  scan: 'Scan',
  scanHint: 'point the scanner',
  chargeButton: 'Charge',
  charging: 'Charging',
  check: 'Ask Click',
  checking: 'Asking',
  tryAgain: 'Try again',
  alreadyTaken: 'Already taken',
  soum: 'soum',
  unresolvedTitle: 'Outcome unclear',
  unresolvedBody: 'Click has not said yet.',
  waitingForScan: 'Scan the QR code',
  typeByHand: 'Type the code by hand',
  declinedTitle: 'Declined',
  declinedBody: 'No money was taken.',
  // Resolved by the parent, not read off the payment here: Click answers in Russian and the till
  // is in Uzbek, so choosing between our wording and the provider's is one decision made once in
  // `failureText` rather than re-made in every component that shows a failure.
  failureText: 'The card has no money.',
  failureNote: 'Недостаточно средств на счете',
  statePaid: 'paid',
  stateFailed: 'declined',
  statePending: 'waiting',
  stateOwed: 'owed back',
  stateReversed: 'reversed',
  stateUnknown: 'unknown',
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
    root.render(
      <ClickChargeModal open dueUzs={1234567} labels={LABELS} onClose={() => {}} {...props} />,
    );
  });
  return container;
}

/**
 * A complete scan: the payload, then the Enter a keyboard-wedge scanner sends to end it.
 *
 * This is the whole charge gesture now. The scan field is off-screen rather than absent -- letting
 * the browser receive the keystrokes in a real focused input is what guarantees the payload arrives
 * byte for byte -- so these tests reach it exactly as the scanner does.
 */
const scan = async (code) => {
  await type(field('click-scan'), code);
  await act(async () => {
    field('click-scan').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
  });
};

// Through the native value setter: React tracks the last value it wrote and treats a direct
// assignment as no change, so onChange never fires. Same helper as `shopSettingsForm.test.js`.
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  ).set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const field = (id) => document.getElementById(id);
const buttons = () => Array.from(document.querySelectorAll('button'));
const byText = (text) => buttons().find((b) => b.textContent.includes(text));
const text = () => document.body.textContent;

const paid = (over = {}) => ({
  merchant_trans_id: 'GP-A', status: 'paid', unapplied_uzs: '500000',
  consumable: true, retryable: false, ...over,
});
const declined = (over = {}) => ({
  merchant_trans_id: 'GP-B', status: 'failed', unapplied_uzs: '0',
  consumable: false, retryable: true, failure_message: 'Not enough balance.', ...over,
});
const lost = (over = {}) => ({
  merchant_trans_id: 'GP-C', status: 'unknown', unapplied_uzs: '500000',
  consumable: false, retryable: false, ...over,
});

describe('the scanned code', () => {
  it('survives a lower-case payload verbatim', async () => {
    // The reason this field is a plain input. `useBarcodeScanner` rebuilds keystrokes from
    // `event.code`, so `KeyL` becomes `"L"` and a mixed-case QR is destroyed.
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-scan'), 'aB3-xY_z9');
    await act(async () => {
      document.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge.mock.calls[0][0].otpData).toBe('aB3-xY_z9');
  });

  it('is trimmed but not otherwise altered', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-scan'), '  aB3-xY_z9  ');
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge.mock.calls[0][0].otpData).toBe('aB3-xY_z9');
  });

  it('submits on the scanner s Enter', async () => {
    // A keyboard-wedge scanner ends its payload with Enter.
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-scan'), 'TEST-PAID-1');
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge).toHaveBeenCalledTimes(1);
  });
});

describe('what it will not send', () => {
  it('withholds the charge until something has been scanned', async () => {
    // An Enter with nothing scanned is a stray keypress, not a payment.
    const onCharge = jest.fn();
    mount({ onCharge });
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('withholds the charge when the amount is cleared', async () => {
    // Scanning is the trigger now, so the amount guard has to hold there. A charge for an empty
    // amount would be a request Click rejects, in front of a customer, for no reason.
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-amount'), '');
    await scan('TEST-PAID-1');
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('withholds the charge for a zero amount', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-amount'), '0');
    await scan('TEST-PAID-1');
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('does not send twice while a charge is in flight', async () => {
    const onCharge = jest.fn();
    mount({ onCharge, busy: true });
    await type(field('click-scan'), 'TEST-PAID-1');
    await act(async () => {
      document.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge).not.toHaveBeenCalled();
  });
});

describe('the idempotency key', () => {
  it('is sent with the charge', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-scan'), 'TEST-PAID-1');
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge.mock.calls[0][0].idempotencyKey).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('is the same key if the button is pressed twice', async () => {
    // The point of it. Two presses of one intention must converge on one charge.
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-scan'), 'TEST-PAID-1');
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        field('click-scan').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
      });
    }
    expect(onCharge).toHaveBeenCalledTimes(2);
    expect(onCharge.mock.calls[0][0].idempotencyKey)
      .toBe(onCharge.mock.calls[1][0].idempotencyKey);
  });

  it('is a fresh key after a decline, because that is a new charge', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-scan'), 'TEST-FAIL-1');
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    const firstKey = onCharge.mock.calls[0][0].idempotencyKey;

    // The parent re-renders with the declined result, and the cashier presses Try again.
    act(() => {
      mounted[mounted.length - 1].root.render(
        <ClickChargeModal
          open dueUzs={1234567} labels={LABELS} onClose={() => {}}
          onCharge={onCharge} lastPayment={declined()}
        />,
      );
    });
    await act(async () => {
      byText(LABELS.tryAgain).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await type(field('click-scan'), 'TEST-PAID-2');
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    const secondKey = onCharge.mock.calls[1][0].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});

describe('after a charge that did not plainly succeed', () => {
  it('offers a check and no retry when the outcome is unresolved', () => {
    // The expensive distinction. Click may already have taken the money.
    mount({ lastPayment: lost() });
    expect(text()).toContain(LABELS.unresolvedTitle);
    expect(byText(LABELS.check)).toBeTruthy();
    expect(byText(LABELS.tryAgain)).toBeFalsy();
  });

  it('asks the server about the charge by its reference', async () => {
    const onCheck = jest.fn();
    mount({ lastPayment: lost(), onCheck });
    await act(async () => {
      byText(LABELS.check).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCheck).toHaveBeenCalledWith('GP-C');
  });

  it('offers a retry after an explicit decline', () => {
    mount({ lastPayment: declined() });
    expect(byText(LABELS.tryAgain)).toBeTruthy();
    expect(byText(LABELS.check)).toBeFalsy();
  });

  it('shows a reason a cashier can read, and the provider s own words under it', () => {
    // The failure that prompted this: the card-has-no-money decline was displayed only in Click's
    // Russian, so the line telling the cashier what to do next was the line they could not read.
    mount({ lastPayment: declined() });
    expect(text()).toContain('The card has no money.');
    expect(text()).toContain('Недостаточно средств на счете');
  });

  it('shows no provider note when there is nothing extra to say', () => {
    mount({ lastPayment: declined(), labels: { ...LABELS, failureNote: '' } });
    expect(text()).toContain('The card has no money.');
  });

  it('offers neither once the charge has succeeded', () => {
    mount({ lastPayment: paid() });
    expect(byText(LABELS.tryAgain)).toBeFalsy();
    expect(byText(LABELS.check)).toBeFalsy();
  });
});

describe('what it suggests charging', () => {
  it('suggests the whole amount due', () => {
    mount({ dueUzs: 1234567 });
    expect(field('click-amount').value).toBe('1234567');
  });

  it('subtracts money already taken', () => {
    mount({ dueUzs: 1234567, payments: [paid({ unapplied_uzs: '234567' })] });
    expect(field('click-amount').value).toBe('1000000');
  });

  it('suggests nothing once the sale is covered', () => {
    mount({ dueUzs: 500000, payments: [paid({ unapplied_uzs: '500000' })] });
    expect(field('click-amount').value).toBe('');
  });

  it('stays editable so part can go on Click and the rest in cash', async () => {
    const onCharge = jest.fn();
    mount({ dueUzs: 1234567, onCharge });
    await type(field('click-amount'), '400000');
    await type(field('click-scan'), 'TEST-PAID-1');
    await act(async () => {
      field('click-scan').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(onCharge.mock.calls[0][0].amountUzs).toBe(400000);
  });
});

describe('money already taken for this sale', () => {
  it('is listed, so a cashier cannot charge for it twice', () => {
    // The resume case: the browser died, the sale was reopened, and this money is already paid.
    mount({ payments: [paid({ unapplied_uzs: '500000' })] });
    expect(text()).toContain(LABELS.alreadyTaken);
    expect(text()).toContain('500 000');
    expect(text()).toContain(LABELS.statePaid);
  });

  it('shows an unresolved charge as waiting rather than paid', () => {
    mount({ payments: [lost()] });
    expect(text()).toContain(LABELS.statePending);
  });

  it('shows nothing when there is nothing taken', () => {
    mount({ payments: [] });
    expect(text()).not.toContain(LABELS.alreadyTaken);
  });
});

describe('the scanner is armed as soon as the window opens', () => {
  // The owner's request: pressing Click Pass should let you scan straight away, with no field to
  // click into first. What makes that work is that the field still exists and holds focus -- a
  // keyboard-wedge scanner types into whatever has focus, and a real input is what guarantees the
  // payload arrives byte for byte instead of being reconstructed from keystroke timing.
  it('puts focus in the scan field without anyone clicking', async () => {
    // `Modal` focuses the first field in the dialog, which is the amount. This component then
    // claims focus on a zero-delay timer, so the scanner wins whatever the modal does -- the test
    // has to let that timer run, exactly as a browser would.
    mount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(field('click-scan'));
  });

  it('is a narrow dialog that places itself', () => {
    // Two things the owner had to report twice. The width comes from `Modal`'s prop because that
    // is applied inline and no class can override it; the centring comes from `gw-dialog`, which
    // positions the dialog by its own geometry rather than relying on the shared overlay's flex
    // layout -- that layout centred every other dialog in the app but left this one against the
    // left edge.
    mount();
    const dialog = document.querySelector('.modal__dialog');
    expect(dialog.className).toContain('gw-dialog');
    expect(dialog.style.maxWidth).toBe('460px');
  });

  it('keeps the field out of sight while it does so', () => {
    // Off-screen, not removed: `display:none` would take it out of the focus order and the
    // scanner would have nowhere to type.
    mount();
    expect(field('click-scan').className).toContain('gw-scan-hidden');
  });

  it('shows what it is waiting for instead of an empty box', () => {
    mount();
    expect(text()).toContain(LABELS.waitingForScan);
  });

  it('offers no charge button, because the scan is the button', () => {
    mount();
    expect(byText(LABELS.chargeButton)).toBeFalsy();
  });

  it('charges the moment a scan completes', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    await scan('aB3-xY_z9');
    expect(onCharge).toHaveBeenCalledTimes(1);
    expect(onCharge.mock.calls[0][0].otpData).toBe('aB3-xY_z9');
  });

  it('charges on the value the scan carried, not on a stale render', async () => {
    // The Enter that ends a payload can arrive in the same tick as its last character, so reading
    // `scanned` from state could charge on a value one keystroke short -- a failed payment with a
    // customer standing there. The handler takes the value off the event instead.
    const onCharge = jest.fn();
    mount({ onCharge });
    const el = field('click-scan');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    await act(async () => {
      setter.call(el, 'LATE-ARRIVING-CODE');
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    });
    expect(onCharge.mock.calls[0][0].otpData).toBe('LATE-ARRIVING-CODE');
  });
});

describe('typing the code when the scanner will not do', () => {
  const openManual = async () => {
    await act(async () => {
      byText(LABELS.typeByHand).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('is offered quietly, not as a step', () => {
    mount();
    expect(byText(LABELS.typeByHand)).toBeTruthy();
  });

  it('reveals the same field rather than a second one', async () => {
    // Two inputs would mean two values, and the one that charged the customer would be whichever
    // was wired up last.
    mount();
    await openManual();
    expect(document.querySelectorAll('#click-scan').length).toBe(1);
    expect(field('click-scan').className || '').not.toContain('gw-scan-hidden');
  });

  it('brings back the charge button, since there is no scan to press', async () => {
    mount();
    await openManual();
    expect(byText(LABELS.chargeButton)).toBeTruthy();
  });

  it('still charges what was typed', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    await openManual();
    await type(field('click-scan'), 'TEST-PAID-1');
    await act(async () => {
      byText(LABELS.chargeButton).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCharge.mock.calls[0][0].otpData).toBe('TEST-PAID-1');
  });
});

describe('scanning when focus is somewhere else', () => {
  /**
   * The failure the owner hit: he scanned several times and nothing happened at all.
   *
   * The scan field is off-screen but real, and the first design rested on it keeping focus. One
   * click on the dialog background sends focus to the body, and from then on the scanner types
   * into nothing -- no error, no sign, a dead window. So the charge no longer depends on where
   * focus is.
   */
  const scanAtDocument = async (code) => {
    await act(async () => {
      for (const ch of code) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: ch, bubbles: true, cancelable: true,
        }));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    });
  };

  it('charges even when nothing is focused', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    document.activeElement?.blur();
    await scanAtDocument('aB3-xY_z9');
    expect(onCharge).toHaveBeenCalledTimes(1);
    expect(onCharge.mock.calls[0][0].otpData).toBe('aB3-xY_z9');
  });

  it('keeps lower-case letters exactly as scanned', async () => {
    // The `useBarcodeScanner` trap, which this must not repeat: that hook rebuilds its buffer from
    // `event.code`, where the L key reports `KeyL` and comes back as a capital `L`. Harmless for
    // numeric barcodes, fatal for a QR payload -- it would charge against a code Click never
    // issued.
    const onCharge = jest.fn();
    mount({ onCharge });
    document.activeElement?.blur();
    await scanAtDocument('abcXYZ123');
    expect(onCharge.mock.calls[0][0].otpData).toBe('abcXYZ123');
  });

  it('does not charge twice when the field did have focus', async () => {
    // Both paths lead to the same charge, so the document listener has to stand aside for events
    // a field is already handling. Otherwise every ordinary scan would fire two charges.
    const onCharge = jest.fn();
    mount({ onCharge });
    await scan('TEST-PAID-1');
    expect(onCharge).toHaveBeenCalledTimes(1);
  });

  it('leaves the amount field alone while it is being edited', async () => {
    // Typing 5000 into the amount must change the amount, not accumulate into a scan.
    const onCharge = jest.fn();
    mount({ onCharge });
    await type(field('click-amount'), '5000');
    await act(async () => {
      field('click-amount').dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    });
    expect(onCharge).not.toHaveBeenCalled();
    expect(field('click-amount').value).toBe('5000');
  });

  it('charges the amount as it stands now, not as it was when the window opened', async () => {
    // The listener is installed once. Reading the amount from a value captured at that moment
    // would charge the original suggestion however the cashier edited it -- the wrong amount,
    // silently, on every split payment.
    const onCharge = jest.fn();
    mount({ onCharge, dueUzs: 1000 });
    await type(field('click-amount'), '600');
    document.activeElement?.blur();
    await scanAtDocument('TEST-PAID-1');
    expect(onCharge.mock.calls[0][0].amountUzs).toBe(600);
  });

  it('does not charge on a bare Enter', async () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    document.activeElement?.blur();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    });
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('ignores stray keys pressed long before the scan', async () => {
    // A buffer that never forgets would put whatever was pressed earlier on the front of the next
    // scan, and charge against a code Click never issued.
    const onCharge = jest.fn();
    mount({ onCharge });
    document.activeElement?.blur();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    });
    const realNow = Date.now;
    Date.now = () => realNow() + 5000;
    try {
      await scanAtDocument('CLEAN-CODE');
    } finally {
      Date.now = realNow;
    }
    expect(onCharge.mock.calls[0][0].otpData).toBe('CLEAN-CODE');
  });

  it('stops listening once the window is closed', async () => {
    // A listener left on the document would charge against a stray barcode scanned at the till
    // minutes later, for a sale nobody was paying.
    const onCharge = jest.fn();
    mount({ onCharge });
    const entry = mounted.pop();
    await act(async () => entry.root.unmount());
    entry.container.remove();

    await scanAtDocument('TEST-PAID-1');
    expect(onCharge).not.toHaveBeenCalled();
  });
});

describe('a scanner that sends no Enter', () => {
  /**
   * The failure the owner found, and the reason it hid for so long.
   *
   * He scanned, nothing charged, then opened the manual box and the code was sitting there
   * correctly. So the payload reached the field exactly as intended -- what never arrived was the
   * **Enter**, which was the only thing wired to fire the charge. The old design had a charge
   * button, so the first live payment went through by pressing it, and nothing ever proved the
   * scanner sends a terminating Enter. It does not.
   *
   * The end of a scan is now detected the way it is actually observable: the characters stop.
   */
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const typeNoEnter = (code) => {
    const el = field('click-scan');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    act(() => {
      setter.call(el, code);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('charges once the characters stop, with no Enter at all', () => {
    const onCharge = jest.fn();
    mount({ onCharge });
    typeNoEnter('aB3-xY_z9');
    expect(onCharge).not.toHaveBeenCalled();   // still mid-burst
    act(() => { jest.advanceTimersByTime(300); });
    expect(onCharge).toHaveBeenCalledTimes(1);
    expect(onCharge.mock.calls[0][0].otpData).toBe('aB3-xY_z9');
  });

  it('waits for the whole payload rather than charging on a prefix', () => {
    // Every new character pushes the moment back. Charging on a prefix would send Click a code it
    // never issued, in front of a customer.
    const onCharge = jest.fn();
    mount({ onCharge });
    typeNoEnter('aB3-xY');
    act(() => { jest.advanceTimersByTime(150); });
    typeNoEnter('aB3-xY_z9');
    act(() => { jest.advanceTimersByTime(150); });
    expect(onCharge).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(150); });
    expect(onCharge).toHaveBeenCalledTimes(1);
    expect(onCharge.mock.calls[0][0].otpData).toBe('aB3-xY_z9');
  });

  it('still charges immediately when an Enter does arrive', () => {
    // Scanners that do send a suffix must not wait a quarter second for nothing.
    const onCharge = jest.fn();
    mount({ onCharge });
    typeNoEnter('aB3-xY_z9');
    act(() => {
      field('click-scan').dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    });
    expect(onCharge).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(300); });
    expect(onCharge).toHaveBeenCalledTimes(1);   // the timer must not fire a second charge
  });

  it('ignores a few stray keys', () => {
    // The only guard left against an accidental payment, now that nothing has to be pressed.
    const onCharge = jest.fn();
    mount({ onCharge });
    typeNoEnter('ab');
    act(() => { jest.advanceTimersByTime(300); });
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('never charges by itself while somebody types by hand', () => {
    // Pausing to think mid-code is not a signal to charge. There the button decides.
    const onCharge = jest.fn();
    mount({ onCharge });
    act(() => {
      byText(LABELS.typeByHand).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    typeNoEnter('TEST-PAID-1');
    act(() => { jest.advanceTimersByTime(2000); });
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('does not charge after the window is closed', () => {
    // A timer left pending would charge for a sale nobody is paying.
    const onCharge = jest.fn();
    mount({ onCharge });
    typeNoEnter('aB3-xY_z9');
    const entry = mounted.pop();
    act(() => entry.root.unmount());
    entry.container.remove();
    act(() => { jest.advanceTimersByTime(600); });
    expect(onCharge).not.toHaveBeenCalled();
  });
});
