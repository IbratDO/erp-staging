/**
 * The hover box on "Foydalanuvchi bo'yicha o'rtacha dona".
 *
 * A stacked chart draws one series per salesman across every weekday, so Recharts names all of
 * them on hover — including everyone who sold nothing that day. With a dozen staff that is eleven
 * lines of "0" around the one number the reader came for.
 *
 * Rows are dropped from the hover only. The series themselves stay, which is what keeps a person
 * on the same colour in every bar and keeps the legend complete — hiding a *series* would have
 * reshuffled the palette from one weekday to the next.
 *
 * Moved here with the chart cards themselves. They used to live inside `DashboardModern`, where
 * only the Founder and the Investor got the benefit of them; every other role's dashboard kept a
 * separate, older copy of the same chart. Sharing the components is what puts this hover in front
 * of the CEO and the sales managers too.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { nonZeroTooltip, seriesTooltip } from './dashboardCharts';

const STYLE = { background: '#fff' };

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

/** Renders whatever the tooltip returns and hands back its text, or null when it drew nothing. */
function show(props) {
  const node = nonZeroTooltip({ active: true, label: 'Dushanba', ...props }, STYLE);
  if (node === null) return null;
  act(() => root.render(node));
  return container.textContent;
}

const entry = (name, value) => ({ name, value, dataKey: name, color: '#123456' });

describe('who appears in the hover', () => {
  test('a salesman who sold nothing that day is left out', () => {
    const text = show({ payload: [entry('Ali', 3), entry('Vali', 0), entry('Hasan', 1.5)] });

    expect(text).toContain('Ali');
    expect(text).toContain('Hasan');
    expect(text).not.toContain('Vali');
  });

  test('the weekday itself is still named', () => {
    expect(show({ payload: [entry('Ali', 3)] })).toContain('Dushanba');
  });

  test('a fractional average is kept, not rounded away as a zero', () => {
    // These are averages, so a real figure can be well under one. Dropping anything "small"
    // rather than exactly zero would erase the quiet sellers this chart exists to show.
    const text = show({ payload: [entry('Ali', 0.25), entry('Vali', 0)] });

    expect(text).toContain('Ali');
    expect(text).toContain('0.25');
    expect(text).not.toContain('Vali');
  });

  test('a long average is trimmed to two decimals', () => {
    expect(show({ payload: [entry('Ali', 1.6666666)] })).toContain('1.67');
  });
});

describe('when there is nothing to show', () => {
  test('a weekday where nobody sold draws no box at all', () => {
    // An empty bordered box hanging off the cursor reads as a glitch.
    expect(show({ payload: [entry('Ali', 0), entry('Vali', 0)] })).toBeNull();
  });

  test('and neither does a hover that is not active', () => {
    expect(nonZeroTooltip({ active: false, payload: [entry('Ali', 3)] }, STYLE)).toBeNull();
  });

  test('nor one with no series behind it', () => {
    expect(nonZeroTooltip({ active: true, payload: [] }, STYLE)).toBeNull();
  });
});

/**
 * The order rows are listed in, for "Yangi va mavjud mijozlar".
 *
 * The series are sorted alphabetically before they are drawn, so the stack is built New below
 * Old — and Recharts names series in declaration order, meaning the hover led with "New
 * customers" while the band on top of the chart was the old ones. Reversed, the box reads
 * top-down in the order the bands are actually drawn.
 *
 * Opt-in per chart rather than changed for everybody: this tooltip serves five charts on the
 * modern dashboard, and what reads correctly for one stack is not automatically right elsewhere.
 */
function showRows(props, options) {
  const node = seriesTooltip({ active: true, label: 'Sen', ...props }, STYLE, options);
  if (node === null) return null;
  act(() => root.render(node));
  return container.textContent;
}

/** The order the entries are declared in, which is the order Recharts hands them over. */
const CUSTOMERS = [entry('New customers', 12), entry('Old customers', 30)];

describe('reversing the hover order', () => {
  test('the old customers are listed above the new ones', () => {
    const text = showRows({ payload: CUSTOMERS }, { reverse: true });

    expect(text.indexOf('Old customers')).toBeLessThan(text.indexOf('New customers'));
  });

  test('left alone, the original order is kept', () => {
    // The guard for the other four charts drawn by this component.
    const text = showRows({ payload: CUSTOMERS });

    expect(text.indexOf('New customers')).toBeLessThan(text.indexOf('Old customers'));
  });

  test('every row survives the reversal, with its figure', () => {
    const text = showRows({ payload: CUSTOMERS }, { reverse: true });

    expect(text).toContain('30');
    expect(text).toContain('12');
  });

  test("the caller's own array is not reordered", () => {
    /*
      Recharts owns the payload array it passes in, and `reverse()` works in place. Reordering it
      during a render would reach back into the chart's own book-keeping — the kind of fault that
      shows up somewhere else entirely, long after the hover has gone.
    */
    const payload = [...CUSTOMERS];

    showRows({ payload }, { reverse: true });

    expect(payload.map((e) => e.name)).toEqual(['New customers', 'Old customers']);
  });

  test('a zero row is still dropped when both options are asked for', () => {
    // Nothing on this chart needs both today, but the two must compose rather than one
    // silently winning — that is exactly the sort of thing found much later, by accident.
    const text = showRows(
      { payload: [entry('New customers', 0), entry('Old customers', 4)] },
      { hideZero: true, reverse: true },
    );

    expect(text).toContain('Old customers');
    expect(text).not.toContain('New customers');
  });
});
