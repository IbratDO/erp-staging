/**
 * What you have chosen is at the top of the dropdown.
 *
 * With a few hundred products, or every size a shop stocks, the rows you ticked scroll out of sight
 * and the only way to see your own selection is to hunt for it. So the chosen rows are floated to
 * the top of the panel.
 *
 * The timing is the part worth pinning. A multi-select stays open while you tick several boxes, and
 * reordering on each tick would slide the next row up into the place the cursor was already
 * travelling to — so the second tick lands on the wrong size, which is worse than the problem being
 * fixed. The order is therefore taken when the panel opens and held until it is opened again.
 *
 * These are the first tests for this family of pickers, so they also cover the plumbing the
 * reordering sits on: the search box still narrows, and the panel still opens by keyboard.
 */
// `act` comes from react, not react-dom/test-utils: the older tests in this folder use the
// test-utils import, which this React version warns about on every render.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import FilterMultiSelect from './FilterMultiSelect';
import FilterSearchableSelect from './FilterSearchableSelect';
import FormMultiSelect from './FormMultiSelect';
import FormSearchableSelect from './FormSearchableSelect';
import ProductSearchableSelect from './ProductSearchableSelect';
import CustomerSearchableSelect from './CustomerSearchableSelect';

// The product and customer pickers translate their own labels. `t` is built once in the factory and
// not per render: a fresh `t` each time changes the identity of everything derived from it, and the
// effects that depend on it then re-run forever.
jest.mock('react-i18next', () => {
  const t = (key) => key;
  return {
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({ t, i18n: { language: 'uz' } }),
  };
});

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

const SIZES = ['38', '39', '40', '41', '42'];
const LABEL = 'Size';

const mounted = [];
afterEach(() => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    act(() => root.unmount());
    container.remove();
  }
});

/** The real pages own the selection and hand it back down, so the harness does too. */
function mount(Component, { values = [], value = '', options = SIZES, multi = true } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  const state = { values, value };
  const render = () => {
    act(() => {
      root.render(
        multi ? (
          <Component
            values={state.values}
            onChange={(next) => {
              state.values = next;
              render();
            }}
            options={options}
            aria-label={LABEL}
          />
        ) : (
          <Component
            value={state.value}
            onChange={(next) => {
              state.value = next;
              render();
            }}
            options={options}
            aria-label={LABEL}
          />
        ),
      );
    });
  };
  render();
  return { container, state };
}

const panel = () => document.querySelector(`[role="listbox"][aria-label="${LABEL}"]`);

/** The labels in the panel, top to bottom — which is the whole subject of this file. */
const rows = () =>
  Array.from(panel().querySelectorAll('li')).map((li) => li.textContent.trim());

const trigger = (container) => container.querySelector('[aria-haspopup="listbox"]');
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const tick = (label) => {
  const li = Array.from(panel().querySelectorAll('li'))
    .find((n) => n.textContent.trim() === label);
  act(() => { li.querySelector('input').click(); });
};

describe('a checkbox filter, opened with something already chosen', () => {
  it('shows the chosen size first', () => {
    const { container } = mount(FilterMultiSelect, { values: ['41'] });
    click(trigger(container));
    expect(rows()).toEqual(['41', '38', '39', '40', '42']);
  });

  it('shows several chosen sizes first, in the list order', () => {
    const { container } = mount(FilterMultiSelect, { values: ['42', '39'] });
    click(trigger(container));
    expect(rows()).toEqual(['39', '42', '38', '40', '41']);
  });

  it('leaves the list alone when nothing is chosen', () => {
    const { container } = mount(FilterMultiSelect, { values: [] });
    click(trigger(container));
    expect(rows()).toEqual(SIZES);
  });
});

describe('the "all sizes" row', () => {
  it('stays above the chosen rows', () => {
    // It is not an option, it is the way to clear the filter, so it keeps the top of the panel. The
    // pages pass it in, so it is rendered outside the list that gets reordered.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => {
      root.render(
        <FilterMultiSelect
          values={['41']}
          onChange={() => {}}
          options={SIZES}
          emptyLabel="Barcha o'lchamlar"
          aria-label={LABEL}
        />,
      );
    });
    click(trigger(container));
    expect(rows()).toEqual(["Barcha o'lchamlar", '41', '38', '39', '40', '42']);
  });
});

describe('while the panel is open', () => {
  it('does not move a row the moment it is ticked', () => {
    // The one that matters. If '40' jumped to the top here, the row that slid into its place is the
    // one the next click would land on.
    const { container } = mount(FilterMultiSelect, { values: [] });
    click(trigger(container));
    tick('40');
    expect(rows()).toEqual(SIZES);
  });

  it('holds the order across several ticks', () => {
    const { container, state } = mount(FilterMultiSelect, { values: [] });
    click(trigger(container));
    tick('40');
    tick('38');
    tick('42');
    expect(rows()).toEqual(SIZES);
    // The ticks themselves landed where they were aimed.
    expect(state.values.sort()).toEqual(['38', '40', '42']);
  });

  it('does not move a row that is unticked either', () => {
    const { container } = mount(FilterMultiSelect, { values: ['41'] });
    click(trigger(container));
    tick('41');
    expect(rows()).toEqual(['41', '38', '39', '40', '42']);
  });
});

describe('on the next open', () => {
  it('lifts what was ticked last time', () => {
    const { container } = mount(FilterMultiSelect, { values: [] });
    click(trigger(container));
    tick('40');
    click(trigger(container));            // close
    expect(panel()).toBeNull();
    click(trigger(container));            // and open again
    expect(rows()).toEqual(['40', '38', '39', '41', '42']);
  });

  it('drops what was unticked back into place', () => {
    const { container } = mount(FilterMultiSelect, { values: ['41'] });
    click(trigger(container));
    tick('41');
    click(trigger(container));
    click(trigger(container));
    expect(rows()).toEqual(SIZES);
  });
});

describe('searching', () => {
  it('still narrows the list', () => {
    const { container } = mount(FilterMultiSelect, { values: [] });
    click(trigger(container));
    const search = panel().querySelector('input[type="search"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLInputElement.prototype, 'value',
      ).set;
      setter.call(search, '4');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows()).toEqual(['40', '41', '42']);
  });

  it('keeps a chosen survivor at the top of what is left', () => {
    const { container } = mount(FilterMultiSelect, { values: ['42'] });
    click(trigger(container));
    const search = panel().querySelector('input[type="search"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLInputElement.prototype, 'value',
      ).set;
      setter.call(search, '4');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows()).toEqual(['42', '40', '41']);
  });
});

describe('a single-pick dropdown', () => {
  it('shows the chosen row first', () => {
    const { container } = mount(FilterSearchableSelect, { value: '41', multi: false });
    click(trigger(container));
    expect(rows()).toEqual(['41', '38', '39', '40', '42']);
  });

  it('lifts the new choice once it is picked, because picking closes the panel', () => {
    // No seed is needed here: the move cannot be seen until the next open, which is the rule.
    const { container } = mount(FilterSearchableSelect, { value: '', multi: false });
    click(trigger(container));
    const row = Array.from(panel().querySelectorAll('li'))
      .find((n) => n.textContent.trim() === '39');
    click(row.querySelector('button'));
    expect(panel()).toBeNull();
    click(trigger(container));
    expect(rows()).toEqual(['39', '38', '40', '41', '42']);
  });
});

describe('the single-pick form field', () => {
  it('shows the chosen row first', () => {
    const { container } = mount(FormSearchableSelect, { value: '40', multi: false });
    click(trigger(container));
    expect(rows()).toEqual(['40', '38', '39', '41', '42']);
  });
});

describe('the Kassa product picker', () => {
  // The hot path, and the list most worth reordering: one row per stock layer, hundreds of them.
  const LAYERS = [
    { value: 'l1', label: 'Nike Air 38' },
    { value: 'l2', label: 'Nike Air 39' },
    { value: 'l3', label: 'Adidas Run 40' },
  ];

  const mountPicker = (value) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    const state = { value };
    const render = () => {
      act(() => {
        root.render(
          <ProductSearchableSelect
            pickerItems={LAYERS}
            value={state.value}
            onChange={(next) => { state.value = next; render(); }}
            aria-label={LABEL}
          />,
        );
      });
    };
    render();
    return { container, state };
  };

  it('shows the layer already on the line first', () => {
    const { container } = mountPicker('l3');
    click(trigger(container));
    expect(rows()).toEqual(['Adidas Run 40', 'Nike Air 38', 'Nike Air 39']);
  });

  it('leaves the list alone when the line is still empty', () => {
    const { container } = mountPicker('');
    click(trigger(container));
    expect(rows()).toEqual(['Nike Air 38', 'Nike Air 39', 'Adidas Run 40']);
  });
});

describe('the customer picker', () => {
  const PEOPLE = [
    { id: 1, name: 'Ali', telephone: '901' },
    { id: 2, name: 'Bek', telephone: '902' },
    { id: 3, name: 'Dil', telephone: '903' },
  ];

  const mountPicker = (value) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => {
      root.render(
        <CustomerSearchableSelect
          customers={PEOPLE}
          value={value}
          onChange={() => {}}
          aria-label={LABEL}
        />,
      );
    });
    return { container };
  };

  it('shows the chosen customer first', () => {
    const { container } = mountPicker(3);
    click(trigger(container));
    expect(rows()[0]).toContain('Dil');
  });

  it('leaves the list alone when nobody is chosen', () => {
    const { container } = mountPicker('');
    click(trigger(container));
    expect(rows()[0]).toContain('Ali');
  });
});

describe('the form variant, which can also be opened from the keyboard', () => {
  it('seeds the order when opened by click', () => {
    const { container } = mount(FormMultiSelect, { values: ['41'] });
    click(trigger(container));
    expect(rows()).toEqual(['41', '38', '39', '40', '42']);
  });

  it('seeds the order when opened with the keyboard too', () => {
    // Two ways in; the order has to be seeded on both, or arrowing into the panel shows the
    // selection scattered.
    const { container } = mount(FormMultiSelect, { values: ['41'] });
    act(() => {
      trigger(container).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(rows()).toEqual(['41', '38', '39', '40', '42']);
  });
});
