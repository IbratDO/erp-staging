/**
 * Phase 2 slice 7, front end: refunding out of the account the money came into.
 *
 * Two halves, and the second is the one that would have been reported as "it says I have no
 * money". `Returns.js` checks the balance **itself**, before posting, so a check that kept
 * summing cash + card would refuse a bank refund the bank could cover — and the user would be
 * told they were short while looking at the money on the same screen.
 */
import { buildReturnRefundRequest } from './returnRefundHelpers';
import { cashBalanceTotalByCurrency } from './currencyFormat';

const balances = [
  { balance_type: 'uzs_cash', balance: '300000' },
  { balance_type: 'uzs_card', balance: '200000' },
  { balance_type: 'uzs_transfer', balance: '9000000' },
  { balance_type: 'usd_cash', balance: '50' },
];

describe('the refund request carries the account', () => {
  it('sends the som account when one is chosen', () => {
    const body = buildReturnRefundRequest(
      { uzs: '1000000', usd: '', uzs_account: 'uzs_transfer' }, null,
    );
    expect(body.uzs_account).toBe('uzs_transfer');
  });

  it('sends the dollar account when one is chosen', () => {
    const body = buildReturnRefundRequest(
      { uzs: '', usd: '50', usd_account: 'usd_card' }, null,
    );
    expect(body.usd_account).toBe('usd_card');
  });

  it('sends both when a refund has both legs', () => {
    const body = buildReturnRefundRequest(
      { uzs: '1000000', usd: '50', uzs_account: 'uzs_transfer', usd_account: 'usd_card' },
      null,
    );
    expect(body.uzs_account).toBe('uzs_transfer');
    expect(body.usd_account).toBe('usd_card');
  });

  it('leaves the keys off entirely when nothing was chosen', () => {
    // The regression population: every refund the shop has recorded. A body carrying
    // `uzs_account: ''` would be harmless but is not what the old client sent, and keeping the
    // posted shape identical is what makes this slice unable to change an ordinary refund.
    const body = buildReturnRefundRequest({ uzs: '1000000', usd: '' }, null);
    expect('uzs_account' in body).toBe(false);
    expect('usd_account' in body).toBe(false);
  });

  it('still carries the amounts and the difference flags', () => {
    const body = buildReturnRefundRequest(
      { uzs: '1000000', usd: '', uzs_account: 'uzs_transfer' },
      null,
      { difference: { pl: true, plAmount: '500' } },
    );
    expect(body.uzs).toBe(1000000);
    expect(body.apply_refund_pl).toBe(true);
    expect(body.refund_pl_amount).toBe('500');
  });
});

describe('the balance check follows the chosen account', () => {
  it('answers for the one account when named', () => {
    expect(cashBalanceTotalByCurrency(balances, 'UZS', 'uzs_transfer')).toBe(9000000);
    expect(cashBalanceTotalByCurrency(balances, 'UZS', 'uzs_card')).toBe(200000);
  });

  it('still sums cash and card when nothing is named', () => {
    // Unchanged for every existing caller, which is what lets the parameter be added at all.
    expect(cashBalanceTotalByCurrency(balances, 'UZS')).toBe(500000);
    expect(cashBalanceTotalByCurrency(balances, 'USD')).toBe(50);
  });

  it('would have refused a bank refund before this change, and does not now', () => {
    // 1,000,000 against a drawer holding 500,000: short on the old reading, covered on the new.
    expect(cashBalanceTotalByCurrency(balances, 'UZS') < 1000000).toBe(true);
    expect(cashBalanceTotalByCurrency(balances, 'UZS', 'uzs_transfer') >= 1000000).toBe(true);
  });

  it('is forgiving about spelling, as the server is', () => {
    expect(cashBalanceTotalByCurrency(balances, 'UZS', '  UZS_Transfer ')).toBe(9000000);
  });

  it('answers zero for an account holding nothing', () => {
    expect(cashBalanceTotalByCurrency(balances, 'USD', 'usd_card')).toBe(0);
  });

  it('treats an empty account as not named rather than as a missing bucket', () => {
    expect(cashBalanceTotalByCurrency(balances, 'UZS', '')).toBe(500000);
    expect(cashBalanceTotalByCurrency(balances, 'UZS', null)).toBe(500000);
  });
});
