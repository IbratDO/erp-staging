/**
 * The shape of a gateway request.
 *
 * This file exists because of a bug that reached a real counter. `charge()` was given a `provider`
 * parameter and the till passed it correctly — but the function never put it in the **body**. The
 * server's default then did what it was told, and a scanned **Payme** QR was sent to **Click**:
 * the window said Payme, the request said nothing, and the row came back as a Click payment.
 *
 * Nothing could move money that way — Click rejected a token it could not read — but it is the
 * shape of the failure that does: one provider's single-use code handed to another.
 *
 * **Every field in a charge body is load-bearing**, and none of them is visible from the call site:
 * the idempotency key is what stops a double-tap becoming two charges, the sale reference is what
 * stops a charge being orphaned when a reply is lost, and the provider is what decides who gets the
 * customer's code. So they are asserted here, on the body, rather than trusted to a signature.
 */
import { cancelReceiptUnused, charge, declareNoRecord, forSale, refresh, resolve, reverse } from './gatewayPayApi';

const api = () => {
  const calls = [];
  return {
    calls,
    post: (url, body) => { calls.push({ method: 'post', url, body }); return Promise.resolve({ data: {} }); },
    get: (url, config) => { calls.push({ method: 'get', url, config }); return Promise.resolve({ data: {} }); },
  };
};

describe('the charge body', () => {
  const baseArgs = {
    otpData: 'scanned-code',
    amountUzs: 1000,
    idempotencyKey: 'abc123',
    saleId: 561,
  };

  it('says which provider is being charged', () => {
    // **The assertion this file exists for.** Without it the server defaults to Click and the
    // customer's Payme code goes to the wrong company.
    const client = api();
    charge(client, { ...baseArgs, provider: 'payme' });
    expect(client.calls[0].body.provider).toBe('payme');
  });

  it('defaults to Click, so a till that predates the second provider still works', () => {
    const client = api();
    charge(client, baseArgs);
    expect(client.calls[0].body.provider).toBe('click');
  });

  it('carries the scanned code and the amount as the server names them', () => {
    const client = api();
    charge(client, { ...baseArgs, provider: 'click' });
    expect(client.calls[0].body.otp_data).toBe('scanned-code');
    expect(client.calls[0].body.amount_uzs).toBe('1000');
  });

  it('carries the idempotency key, which is what stops a double-tap charging twice', () => {
    const client = api();
    charge(client, baseArgs);
    expect(client.calls[0].body.idempotency_key).toBe('abc123');
  });

  it('attaches the sale, so a lost reply is still findable', () => {
    const client = api();
    charge(client, baseArgs);
    expect(client.calls[0].body.sale).toBe(561);
    expect(client.calls[0].body.sale_group).toBeUndefined();
  });

  it('attaches the basket instead when there is one', () => {
    // A basket is several sale rows sharing a group; the charge belongs to the group, not to
    // whichever line happened to be first.
    const client = api();
    charge(client, { ...baseArgs, saleGroupId: 42 });
    expect(client.calls[0].body.sale_group).toBe(42);
    expect(client.calls[0].body.sale).toBeUndefined();
  });

  it('posts to the charge endpoint', () => {
    const client = api();
    charge(client, baseArgs);
    expect(client.calls[0].url).toBe('/gateway-payments/charge/');
  });
});

describe('the calls that never take money', () => {
  it('asks about a payment by our own reference', () => {
    const client = api();
    refresh(client, 'GP-0001');
    expect(client.calls[0].url).toBe('/gateway-payments/GP-0001/refresh/');
    expect(client.calls[0].body).toEqual({});
  });

  it('reads a sale s payments without sending anything', () => {
    const client = api();
    forSale(client, { saleId: 561 });
    expect(client.calls[0].method).toBe('get');
    expect(client.calls[0].config.params).toEqual({ sale: 561 });
  });

  it('prefers the basket when a sale belongs to one', () => {
    const client = api();
    forSale(client, { saleId: 561, saleGroupId: 42 });
    expect(client.calls[0].config.params).toEqual({ sale_group: 42 });
  });

  it('sends a resolve id trimmed, and as the server names it', () => {
    const client = api();
    resolve(client, 'GP-0001', '  5353104348  ');
    expect(client.calls[0].body).toEqual({ provider_payment_id: '5353104348' });
  });

  it('sends a close-by-hand reason trimmed', () => {
    const client = api();
    declareNoRecord(client, 'GP-0001', '  nothing in the cabinet  ');
    expect(client.calls[0].body).toEqual({ reason: 'nothing in the cabinet' });
  });

  it('gives a charge back through its own endpoint', () => {
    const client = api();
    reverse(client, 'GP-0001');
    expect(client.calls[0].url).toBe('/gateway-payments/GP-0001/reverse/');
  });
});
