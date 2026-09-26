/**
 * What to call the shop, when we might not know.
 *
 * The name comes from the database now, so it can be absent in ways it never could when it was a
 * string compiled into the bundle: the row starts empty on a fresh deployment, the request can fail,
 * and the login screen asks before anyone has signed in. The property that matters is that **none of
 * those ends with a nameless receipt** — the chain falls back to the string that printed before this
 * table existed.
 *
 * The rungs are asserted separately because each one covers a different real failure: rung 2 is the
 * cold start with no network, rung 3 is the deployment where nobody has typed a name yet.
 */
import {
  resolveShopName,
  readCachedShopSettings,
  writeCachedShopSettings,
  SHOP_SETTINGS_STORAGE_KEY,
} from './shopIdentity';

describe('which name wins', () => {
  it('prefers the live settings', () => {
    expect(
      resolveShopName({ shop_name: 'Lady Luxe Shop' }, { shop_name: 'Old Name' }, 'Bundled'),
    ).toBe('Lady Luxe Shop');
  });

  it('falls back to the cache when the request gave us nothing', () => {
    // The cold start with no network: the tab opens, the fetch fails, and a chek still has to name
    // the shop.
    expect(resolveShopName(null, { shop_name: 'Immense Shop' }, 'Bundled')).toBe('Immense Shop');
  });

  it('falls back to the bundled string when nothing is stored yet', () => {
    // Every deployment starts here — the row exists with an empty name until an Admin types one.
    expect(resolveShopName({ shop_name: '' }, null, 'Immense Shop')).toBe('Immense Shop');
  });

  it('returns empty rather than throwing when there is nothing at all', () => {
    expect(resolveShopName(null, null, '')).toBe('');
    expect(resolveShopName(undefined, undefined)).toBe('');
  });
});

describe('a name that is not really a name', () => {
  it('treats whitespace as absent and moves down the chain', () => {
    // The case that would print a blank line on the chek and read as a broken printer.
    expect(resolveShopName({ shop_name: '   ' }, null, 'Immense Shop')).toBe('Immense Shop');
  });

  it('trims a name that is otherwise fine', () => {
    expect(resolveShopName({ shop_name: '  Lady Luxe Shop  ' }, null, 'x')).toBe('Lady Luxe Shop');
  });

  it.each([[null], [undefined], [42], [{}], [[]]])('ignores a shop_name of %j', (v) => {
    expect(resolveShopName({ shop_name: v }, null, 'Immense Shop')).toBe('Immense Shop');
  });

  it('ignores a cache entry that is not an object', () => {
    expect(resolveShopName(null, 'Lady Luxe', 'Immense Shop')).toBe('Immense Shop');
  });
});

describe('the cache', () => {
  const store = () => {
    const data = new Map();
    return {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, v),
      data,
    };
  };

  it('round-trips a settings row', () => {
    const s = store();
    writeCachedShopSettings({ shop_name: 'Immense Shop', phone: '+998' }, s);
    expect(readCachedShopSettings(s)).toEqual({ shop_name: 'Immense Shop', phone: '+998' });
  });

  it('writes under the key the context also reads', () => {
    const s = store();
    writeCachedShopSettings({ shop_name: 'x' }, s);
    expect(s.data.has(SHOP_SETTINGS_STORAGE_KEY)).toBe(true);
  });

  it('reads null rather than throwing on corrupted contents', () => {
    // Real: a half-written entry, or another version of the app having stored something else.
    const s = store();
    s.setItem(SHOP_SETTINGS_STORAGE_KEY, '{not json');
    expect(readCachedShopSettings(s)).toBeNull();
  });

  it('reads null when the stored value is valid JSON but not an object', () => {
    const s = store();
    s.setItem(SHOP_SETTINGS_STORAGE_KEY, '"Immense Shop"');
    expect(readCachedShopSettings(s)).toBeNull();
  });

  it('survives storage being unavailable in both directions', () => {
    // A private window, or blocked site data: the accessor itself throws. Losing the cache is
    // acceptable; failing to render the page over it is not.
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(readCachedShopSettings(throwing)).toBeNull();
    expect(() => writeCachedShopSettings({ shop_name: 'x' }, throwing)).not.toThrow();
  });

  it('survives there being no storage at all', () => {
    expect(readCachedShopSettings(undefined)).toBeNull();
    expect(() => writeCachedShopSettings({ shop_name: 'x' }, undefined)).not.toThrow();
  });

  it('does not store a non-object', () => {
    const s = store();
    writeCachedShopSettings(null, s);
    writeCachedShopSettings('Immense Shop', s);
    expect(s.data.size).toBe(0);
  });
});
