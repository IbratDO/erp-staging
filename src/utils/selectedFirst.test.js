/**
 * What you have ticked is at the top of the list.
 *
 * The rule is a stable partition, not a sort: the chosen rows keep the list's own order among
 * themselves and so do the rest. Anything else makes the same selection land in a different place
 * depending on the order it was clicked in.
 */
import selectedFirst from './selectedFirst';

const sizes = ['38', '39', '40', '41', '42'];
const picked = (...vals) => (o) => vals.includes(o);

describe('the chosen rows come first', () => {
  it('lifts one row out of the middle', () => {
    expect(selectedFirst(sizes, picked('40'))).toEqual(['40', '38', '39', '41', '42']);
  });

  it('keeps the list order among the chosen, whatever order they were clicked', () => {
    // '41' then '39' must read the same as '39' then '41' — the predicate cannot tell the
    // difference, and that is the point.
    expect(selectedFirst(sizes, picked('41', '39'))).toEqual(['39', '41', '38', '40', '42']);
  });

  it('keeps the list order among the rest too', () => {
    expect(selectedFirst(sizes, picked('38'))).toEqual(['38', '39', '40', '41', '42']);
  });

  it('works on objects, not just strings', () => {
    const rows = [{ value: 1 }, { value: 2 }, { value: 3 }];
    expect(selectedFirst(rows, (o) => o.value === 3)).toEqual([{ value: 3 }, { value: 1 }, { value: 2 }]);
  });

  it('hands back the same row objects, not copies', () => {
    // The callers key their <li> off these and compare them by identity.
    const rows = [{ value: 1 }, { value: 2 }];
    const out = selectedFirst(rows, (o) => o.value === 2);
    expect(out[0]).toBe(rows[1]);
    expect(out[1]).toBe(rows[0]);
  });
});

describe('when nothing moves', () => {
  it('leaves the order alone with nothing chosen', () => {
    expect(selectedFirst(sizes, () => false)).toEqual(sizes);
  });

  it('leaves the order alone with everything chosen', () => {
    expect(selectedFirst(sizes, () => true)).toEqual(sizes);
  });

  it('does not mutate the list it was given', () => {
    const original = [...sizes];
    selectedFirst(sizes, picked('42'));
    expect(sizes).toEqual(original);
  });
});

describe('bad input does not blank the dropdown', () => {
  it.each([[null], [undefined], [{}], ['38']])('survives %j as the list', (items) => {
    expect(selectedFirst(items, picked('38'))).toEqual([]);
  });

  it.each([[null], [undefined], ['nope']])('returns the list unchanged for %j as the test', (fn) => {
    expect(selectedFirst(sizes, fn)).toEqual(sizes);
  });

  it('drops a row whose test throws to the bottom instead of throwing', () => {
    const boom = (o) => {
      if (o === '40') throw new Error('malformed row');
      return o === '42';
    };
    expect(selectedFirst(sizes, boom)).toEqual(['42', '38', '39', '40', '41']);
  });

  it('handles an empty list', () => {
    expect(selectedFirst([], picked('38'))).toEqual([]);
  });
});
