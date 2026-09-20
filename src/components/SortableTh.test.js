/**
 * A column header that sorts, and one that refuses to.
 *
 * Sorting here is client-side: it orders the rows the browser already holds. On a table that
 * loads progressively that is a trap, because sorting the fifty rows that have arrived produces
 * an answer that is confidently wrong — the cheapest delivery of fifty, presented as the cheapest
 * of three hundred — and a sorted table is persuasive enough that nobody thinks to check it.
 *
 * So a header can be disabled while rows are still coming in. What these pin is that disabling
 * actually refuses the click (not merely greys it), that it stays refused from the keyboard,
 * which is the usual way a "disabled" control turns out to still work, and that leaving the prop
 * off changes nothing for the seventeen pages that already use this component.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SortableTh from './SortableTh';

let container;
let root;

// Same as Modal.test.js: without it React warns on every act() in a concurrent root.
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

function render(props = {}) {
  act(() => {
    root.render(
      <table>
        <thead>
          <tr>
            <SortableTh columnId="cost" sortCol={null} sortDir="asc" onSort={() => {}} {...props}>
              Delivery cost
            </SortableTh>
          </tr>
        </thead>
      </table>,
    );
  });
  return container.querySelector('th');
}

const click = (el) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

const pressEnter = (el) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

describe('an ordinary sortable header', () => {
  test('clicking it sorts by that column', () => {
    const sorted = [];
    const th = render({ onSort: (col) => sorted.push(col) });

    click(th);

    expect(sorted).toEqual(['cost']);
  });

  test('Enter sorts it too', () => {
    const sorted = [];
    const th = render({ onSort: (col) => sorted.push(col) });

    pressEnter(th);

    expect(sorted).toEqual(['cost']);
  });

  test('it is reachable by keyboard', () => {
    expect(render().getAttribute('tabindex')).toBe('0');
  });

  test('nothing about it changed for callers that never pass the prop', () => {
    // The guard for the other sixteen pages using this component.
    const th = render();

    expect(th.className).toContain('data-table-sortable');
    expect(th.className).not.toContain('disabled');
    expect(th.getAttribute('aria-disabled')).toBeNull();
    expect(th.style.cursor).toBe('pointer');
  });
});

describe('a header disabled while the table is still loading', () => {
  test('clicking it does nothing', () => {
    const sorted = [];
    const th = render({ disabled: true, onSort: (col) => sorted.push(col) });

    click(th);

    expect(sorted).toEqual([]);
  });

  test('the keyboard cannot sort it either', () => {
    // The usual way a disabled control turns out not to be disabled.
    const sorted = [];
    const th = render({ disabled: true, onSort: (col) => sorted.push(col) });

    pressEnter(th);

    expect(sorted).toEqual([]);
  });

  test('it says it is disabled, and stops inviting the click', () => {
    const th = render({ disabled: true });

    expect(th.getAttribute('aria-disabled')).toBe('true');
    expect(th.className).toContain('data-table-sortable--disabled');
    expect(th.style.cursor).toBe('default');
    expect(th.getAttribute('tabindex')).toBe('-1');
  });

  test('a sort already applied still shows its arrow', () => {
    /*
      A filter change refetches and disables the headers again while a sort is still applied —
      and the rows on screen really are still in that order. Dropping the arrow would say the
      table is unsorted when it is not, which is a worse lie than the one disabling prevents.
    */
    const th = render({ disabled: true, sortCol: 'cost', sortDir: 'desc' });

    expect(th.getAttribute('aria-sort')).toBe('descending');
    expect(th.querySelector('.sort-indicator')).not.toBeNull();
  });
});
