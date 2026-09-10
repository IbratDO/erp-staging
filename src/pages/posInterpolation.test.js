/**
 * Every `{{placeholder}}` the till's strings ask for is actually supplied at the call site.
 *
 * This is here because the shop saw it: the basket read "omborda {{qty}} dona" and the packaging
 * dropdown read "L — omborda {{qty}} ta", because the strings had been renamed to `{{qty}}` while
 * `Pos.js` still passed `count`. i18next does not complain about that — it leaves the braces on
 * screen, in front of a customer.
 *
 * The check reads the source rather than rendering the page, so it needs no DOM and cannot rot as
 * the layout changes. It also compares the three languages against each other: a translator who
 * drops a placeholder from the Russian leaves a sentence missing its number.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'Pos.js'), 'utf8');
const LANGS = ['uz', 'en', 'ru'];

function posBlock(lang) {
  const file = path.join(__dirname, '..', 'locales', lang, 'sales.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).pos;
}

/** `{ 'pos.inStock': ['qty'] }` — every leaf string in the block that interpolates something. */
function placeholdersIn(block, prefix = 'pos') {
  const out = {};
  for (const [key, value] of Object.entries(block)) {
    const full = `${prefix}.${key}`;
    if (value && typeof value === 'object') {
      Object.assign(out, placeholdersIn(value, full));
      continue;
    }
    const names = [...String(value).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
    if (names.length) out[full] = [...new Set(names)];
  }
  return out;
}

/** The option keys passed to `tr('<key>', { ... })` in Pos.js, or null if the call has no object. */
function argsAtCallSite(key) {
  const at = SRC.indexOf(`tr('${key}'`);
  if (at === -1) return undefined;
  const open = SRC.indexOf('{', at);
  const close = SRC.indexOf(')', at);
  if (open === -1 || (close !== -1 && close < open)) return null;

  let depth = 0;
  let end = open;
  for (; end < SRC.length; end += 1) {
    if (SRC[end] === '{') depth += 1;
    if (SRC[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = SRC.slice(open + 1, end);
  // Both `name: value` and the shorthand `{ code }` — the till uses each. Nested objects would
  // need a parser; it passes none.
  return [...body.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[:,}]|$)/g)].map((m) => m[1]);
}

describe('Kassa strings and their call sites', () => {
  const uz = placeholdersIn(posBlock('uz'));

  test.each(Object.keys(uz))('%s is given every value it prints', (key) => {
    const passed = argsAtCallSite(key);
    if (passed === undefined) return; // a string this screen does not use itself
    expect(passed).not.toBeNull();
    for (const name of uz[key]) expect(passed).toContain(name);
  });

  test('the three languages ask for the same values', () => {
    const [ru, en] = [placeholdersIn(posBlock('ru')), placeholdersIn(posBlock('en'))];
    for (const [key, names] of Object.entries(uz)) {
      for (const other of [en, ru]) {
        expect({ key, names: (other[key] || []).slice().sort() })
          .toEqual({ key, names: names.slice().sort() });
      }
    }
  });

  test('it would have caught the bug it was written for', () => {
    // `inStock` is the string that shipped broken; the guard must actually cover it.
    expect(uz['pos.inStock']).toEqual(['qty']);
    expect(argsAtCallSite('pos.inStock')).toContain('qty');
  });
});
