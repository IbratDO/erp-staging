/**
 * The four calls the till makes about gateway payments.
 *
 * A thin layer on purpose, so the component holds no URLs and the tests can drive the flow with a
 * stub. The one thing worth centralising is the **shape of a charge request**, because every field
 * in it is load-bearing: the idempotency key is what stops a double-tap becoming two charges, and
 * the sale reference is what stops a charge being orphaned if the reply never arrives.
 */

/** Start a charge against a scanned code. The only call here that can take money. */
export const charge = (api, { otpData, amountUzs, idempotencyKey, saleId, saleGroupId }) => {
  const body = {
    otp_data: otpData,
    amount_uzs: String(amountUzs),
    // Minted once per button press and held until a terminal reply - never per request, or a
    // retry would become a second charge.
    idempotency_key: idempotencyKey,
  };
  // Attached before the provider is called, so a charge whose reply is lost is still findable from
  // the sale it was taken for.
  if (saleGroupId) body.sale_group = saleGroupId;
  else body.sale = saleId;
  return api.post('/gateway-payments/charge/', body);
};

/** Ask the provider what happened to a charge. Safe to repeat; never charges. */
export const refresh = (api, ref) =>
  api.post(`/gateway-payments/${ref}/refresh/`, {});

/**
 * Charges already made against a sale.
 *
 * The resume path: the till creates its sale rows before the payment window opens, so a crash kills
 * the browser and not the sale. Reopening it has to show what has already been paid, or the cashier
 * charges the customer a second time for money sitting right there.
 */
export const forSale = (api, { saleId, saleGroupId }) =>
  api.get('/gateway-payments/for_sale/', {
    params: saleGroupId ? { sale_group: saleGroupId } : { sale: saleId },
  });

/** Give back a charge no sale has used. Refused by the server once any of it is applied. */
export const reverse = (api, ref) =>
  api.post(`/gateway-payments/${ref}/reverse/`, {});

/**
 * Settle a stuck charge from a Click id somebody read out of the merchant cabinet.
 *
 * Needed because Click Pass does not answer a lookup by our own reference -- it returns `-404` even
 * for a payment that succeeded -- so a reply lost before Click's id reached us leaves a row that
 * polling can never resolve.
 *
 * **The id is a question, not an answer.** The server asks Click about it and records Click's
 * reply; what was typed cannot mark a payment paid.
 */
export const resolve = (api, ref, providerPaymentId) =>
  api.post(`/gateway-payments/${ref}/resolve/`, {
    provider_payment_id: String(providerPaymentId || '').trim(),
  });

/**
 * Close a charge a person has confirmed Click has no record of.
 *
 * The other half of `resolve`: that one settles a stuck charge from Click's id, and this is for a
 * charge that never got one, which nothing can ask about. The server can only ever write `failed`
 * from here -- there is no way to credit the shop with money through this call.
 */
export const declareNoRecord = (api, ref, reason) =>
  api.post(`/gateway-payments/${ref}/no-record/`, { reason: String(reason || '').trim() });

const gatewayPayApi = { charge, refresh, forSale, reverse, resolve, declareNoRecord };

export default gatewayPayApi;
