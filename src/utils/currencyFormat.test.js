/**
 * How money is written on screen. The shop asked for `1 287 640`, not `1,287,640`.
 */
import { formatDisplayAmount, formatPlainAmount } from './currencyFormat';

describe('formatDisplayAmount', () => {
  test('som is grouped in threes by a space, with no decimals', () => {
    expect(formatDisplayAmount(1287640, 'UZS')).toBe('1 287 640 UZS');
  });

  test('dollars group the same way and keep their cents', () => {
    expect(formatDisplayAmount(1287640.5, 'USD')).toBe('$1 287 640.50');
    expect(formatDisplayAmount(109, 'USD')).toBe('$109.00');
  });

  test('short amounts gain no separator', () => {
    expect(formatDisplayAmount(640, 'UZS')).toBe('640 UZS');
  });

  test('the grouping does not depend on the machine, only on the number', () => {
    // The point of doing this by hand: `toLocaleString` writes commas on one PC and spaces on
    // another, so the counter and the office would disagree about the same sale.
    expect(formatDisplayAmount(1000000, 'UZS')).toBe('1 000 000 UZS');
  });

  test('a negative amount keeps its sign in front of the grouped digits', () => {
    expect(formatDisplayAmount(-1287640, 'UZS')).toBe('-1 287 640 UZS');
    expect(formatDisplayAmount(-1234.5, 'USD')).toBe('$-1 234.50');
  });

  test('nothing to show stays an em dash', () => {
    expect(formatDisplayAmount(null, 'UZS')).toBe('—');
    expect(formatDisplayAmount('abc', 'USD')).toBe('—');
  });

  test('som rounds to a whole som rather than showing tiyin', () => {
    expect(formatDisplayAmount(1287640.7, 'UZS')).toBe('1 287 641 UZS');
  });
});

describe('formatPlainAmount', () => {
  test('groups without naming a currency', () => {
    expect(formatPlainAmount(1287640)).toBe('1 287 640.00');
    expect(formatPlainAmount(1287640, 0)).toBe('1 287 640');
  });
});
