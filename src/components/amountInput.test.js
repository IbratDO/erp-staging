/**
 * The money field that groups thousands while you type: 1200000 → 1 200 000.
 *
 * It had no test, and it is behind every amount box in the app — the order avans boxes, the sale
 * payment methods, the cargo and shortfall forms. Two properties are load-bearing enough that
 * breaking either is a money bug rather than a cosmetic one:
 *
 *   * **the caller receives raw digits, never the formatted text.** Every call site does
 *     `onChange={(e) => setState(e.target.value)}` and stores the result, and the request body is
 *     built from what was stored. If the grouped string escaped, `parseFloat('1 200 000')` is
 *     `1` — a seven-figure amount submitted as one;
 *   * **a comma is read by shape, not by rule.** It is a decimal point on a uz/ru keyboard ("1,5")
 *     and a thousands separator in anything pasted from Excel ("1,200,000"). Reading every comma
 *     as a decimal point turns a pasted 1,200,000 into 1.2 — a million-fold error.
 *
 * The separator is a thin space rather than a comma on purpose: a comma *is* the decimal point in
 * Uzbek and Russian, so "1,200" is genuinely ambiguous in this app's languages and a space is not.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AmountInput, { formatAmount, parseAmount } from './AmountInput';

const GROUP = ' '; // the thin space the component groups with

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
    root.render(<AmountInput {...props} />);
  });
  return container.querySelector('input');
};

// Through the native value setter: React tracks the last value it wrote and treats a direct
// assignment as no change, so onChange never fires. Same helper as `ClickChargeModal.test.js`.
const type = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  ).set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('grouping, which is the whole point', () => {
  it('splits a seven-figure amount into threes', () => {
    expect(formatAmount('1000000')).toBe(`1${GROUP}000${GROUP}000`);
  });

  it('groups from the right, so four digits get one separator', () => {
    expect(formatAmount('1000')).toBe(`1${GROUP}000`);
    expect(formatAmount('10000')).toBe(`10${GROUP}000`);
    expect(formatAmount('100000')).toBe(`100${GROUP}000`);
  });

  it('leaves anything under a thousand alone', () => {
    expect(formatAmount('999')).toBe('999');
  });

  it('separates with a space and never a comma', () => {
    // A comma is the decimal point in uz and ru, so grouping with one would be ambiguous in
    // exactly the two languages most of this shop reads in.
    const out = formatAmount('1200000');
    expect(out).not.toContain(',');
    expect(out).toContain(GROUP);
  });

  it('groups only the whole part and keeps the decimals', () => {
    expect(formatAmount('1200000.5')).toBe(`1${GROUP}200${GROUP}000.5`);
    expect(formatAmount('1234.56')).toBe(`1${GROUP}234.56`);
  });

  it('lets a half-typed decimal survive', () => {
    // Trimming the trailing dot would fight the person typing "12.5" at the moment they reach '.'.
    expect(formatAmount('12.')).toBe('12.');
  });

  it('keeps a negative sign outside the grouping', () => {
    expect(formatAmount('-1000000')).toBe(`-1${GROUP}000${GROUP}000`);
  });

  it('handles the empty and not-yet-typed states without throwing', () => {
    expect(formatAmount('')).toBe('');
    expect(formatAmount(null)).toBe('');
    expect(formatAmount(undefined)).toBe('');
  });
});

describe('what the call site is handed', () => {
  it('shows the grouped value but reports raw digits', () => {
    // The divide the whole component rests on: formatted on screen, unformatted to the caller.
    const onChange = jest.fn();
    const input = render({ value: '', onChange });

    type(input, '1200000');

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].target.value).toBe('1200000');
  });

  it('strips the separators back out of what it just displayed', () => {
    // The round trip that matters: the box shows "1 200 000", the person edits, and what comes
    // back must still be a number `parseFloat` can read.
    const onChange = jest.fn();
    const input = render({ value: '1200000', onChange });
    expect(input.value).toBe(`1${GROUP}200${GROUP}000`);

    type(input, `1${GROUP}200${GROUP}0007`);

    const reported = onChange.mock.calls[0][0].target.value;
    expect(reported).toBe('12000007');
    expect(Number.isNaN(parseFloat(reported))).toBe(false);
  });

  it('survives having no handler', () => {
    const input = render({ value: '5' });
    expect(() => type(input, '50')).not.toThrow();
  });
});

describe('a comma, read by shape', () => {
  it('treats a pasted grouped number as grouping', () => {
    // From Excel or a browser. Read as a decimal point this would become 1.2.
    expect(parseAmount('1,200,000')).toBe('1200000');
  });

  it('treats a comma before a decimal point as grouping', () => {
    expect(parseAmount('1,200.50')).toBe('1200.50');
  });

  it('treats a lone comma with three digits after it as grouping', () => {
    // Nobody writes one-and-a-half as "1,500".
    expect(parseAmount('1,500')).toBe('1500');
  });

  it('treats a lone comma with fewer digits as a decimal point', () => {
    // The uz/ru keyboard case: "1,5" is one and a half.
    expect(parseAmount('1,5')).toBe('1.5');
    expect(parseAmount('1,50')).toBe('1.50');
  });

  it('keeps a comma typed mid-number from vanishing', () => {
    expect(parseAmount('12,')).toBe('12.');
  });

  it('throws away letters and currency marks', () => {
    expect(parseAmount('$1 200 so‘m')).toBe('1200');
  });

  it('keeps only the first decimal point', () => {
    expect(parseAmount('1.2.3')).toBe('1.23');
  });
});

describe('the avans boxes in the order form', () => {
  // The pair this was widened for: a customer can hand over both currencies, so the cell holds
  // two of these side by side.
  it('shows a grouped so‘m advance in full', () => {
    const input = render({ value: '1000000', placeholder: "Avans so'm" });
    expect(input.value).toBe(`1${GROUP}000${GROUP}000`);
  });

  it('shows a USD advance with its decimals', () => {
    const input = render({ value: '1200.50', placeholder: 'Avans USD' });
    expect(input.value).toBe(`1${GROUP}200.50`);
  });

  it('carries the class the table cell sizes it with', () => {
    // `.batch-order-lines-advance-cell > .amount-input` is what splits the cell evenly between
    // the two boxes, so losing this class would collapse one of them.
    const input = render({ value: '', className: 'batch-sale-lines__control' });
    expect(input.className).toContain('amount-input');
    expect(input.className).toContain('batch-sale-lines__control');
  });
});
