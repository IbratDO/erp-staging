/** Shared logic for "Complete & Pay" (sale status → completed) used from Sales and Dispatchers tabs. */
import i18n from '../i18n';
import { formatDisplayAmount } from './currencyFormat';

/** @param {string} key - key under sales.completePay */
function cp(key, opts) {
  return i18n.t(`completePay.${key}`, { ns: 'sales', ...opts });
}

/** Match backend _validate_and_set_sale_completion_shortfall tolerance (USD sale currency). */
export const PAYMENT_SHORTFALL_TOLERANCE = 0.005;

export function saleHasOrderAdvance(sale) {
  if (!sale) return false;
  // A synthetic group sale carries only the *first* line's fields, so asking it directly would
  // miss an advance taken against any other line and skip the cap entirely.
  if (sale.isSaleGroup && Array.isArray(sale.groupSales)) {
    return sale.groupSales.some((line) => saleHasOrderAdvance(line));
  }
  const advance = parseFloat(sale.advance_payment_received) || 0;
  return advance > 0 && (sale.sale_type === 'from_order' || sale.order != null);
}

/** Currency in which the customer advance was booked (from linked order when available). */
export function getAdvanceCurrency(sale) {
  const fromApiOrOrder =
    sale?.advance_payment_currency ||
    sale?.order_detail?.advance_payment_currency ||
    (typeof sale?.order === 'object' ? sale?.order?.advance_payment_currency : null);
  const advance = parseFloat(sale?.advance_payment_received) || 0;
  const sc = String(sale?.sale_currency || 'USD').toUpperCase();

  // Large advances on USD sales are almost always UZS (soum), even if currency was stored/sent as USD.
  if (sc === 'USD' && advance >= 1000) return 'UZS';
  if (sc === 'UZS' && advance > 0 && advance < 1000) return 'USD';

  if (fromApiOrOrder) return String(fromApiOrOrder).toUpperCase();
  return sc;
}

/**
 * Order advance expressed in the sale's list currency.
 * Returns null when CBU conversion is required but rate is not available yet.
 */
export function advanceAmountInSaleCurrency(sale, cbuRate) {
  if (!sale) return 0;
  const advance = parseFloat(sale.advance_payment_received) || 0;
  if (advance <= 0) return 0;
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const ac = getAdvanceCurrency(sale);
  if (ac === sc) return advance;
  if (!cbuRate) return null;
  if (ac === 'UZS' && sc === 'USD') return uzsToUsd(advance, cbuRate);
  if (ac === 'USD' && sc === 'UZS') return usdToUzs(advance, cbuRate);
  return advance;
}

/** Per-unit price customer pays: selling_price minus discount amount. */
export function saleEffectiveUnitPrice(sale) {
  if (!sale) return 0;
  const list = parseFloat(sale.selling_price) || 0;
  const discount = parseFloat(sale.discount_price) || 0;
  return Math.max(0, list - discount);
}

export function saleDiscountAmountPerUnit(sale) {
  if (!sale) return 0;
  const discount = parseFloat(sale.discount_price);
  return Number.isFinite(discount) && discount > 0 ? discount : 0;
}

export function uzsToUsd(uzsAmount, rate) {
  const uzs = parseFloat(uzsAmount) || 0;
  const r = parseFloat(rate);
  if (!uzs || !r || r <= 0) return 0;
  return Math.round((uzs / r) * 100) / 100;
}

export function usdToUzs(usdAmount, rate) {
  const usd = parseFloat(usdAmount) || 0;
  const r = parseFloat(rate);
  if (!usd || !r || r <= 0) return 0;
  return Math.round(usd * r);
}

/** Combined payment in the sale's list currency using CBU rate (UZS per 1 USD). */
export function paymentTotalInSaleCurrency(uzsAmount, usdAmount, saleCurrency, rate) {
  const sc = (saleCurrency || 'USD').toUpperCase();
  const uzs = parseFloat(uzsAmount) || 0;
  const usd = parseFloat(usdAmount) || 0;
  if (sc === 'USD') {
    return Math.round((usd + uzsToUsd(uzs, rate)) * 100) / 100;
  }
  return usdToUzs(usd, rate) + uzs;
}

/** True when UZS/USD legs must be converted via CBU to compare to list currency. */
export function paymentNeedsCbuConversion(uzsAmount, usdAmount, saleCurrency) {
  const sc = (saleCurrency || 'USD').toUpperCase();
  const uzs = parseFloat(uzsAmount) || 0;
  const usd = parseFloat(usdAmount) || 0;
  return (
    (uzs > 0 && usd > 0) ||
    (sc === 'USD' && uzs > 0 && usd === 0) ||
    (sc === 'UZS' && usd > 0 && uzs === 0)
  );
}

/**
 * Payment total in list currency; null when CBU is required but rate is not loaded yet.
 * Matches backend payment_total_in_sale_currency / _payment_amount_in_sale_currency.
 */
export function paymentAmountInSaleCurrency(uzsStr, usdStr, saleCurrency, cbuRate) {
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;
  if (uzsT <= 0 && usdT <= 0) return null;
  if (paymentNeedsCbuConversion(uzsT, usdT, saleCurrency)) {
    if (!cbuRate) return null;
    return paymentTotalInSaleCurrency(uzsT, usdT, saleCurrency, cbuRate);
  }
  const sc = (saleCurrency || 'USD').toUpperCase();
  return sc === 'USD' ? usdT : uzsT;
}

/**
 * "Qaytim" — change out of the shop's own drawer.
 *
 * Offered wherever the customer settles at the counter: a direct shop sale (single or grouped),
 * a reserved sale being sold, and an on-demand order collected in the shop — including one
 * carrying an advance, whose remaining-due cap simply applies to the net.
 *
 * Not the delivery flow, where the customer pays a courier at their door and the shop is
 * settled days later; the courier gives any change from their own hand and the shop's drawer is
 * never in the room. Mirrors the server's `_sale_accepts_change`, so the option never appears
 * where submitting it would fail.
 */
export function saleAcceptsChange(sale) {
  if (!sale) return false;
  if (sale.sale_type === 'delivery') return false;
  return true;
}

/** Both change legs as one figure in the sale's currency; null when CBU is needed but absent. */
export function changeAmountInSaleCurrency(uzsStr, usdStr, saleCurrency, cbuRate) {
  const uzs = parseFloat(uzsStr) || 0;
  const usd = parseFloat(usdStr) || 0;
  if (uzs <= 0 && usd <= 0) return 0;
  const sc = (saleCurrency || 'USD').toUpperCase();
  const crosses = sc === 'USD' ? uzs > 0 : usd > 0;
  if (crosses && !cbuRate) return null;
  return paymentTotalInSaleCurrency(uzs, usd, sc, cbuRate);
}

function formatAmountForCurrency(amount, currency) {
  const sc = (currency || 'USD').toUpperCase();
  if (sc === 'UZS') {
    return `${Math.round(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`;
  }
  return `$${amount.toFixed(2)} USD`;
}

export function computeAdvanceRemainingDue(sale, sellingPriceOverride, cbuRate) {
  if (!sale) return 0;
  let total;
  if (sellingPriceOverride != null && sellingPriceOverride !== '') {
    const qty = parseFloat(sale.quantity) || 0;
    total = parseFloat(sellingPriceOverride) * qty;
  } else if (sale.total_amount != null && sale.total_amount !== '') {
    total = parseFloat(sale.total_amount);
  } else {
    const qty = parseFloat(sale.quantity) || 0;
    total = saleEffectiveUnitPrice(sale) * qty;
  }
  // Each line keeps its own advance, so the group's is their sum — reading it off the synthetic
  // sale would take the first line's and call it the whole group's.
  let advance;
  if (sale.isSaleGroup && Array.isArray(sale.groupSales)) {
    advance = 0;
    for (const line of sale.groupSales) {
      const one = advanceAmountInSaleCurrency(line, cbuRate);
      if (one == null) return null;
      advance += one;
    }
  } else {
    advance = advanceAmountInSaleCurrency(sale, cbuRate);
  }
  if (advance == null) return null;
  return Math.max(0, (Number.isFinite(total) ? total : 0) - advance);
}

export function paymentHasShortfall(due, paid, saleCurrency) {
  const d = parseFloat(due) || 0;
  const p = parseFloat(paid) || 0;
  if ((saleCurrency || 'USD').toUpperCase() === 'UZS') {
    return p + 1 < d;
  }
  return p + PAYMENT_SHORTFALL_TOLERANCE < d;
}

/**
 * `changeInSc` is change handed back, valued in the sale's currency. It comes off before the
 * cap for the same reason the server does it: handing over more than the remaining due and
 * taking the surplus straight back is not an overpayment.
 *
 * `surplusClassified` says the shop has already named what the excess is — a conversion
 * difference, extra profit, or a split of the two. The cap used to hard-block *any* overpayment
 * on an advance sale, which predates both of those options and the courier's door-side change.
 * It meant a soum payment against a dollar price could never be settled once an advance existed:
 * the rate gap is a genuine surplus, the shop had ticked "Konversiya farqi" to say so, and the
 * form rejected it anyway. Non-advance sales already relax the same way (see
 * `exceedsRemainingDue` in `computePaymentDifferenceMeta`); an unexplained surplus is still
 * blocked here, and completeness is still enforced downstream.
 */
export function validateAdvanceCompletionPayment(
  sale, uzsStr, usdStr, sellingPriceOverride, cbuRate, changeInSc = 0, surplusClassified = false,
) {
  if (!saleHasOrderAdvance(sale)) {
    return { ok: true };
  }
  const due = computeAdvanceRemainingDue(sale, sellingPriceOverride, cbuRate);
  // `cap` is what the raw legs are measured against; `due` stays the real remaining balance so
  // the confirm dialogs below keep quoting the number the customer actually owes.
  const back = parseFloat(changeInSc) || 0;
  // A named surplus has somewhere to go, so it is not measured against the cap. Infinity rather
  // than a skipped branch, so the split/cross-currency confirmations below still run.
  const cap = due == null ? null : (surplusClassified ? Infinity : due + back);
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;
  const advCcy = getAdvanceCurrency(sale);
  const needsAdvCbu = advCcy !== sc;

  if (due == null || (needsAdvCbu && !cbuRate)) {
    return { ok: false, error: cp('errRateLoading') };
  }

  if (uzsT > 0 && usdT > 0) {
    if (!cbuRate) {
      return { ok: false, error: cp('errRateLoading') };
    }
    const paid = paymentTotalInSaleCurrency(uzsT, usdT, sc, cbuRate);
    if (paid > cap + 0.005) {
      return {
        ok: false,
        error: cp('errExceedsDueAdvanceCbu', { amount: formatAmountForCurrency(due, sc) }),
      };
    }
    return {
      ok: true,
      needsSplitCurrencyConfirm: true,
      due,
      sc,
      uzsAmount: uzsT,
      usdAmount: usdT,
      paidInSaleCurrency: paid,
      cbuRate,
    };
  }

  if (sc === 'USD') {
    if (usdT > cap + 0.005) {
      return {
        ok: false,
        error: cp('errExceedsDueFormatted', { amount: formatAmountForCurrency(due, sc) }),
      };
    }
    if (uzsT > 0 && usdT === 0) {
      return {
        ok: true,
        needsCrossCurrencyConfirm: true,
        due,
        sc,
        otherCurrency: 'UZS',
        otherAmount: uzsT,
      };
    }
  } else {
    if (uzsT > cap + 0.005) {
      return {
        ok: false,
        error: cp('errExceedsDueFormatted', { amount: formatAmountForCurrency(due, sc) }),
      };
    }
    if (usdT > 0 && uzsT === 0) {
      return {
        ok: true,
        needsCrossCurrencyConfirm: true,
        due,
        sc,
        otherCurrency: 'USD',
        otherAmount: usdT,
      };
    }
  }

  return { ok: true };
}

export function buildCrossCurrencyAdvanceConfirmMessage(validation, exchangeRate) {
  const { due, sc, otherCurrency, otherAmount } = validation;
  const dueLabel = formatAmountForCurrency(due, sc);
  const payLabel = formatAmountForCurrency(otherAmount, otherCurrency);
  const rateLine = exchangeRate?.label
    ? cp('confirmCbuRate', { label: exchangeRate.label })
    : exchangeRate?.rate
      ? cp('confirmCbuRateUsdUzs', {
          rate: Number(exchangeRate.rate).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        })
      : null;
  let equivSuffix = '';
  if (exchangeRate?.rate && otherAmount > 0) {
    if (sc === 'USD' && otherCurrency === 'UZS') {
      equivSuffix = cp('confirmCrossEquiv', {
        amount: formatAmountForCurrency(uzsToUsd(otherAmount, exchangeRate.rate), sc),
      });
    } else if (sc === 'UZS' && otherCurrency === 'USD') {
      equivSuffix = cp('confirmCrossEquiv', {
        amount: formatAmountForCurrency(usdToUzs(otherAmount, exchangeRate.rate), sc),
      });
    }
  }
  return [
    rateLine,
    cp('confirmCrossListed', { sc }),
    cp('confirmCrossRemaining', { sc, due: dueLabel }),
    cp('confirmCrossRecording', { payLabel, otherCurrency, equiv: equivSuffix }),
    cp('confirmContinue'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildSplitCurrencyConfirmMessage({
  sale,
  uzsAmount,
  usdAmount,
  due,
  sc,
  cbuRate,
  paidInSaleCurrency,
  exchangeRate,
}) {
  const saleCurrency = (sc || sale?.sale_currency || 'USD').toUpperCase();
  const rateLabel =
    exchangeRate?.label ||
    (cbuRate
      ? cp('confirmCbuRateUsdUzs', {
          rate: Number(cbuRate).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        })
      : null);
  const uzsFormatted = formatAmountForCurrency(uzsAmount, 'UZS');
  const usdFormatted = formatAmountForCurrency(usdAmount, 'USD');
  const uzsLine =
    uzsAmount > 0
      ? saleCurrency === 'USD'
        ? cp('confirmSplitLineUzsWithEquiv', {
            amount: uzsFormatted,
            equiv: formatAmountForCurrency(uzsToUsd(uzsAmount, cbuRate), saleCurrency),
          })
        : cp('confirmSplitLineUzs', { amount: uzsFormatted })
      : null;
  const usdLine =
    usdAmount > 0
      ? saleCurrency === 'UZS'
        ? cp('confirmSplitLineUsdWithEquiv', {
            amount: usdFormatted,
            equiv: formatAmountForCurrency(usdToUzs(usdAmount, cbuRate), saleCurrency),
          })
        : cp('confirmSplitLineUsd', { amount: usdFormatted })
      : null;
  const totalPaid =
    paidInSaleCurrency != null
      ? formatAmountForCurrency(paidInSaleCurrency, saleCurrency)
      : formatAmountForCurrency(
          paymentTotalInSaleCurrency(uzsAmount, usdAmount, saleCurrency, cbuRate),
          saleCurrency,
        );
  return [
    rateLabel ? cp('confirmCbuRate', { label: rateLabel }) : null,
    cp('confirmSplitDue', { due: formatAmountForCurrency(due, saleCurrency) }),
    cp('confirmSplitPaying'),
    uzsLine,
    usdLine,
    cp('confirmSplitTotal', { currency: saleCurrency, total: totalPaid }),
    cp('confirmContinue'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Multiline confirm when payment exceeds amount due (shared by modal and inline flows). */
export function buildOverpayConfirmMessage(meta, exchangeRate) {
  const dueLabel = formatDisplayAmount(meta.due, meta.sc);
  const paidLabel = formatDisplayAmount(meta.paid, meta.sc);
  const excessLabel = formatDisplayAmount(meta.overpaymentAmount, meta.sc);
  return [
    cp('confirmOverpayTitle'),
    `${cp('confirmOverpayDue')} ${dueLabel} · ${cp('confirmOverpayEntered')} ${paidLabel} · ${cp('confirmOverpayExcess')} ${excessLabel}.`,
    meta.splitCurrency && exchangeRate?.label
      ? cp('confirmOverpayCbu', { label: exchangeRate.label })
      : null,
    cp('confirmOverpayBook'),
    cp('confirmContinue'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Multiline confirm when payment exceeds amount due and nothing was selected — additional profit. */
export function buildAdditionalProfitConfirmMessage(meta, exchangeRate) {
  const dueLabel = formatDisplayAmount(meta.due, meta.sc);
  const paidLabel = formatDisplayAmount(meta.paid, meta.sc);
  const excessLabel = formatDisplayAmount(meta.overpaymentAmount, meta.sc);
  return [
    cp('confirmOverpayTitle'),
    `${cp('confirmOverpayDue')} ${dueLabel} · ${cp('confirmOverpayEntered')} ${paidLabel} · ${cp('confirmOverpayExcess')} ${excessLabel}.`,
    meta.splitCurrency && exchangeRate?.label
      ? cp('confirmOverpayCbu', { label: exchangeRate.label })
      : null,
    cp('confirmAdditionalProfitBook'),
    cp('confirmContinue'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Confirm before letting goods leave against a promise.
 *
 * Worth a stop of its own rather than folding into the generic shortfall path: this is the one
 * completion where the shop hands over stock and gets nothing for it now, and the amount and the
 * date are the two things nobody can correct afterwards without re-opening the sale.
 */
export function buildCreditConfirmMessage(meta, dueDate) {
  const sc = (meta?.sc || 'USD').toUpperCase();
  const amount = meta?.creditAmount ?? 0;
  // Fall through with whatever share was named; the discount, if any, is shown by the form.
  return [
    cp('confirmCreditTitle'),
    cp('confirmCreditAmount', { amount: formatAmountForCurrency(amount, sc) }),
    cp('confirmCreditDate', { date: String(dueDate || '').slice(0, 10) }),
    cp('confirmCreditEffect'),
    cp('confirmContinue'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The popup before stock leaves the shop for nothing.
 *
 * States the loss in terms of what the goods cost, not what they were priced at: the price was
 * never anyone's money, and naming it here would make the gift look four times more expensive
 * than it is. The cost is what actually left.
 */
export function buildGiveawayConfirmMessage(meta) {
  const sc = (meta?.sc || 'USD').toUpperCase();
  return [
    cp('confirmGiveawayTitle'),
    cp('confirmGiveawayAmount', {
      amount: formatAmountForCurrency(meta?.due ?? 0, sc),
    }),
    cp('confirmGiveawayEffect'),
    cp('confirmContinue'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const emptyPaymentFormState = () => ({
  saleId: null,
  uzs: '',
  usd: '',
  prepayment_amount: '',
  total_sale_amount: '',
  dispatch_payment_needed: false,
  dispatch_payment_amount: '',
  dispatch_payment_currency: 'UZS',
  balance_shortfall_type: '',
  balance_shortfall_amount: '',
  // Credit has its own flag rather than another value of `balance_shortfall_type`, because a
  // gap can be part forgiven and part owed at once and that field holds one answer. Blank
  // `credit_amount` means "whatever is left after the discount", which is the common case.
  apply_credit: false,
  apply_giveaway: false,
  credit_amount: '',
  // Required whenever credit is on: a debt with no date is one nobody is ever reminded about.
  credit_due_date: '',
  // Bank transfer ("perechisleniye"). A fourth named claim on the same gap, beside discount and
  // credit, and a deferral rather than a payment method: the money is not in the drawer, so it
  // never joins the soum split in `paymentMethods.js`.
  //
  // `transfer_amount` is **required** when the box is on, unlike `credit_amount`. An unnamed
  // credit means "whatever is left", which is the ordinary case for a debt; a transfer is never
  // the leftover — the cashier is looking at an organisation that has agreed a figure. Two
  // unnamed claims could not share one gap either.
  apply_transfer: false,
  transfer_amount: '',
  // The till's "Pul tushgan": the money is already in the bank. Its own permission, because it
  // is the one place money enters the books on a cashier's word.
  transfer_received: false,
  apply_currency_conversion_difference: false,
  apply_additional_profit: false,
  apply_change: false,
  change_uzs: '',
  change_usd: '',
  completion_notes: '',
});

/**
 * Build initial payment form from a sale (same rules as Sales handleStatusUpdate → completed).
 */
/** Step 2 prefill: same UZS/USD split recorded at delivery step 1 (not CBU-converted total). */
export function deliveryStep2PaymentFromStep1(sale) {
  if (!sale?.delivery_customer_paid_at || sale.delivery_shop_remittance_at) {
    return null;
  }
  const uzs = parseFloat(sale.delivery_customer_collected_uzs) || 0;
  const usd = parseFloat(sale.delivery_customer_collected_usd) || 0;
  if (uzs <= 0 && usd <= 0) {
    return null;
  }
  return {
    uzs: uzs > 0 ? String(Math.round(uzs) === uzs ? Math.round(uzs) : uzs) : '',
    usd: usd > 0 ? (Number.isInteger(usd) ? String(usd) : usd.toFixed(2)) : '',
  };
}

export function buildPaymentFormDataFromSale(sale, cbuRate) {
  if (!sale) return emptyPaymentFormState();

  const unitPrice = saleEffectiveUnitPrice(sale);
  const quantity = parseFloat(sale.quantity || 0);
  const totalAmount = !isNaN(unitPrice * quantity) ? unitPrice * quantity : 0;
  const advancePaymentRaw = parseFloat(sale.advance_payment_received || 0);
  const advanceInSc = advanceAmountInSaleCurrency(sale, cbuRate);
  const nowBeingPaid =
    advanceInSc == null ? null : Math.max(0, totalAmount - advanceInSc);

  const dispatch = sale.dispatch_info;
  const uzsV = dispatch ? parseFloat(dispatch.delivery_cost_uzs || 0) : 0;
  const usdV = dispatch ? parseFloat(dispatch.delivery_cost || 0) : 0;
  const hasDispatchCost = !!(dispatch && (uzsV > 0 || usdV > 0));
  const dispatchPaymentNeeded = !!(dispatch && !dispatch.is_paid && hasDispatchCost);
  const dispatchAmountForForm = hasDispatchCost
    ? uzsV > 0
      ? (dispatch.delivery_cost_uzs != null && dispatch.delivery_cost_uzs !== ''
          ? String(dispatch.delivery_cost_uzs)
          : '')
      : dispatch.delivery_cost != null && dispatch.delivery_cost !== ''
        ? String(dispatch.delivery_cost)
        : ''
    : '';

  const isFromOrder = !!(sale.order || advancePaymentRaw > 0 || sale.sale_type === 'from_order');
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const listUnit = parseFloat(sale.selling_price) || 0;
  const discountAmountPerUnit = saleDiscountAmountPerUnit(sale);
  const finalUnit = saleEffectiveUnitPrice(sale);
  const listTotal = listUnit * quantity;
  const discountTotal = discountAmountPerUnit * quantity;

  let uzs = '';
  let usd = '';
  if (isFromOrder) {
    if (nowBeingPaid != null && nowBeingPaid > 0) {
      if (sc === 'UZS') uzs = String(Math.round(nowBeingPaid));
      else usd = nowBeingPaid.toFixed(2);
    } else if (nowBeingPaid === 0) {
      if (sc === 'UZS') uzs = '0';
      else usd = '0';
    }
    // nowBeingPaid == null → wait for CBU; leave payment fields empty
  } else if (sc === 'UZS') {
    uzs = String(Math.round(totalAmount));
  } else {
    usd = totalAmount.toFixed(2);
  }

  return {
    saleId: sale.id,
    completion_notes: '',
    uzs,
    usd,
    prepayment_amount:
      isFromOrder && advancePaymentRaw > 0 ? String(advancePaymentRaw) : '',
    prepayment_currency: isFromOrder && advancePaymentRaw > 0 ? getAdvanceCurrency(sale) : '',
    total_sale_amount: isFromOrder && advancePaymentRaw > 0 ? totalAmount.toFixed(2) : '',
    list_unit_price: listUnit,
    discount_amount_per_unit: discountAmountPerUnit,
    final_unit_price: finalUnit,
    list_total_amount: listTotal,
    sale_discount_total: discountTotal,
    final_amount_due:
      nowBeingPaid != null ? (nowBeingPaid > 0 ? nowBeingPaid : totalAmount) : totalAmount,
    sale_currency: sc,
    dispatch_payment_needed: !!dispatchPaymentNeeded,
    dispatch_payment_amount: dispatchPaymentNeeded ? dispatchAmountForForm : '',
    dispatch_payment_currency: dispatchPaymentNeeded
      ? parseFloat(dispatch.delivery_cost_uzs || 0) > 0
        ? 'UZS'
        : 'USD'
      : 'UZS',
    balance_shortfall_type: '',
    balance_shortfall_amount: '',
    apply_currency_conversion_difference: false,
    apply_additional_profit: false,
    apply_change: false,
    change_uzs: '',
    change_usd: '',
  };
}

/**
 * Payment difference after optional manual discount.
 * remaining = paid - (due - discount); negative = underpayment still unexplained without FX.
 */
export function computePaymentDifferenceMeta(sale, paymentFormData, cbuRate) {
  const raw = computePaymentShortfallMeta(sale, paymentFormData, cbuRate);
  // Independent of the discount, and of the conversion difference. All three can explain parts
  // of one gap: some forgiven, some owed, some rate arithmetic. `balance_shortfall_type` is
  // still read so a form that has not been updated yet keeps working.
  const wantCredit =
    !!paymentFormData.apply_credit || paymentFormData.balance_shortfall_type === 'on_credit';
  const wantGiveaway = !!paymentFormData.apply_giveaway;
  const wantTransfer = !!paymentFormData.apply_transfer;
  // An empty payment box reads as "nothing typed yet" everywhere else, which is what keeps the
  // form from complaining about a shortfall the moment it opens. Credit, Bepul and a bank
  // transfer are the **three** completions where nothing typed is the whole answer — the
  // customer hands over no money at all — so once any of them is chosen the blank is read as the
  // zero it actually is.
  //
  // `wantTransfer` is the third, and leaving it out was a real bug rather than a tidiness point:
  // a sale settled wholly by transfer read as "nothing typed yet", so the form never classified
  // the gap and `transferAmount` came back undefined. The server has the identical guard in
  // `requests_transfer`, for the identical reason. Same rule, and this is the fifth layer of it.
  const emptyIsTheAnswer = wantCredit || wantGiveaway || wantTransfer;
  const base =
    emptyIsTheAnswer && !raw.mixed && raw.due != null && raw.paid == null
      ? { ...raw, paid: 0, paidGross: raw.paidGross ?? 0, short: raw.due, needs: raw.due > 0 }
      : raw;
  if (base.mixed || base.due == null || base.paid == null) {
    return {
      ...base,
      discountAmount: 0,
      remainingAfterDiscount: null,
      conversionDifference: null,
      // Nothing typed, and none of the boxes ticked — the branch above rewrites the blank for
      // the two options where "no money" *is* the answer, so reaching here with something owing
      // means the form has been told nothing at all about where that money went. Completing on
      // that records the sale as paid in full against an empty till, which is exactly how sale
      // #350 lost $279. Blank on a sale that owes nothing stays silent, and so does a rate still
      // loading (`mixed`) — neither is a missing answer.
      differenceNeedsClassification: !base.mixed && base.due != null && base.due > 0,
      requiredChange: null,
    };
  }
  const wantDiscount = paymentFormData.balance_shortfall_type === 'discount';
  let discountAmount = 0;
  if (wantDiscount) {
    const entered = parseFloat(paymentFormData.balance_shortfall_amount);
    discountAmount = Number.isFinite(entered) && entered > 0 ? entered : 0;
  }
  const tol = (base.sc || 'USD').toUpperCase() === 'UZS' ? 1 : PAYMENT_SHORTFALL_TOLERANCE;

  // What the customer did not hand over. Discount and credit each take a named share of it and
  // the conversion difference absorbs the rest — the rule the server applies, mirrored here so
  // the form and the server never reach different verdicts about the same payment.
  const gap = base.due - base.paid;
  // The transfer's named share, taken off the gap before credit's "whatever is left" is worked
  // out. Without that subtraction a combined sale would put the transfer amount on the debt as
  // well and the named claims would add up to more than the gap — the same ordering the server
  // applies, mirrored here so the form and the server never reach different verdicts.
  //
  // **The typed figure is always som; the gap may be in dollars.** The owner's rule of
  // 2026-11-11 -- perechisleniye is som, dollars are cash only -- so on a dollar-priced sale the
  // som has to be valued at the CBU rate before it can be set against the gap at all. Two
  // numbers come out of this and they must not be confused: `transferSom` is what the customer
  // will wire and what the whole-som rule applies to; `transferAmount` is the same money in the
  // sale's currency, which is the only thing the arithmetic below can use. On a som sale they
  // are the same number, which is why one variable sufficed until dollar sales were let in.
  // Read before the transfer is judged, because whether the surplus has been named decides
  // whether a transfer is allowed to sit beside one at all. See `transferWithNothingOwing`.
  const wantFx = !!paymentFormData.apply_currency_conversion_difference;
  const wantAdditionalProfit = !!paymentFormData.apply_additional_profit;
  const surplusNamed = wantFx || wantAdditionalProfit;
  const namedTransfer = parseFloat(paymentFormData.transfer_amount);
  const transferRate = Number(cbuRate);
  const transferRateUsable = Number.isFinite(transferRate) && transferRate > 0;
  const transferSc = (base.sc || 'USD').toUpperCase();
  let transferSom = 0;
  let transferAmount = 0;
  // The rate has not arrived yet, so the form cannot say whether the payment adds up. Its own
  // flag: "wait a moment" is a different thing to say than "these do not add up".
  let transferNeedsRate = false;
  // **Valued whether the sale is short or over.** It used to be computed only against a
  // shortfall, which left `transferAmount` at zero on a sale above the listed price -- and the
  // server, which subtracts the transfer from the expected amount either way, then reported a
  // different surplus to the one the form had shown. The form has to predict the server's
  // figure, so the two now take the transfer off at the same point.
  if (wantTransfer && Number.isFinite(namedTransfer) && namedTransfer > 0) {
    transferSom = namedTransfer;
    if (transferSc === 'UZS') {
      transferAmount = namedTransfer;
    } else if (transferRateUsable) {
      transferAmount = namedTransfer / transferRate;
    } else {
      transferNeedsRate = true;
    }
  }
  const namedCredit = parseFloat(paymentFormData.credit_amount);
  let creditAmount = 0;
  if (wantCredit && gap > tol) {
    creditAmount =
      Number.isFinite(namedCredit) && namedCredit > 0
        ? namedCredit
        : Math.max(0, gap - discountAmount - transferAmount);
  }
  // Naming shares that together exceed the gap invents money that was never owed. Guarded on
  // there *being* a gap: on a surplus `gap` is negative, and without the guard a payment with
  // no discount and no credit reads as 0 > −2.28 and every overpayment is rejected.
  // **Whether the wire is a claim on the gap at all depends on the whole payment.**
  //
  // While the payment falls short of the price, the wire is one of the things covering what the
  // customer did not hand over, and it belongs in this sum: discount forgives some, credit owes
  // some, the bank sends some, and together they cannot come to more than the gap.
  //
  // Once the payment *exceeds* the price it is not. The gap is measured against cash only, so a
  // payment over the price shrinks it below the wire by exactly the surplus -- and the check then
  // fired on every such sale however small the overpayment. The owner's case of 2026-11-13: a
  // $408 sale, 5 000 000 som (417.59 at 11 973.44) with 2 000 000 by bank. The wire is $167.04
  // and the gap only $157.45, short by the $9.59 the form was already showing as the conversion
  // difference. Ticking Konversiya farqi could not help, because this check never looked at it.
  //
  // So the wire leaves the sum once the payment covers the price. What bounds it then is
  // `transferExceedsPayment` below -- the customer cannot wire more than they are paying -- and
  // the surplus still has to be named before the sale will complete.
  const paymentVsDue =
    base.postedGross != null ? base.postedGross - base.due : -Infinity;
  const transferClaimsTheGap = paymentVsDue <= tol;
  const sharesExceedGap =
    gap > tol
    && discountAmount + creditAmount + (transferClaimsTheGap ? transferAmount : 0) > gap + tol;
  // The owner's rule of 2026-11-12: the wire may never exceed the total being settled. It is the
  // one bound on it that survives a surplus, and the only layer that can hold it -- the server is
  // told the cash and the wire separately, so "more than the total" is always false there.
  const transferExceedsPayment =
    transferAmount > 0
    && base.postedGross != null
    && transferAmount > base.postedGross + tol;
  // Ticked on a payment that leaves nothing owing — there is no debt to open.
  const creditWithNothingOwing = wantCredit && gap <= tol;
  // The same refusal for a transfer, **unless the extra has been named**. Inventing an expected
  // transfer against money already in the till is a receivable for nothing -- but a sale above
  // the listed price is not that. The owner's case of 2026-11-12: a product still carrying a
  // stale 1 000 000, sold for 1 720 000, with 700 000 and $60 in cash and 300 000 to come by
  // bank. The customer owes that 300 000 of the raised price, so the receivable is real; what
  // the listed price cannot explain is the surplus, and `additional_profit` is what records it.
  //
  // So the refusal now asks whether the operator has said where the extra goes. Without
  // Qo'shimcha foyda or Konversiya farqi the sale is still stopped -- by this, and then by the
  // surplus rule below -- so the extra can never be booked silently.
  const transferWithNothingOwing = wantTransfer && gap <= tol && !surplusNamed;
  // The box is on but empty. Its own flag rather than folding into `sharesExceedGap`, because the
  // thing to say is "type the amount", not "these add up to too much". Asked whatever the sale
  // comes to, now that a transfer may sit beside a surplus.
  const transferAmountMissing =
    wantTransfer && !(Number.isFinite(namedTransfer) && namedTransfer > 0);
  // Whole som, the owner's rule for the whole UZS ledger. Checked here as well as on the server
  // and in the input mask, because a rule fixed in one layer usually lives in three more.
  // Read off `transferSom`, never off the converted figure: $8.00 of som is 96,000 som and
  // perfectly whole, while the dollars it is worth are not and never could be.
  const transferNotWholeSom =
    transferSom > 0 && Math.abs(transferSom - Math.round(transferSom)) > 1e-9;

  const remainingAfterDiscount =
    base.paid - (base.due - discountAmount - creditAmount - transferAmount);
  const isOverpay = remainingAfterDiscount > tol;
  // A surplus can be both at once — part rate arithmetic, part money the shop kept. The
  // conversion difference names its share and additional profit takes the rest, so the split is
  // only complete once that amount is present and covers no more than the surplus itself.
  const splitSurplus = wantFx && wantAdditionalProfit && isOverpay;
  const namedFx = parseFloat(paymentFormData.currency_conversion_difference_amount);
  const splitFxValid =
    splitSurplus &&
    Number.isFinite(namedFx) &&
    namedFx > 0 &&
    namedFx <= remainingAfterDiscount + tol;
  // Additional profit alone only ever explains a genuine surplus.
  const apExplained = !wantFx && wantAdditionalProfit && isOverpay;
  const fxExplained = wantFx && !splitSurplus;
  // Credit explains part of a *shortfall* and only a shortfall: the customer walks out owing
  // what was not handed over. There is nothing to credit on a surplus.
  const creditExplained = creditAmount > 0 && !sharesExceedGap;
  // A transfer explains part of a shortfall and only a shortfall, exactly as credit does: the
  // customer takes the goods and the bank sends the money later.
  const transferExplained = transferAmount > 0 && !sharesExceedGap;
  // A gift explains the whole of what was not handed over — the server turns Bepul into a
  // discount for the entire price. Without this the form would go on demanding a second
  // explanation for a gap the Bepul box has already answered in full.
  const giveawayExplained = wantGiveaway && gap > tol;
  const creditDueDateMissing =
    creditExplained && !String(paymentFormData.credit_due_date || '').trim();
  // `remainingAfterDiscount` now nets off the credit too, so a gap fully covered by a discount
  // and a credit lands inside tolerance and needs nothing further — which is the point.
  const explained = fxExplained || apExplained || splitFxValid || giveawayExplained;
  const unexplained = explained ? 0 : remainingAfterDiscount;
  const differenceNeedsClassification =
    sharesExceedGap
    || transferExceedsPayment
    || creditWithNothingOwing
    || transferWithNothingOwing
    || transferAmountMissing
    || transferNotWholeSom
    || transferNeedsRate
    || Math.abs(unexplained) > tol;
  // Reachable only for overpayment with nothing selected yet (advance sales stay hard-blocked).
  const needsAdditionalProfitConfirm =
    !wantFx && !wantAdditionalProfit && isOverpay && !base.hasAdvance;

  return {
    ...base,
    discountAmount,
    remainingAfterDiscount,
    // What the customer is owed back, before any change is entered — the number the form
    // offers to fill the change boxes with. Reads off the *gross* payment on purpose, so it
    // does not shrink to zero the moment change is typed in.
    requiredChange:
      base.paidGross != null ? base.paidGross - (base.due - discountAmount) : null,
    conversionDifference: splitFxValid
      ? namedFx
      : fxExplained
        ? remainingAfterDiscount
        : null,
    additionalProfitAmount: splitFxValid
      ? remainingAfterDiscount - namedFx
      : apExplained
        ? remainingAfterDiscount
        : null,
    splitSurplus,
    wantCredit,
    creditExplained,
    creditAmount,
    creditDueDateMissing,
    wantGiveaway,
    giveawayExplained,
    sharesExceedGap,
    transferExceedsPayment,
    creditWithNothingOwing,
    wantTransfer,
    transferExplained,
    transferAmount,
    transferSom,
    transferNeedsRate,
    transferWithNothingOwing,
    transferAmountMissing,
    transferNotWholeSom,
    gap,
    differenceNeedsClassification,
    needsAdditionalProfitConfirm,
    // Surplus classified as FX or additional profit is not a generic overpayment confirm.
    hasOverpayment: (wantFx || apExplained) ? false : base.hasOverpayment,
    overpaymentAmount: (wantFx || apExplained) ? null : base.overpaymentAmount,
    exceedsRemainingDue: wantFx ? false : base.exceedsRemainingDue,
  };
}

/**
 * The transfer, valued in the sale's own currency.
 *
 * **The money boxes hold the sale's total; this is the slice of it that never reaches the shop.**
 * A transfer lands in the bank, not the drawer, so every figure that means "what was received"
 * has to take it off -- and all of them now do it through this one function, so they cannot
 * disagree about the same payment.
 *
 * Two numbers come back and they must not be confused. `som` is what the customer wires, which is
 * what the whole-som rule applies to and what the server is told. `inSc` is the same money in the
 * sale's currency, which is the only thing the payment arithmetic can use -- on a som sale they
 * are the same number, which is why one sufficed until dollar sales were let in.
 *
 * `needsRate` is a dollar-priced sale whose CBU rate has not arrived. The transfer then values at
 * nothing rather than at a guess, and the caller's `transferNeedsRate` says "wait a moment",
 * which is a different thing to say than "these do not add up". Nothing may be submitted in that
 * state, so the untaken subtraction never reaches the books.
 */
export function transferInSaleCurrency(paymentFormData, saleCurrency, rate) {
  const none = { som: 0, inSc: 0, needsRate: false };
  if (!paymentFormData?.apply_transfer) return none;
  const som = parseFloat(paymentFormData.transfer_amount);
  if (!Number.isFinite(som) || som <= 0) return none;
  if ((saleCurrency || 'USD').toUpperCase() === 'UZS') {
    return { som, inSc: som, needsRate: false };
  }
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return { som, inSc: 0, needsRate: true };
  return { som, inSc: som / r, needsRate: false };
}

/**
 * Shortfall: underpayment may be completed as discount only after the user selects it (no on credit).
 */
export function computePaymentShortfallMeta(sale, paymentFormData, cbuRate) {
  if (!sale) {
    return {
      needs: false,
      mixed: false,
      splitCurrency: false,
      crossCurrency: false,
      short: 0,
      due: null,
      paid: null,
      sc: 'USD',
      hasOverpayment: false,
      overpaymentAmount: null,
    };
  }
  const due = computeAdvanceRemainingDue(sale, null, cbuRate);
  const uzsT = parseFloat(paymentFormData.uzs) || 0;
  const usdT = parseFloat(paymentFormData.usd) || 0;
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const hasAdvance = saleHasOrderAdvance(sale);
  const splitCurrency = uzsT > 0 && usdT > 0;
  const needsCbu = paymentNeedsCbuConversion(uzsT, usdT, sc);
  const crossCurrency = needsCbu && !splitCurrency;
  const advNeedsCbu = hasAdvance && getAdvanceCurrency(sale) !== sc;

  if ((needsCbu && !cbuRate && (uzsT > 0 || usdT > 0)) || (advNeedsCbu && due == null)) {
    return {
      needs: false,
      mixed: true,
      splitCurrency,
      crossCurrency,
      short: due,
      sc,
      due,
      paid: null,
      hasOverpayment: false,
      overpaymentAmount: null,
      hasAdvance,
      exceedsRemainingDue: false,
    };
  }

  // **The som box is the sale's total, not the cash in the drawer.** The transfer is the part of
  // that total the shop never receives, so it comes off here -- once, where the payment is
  // valued -- rather than by lowering the box the cashier is reading. That is what keeps the
  // figure on screen at what the sale is for while only the split underneath moves. It used to
  // be done by rewriting the som box, and a cashier entering a transfer watched the amount due
  // appear to change.
  const transferPart = transferInSaleCurrency(paymentFormData, sc, cbuRate);
  const postedGross = paymentAmountInSaleCurrency(paymentFormData.uzs, paymentFormData.usd, sc, cbuRate);
  // Never below zero: a transfer larger than the sale is a mistake for the server to name, not
  // one to express as a negative payment.
  const paidGross = postedGross == null
    ? postedGross
    : Math.max(0, postedGross - transferPart.inSc);
  // Change comes off before anything else looks at the payment, so shortfall, overpayment and
  // the classification options all reason about money the shop actually kept.
  const wantChange = !!paymentFormData.apply_change;
  const changeInSc = wantChange
    ? changeAmountInSaleCurrency(paymentFormData.change_uzs, paymentFormData.change_usd, sc, cbuRate)
    : 0;
  const changePending = wantChange && changeInSc == null;
  const paid = paidGross == null || changePending ? paidGross : paidGross - changeInSc;
  const short = paid != null ? due - paid : due;
  const payingOtherCurrency =
    hasAdvance &&
    ((sc === 'USD' && uzsT > 0 && usdT === 0) || (sc === 'UZS' && usdT > 0 && uzsT === 0));
  const exceedsRemainingDue =
    hasAdvance && paid != null && paid > due + PAYMENT_SHORTFALL_TOLERANCE;
  const overpaymentAmount =
    !hasAdvance && paid != null && paid > due + PAYMENT_SHORTFALL_TOLERANCE ? paid - due : null;
  const hasOverpayment =
    !hasAdvance && !!overpaymentAmount && overpaymentAmount > PAYMENT_SHORTFALL_TOLERANCE;
  const needs =
    paid != null && !payingOtherCurrency && (
      paymentHasShortfall(due, paid, sc)
      || (!!overpaymentAmount && overpaymentAmount > PAYMENT_SHORTFALL_TOLERANCE)
    );

  return {
    needs,
    mixed: false,
    splitCurrency,
    crossCurrency,
    short,
    sc,
    due,
    paid,
    hasOverpayment,
    overpaymentAmount,
    hasAdvance,
    exceedsRemainingDue,
    paidGross,
    // The payment *before* the transfer came off it -- the whole sum the customer is settling
    // with, bank's share included. `paidGross` is net of the transfer, so it cannot answer
    // "is the wire bigger than the payment?" or "does the payment cover the price?".
    postedGross,
    changeInSc,
    changePending,
    wantChange,
  };
}

/**
 * Reserved sale: total_amount − deposit; supports combined UZS+USD at CBU rate.
 *
 * `form` (optional) is the sell-reserved form state, read for its change and discount fields.
 * As on the Complete & Pay side, change is netted off before anything reads the payment, so
 * the discount prompt and the surplus confirm only ever see what the shop kept.
 */
export function computeReservedPaymentMeta(sale, uzsStr, usdStr, cbuRate, form = null) {
  if (!sale) {
    return {
      needsDiscountChoice: false,
      needsRate: false,
      splitCurrency: false,
      crossCurrency: false,
    };
  }
  const deposit = sale.deposit_received ? parseFloat(sale.deposit_amount || 0) : 0;
  const due = parseFloat(sale.total_amount || 0) - deposit;
  const sc = (sale.sale_currency || 'USD').toUpperCase();
  const uzsT = parseFloat(uzsStr) || 0;
  const usdT = parseFloat(usdStr) || 0;
  const splitCurrency = uzsT > 0 && usdT > 0;
  const crossCurrency =
    !splitCurrency &&
    ((sc === 'USD' && uzsT > 0 && usdT === 0) || (sc === 'UZS' && usdT > 0 && uzsT === 0));

  if (uzsT === 0 && usdT === 0) {
    return { needsDiscountChoice: false, needsRate: false, splitCurrency, crossCurrency, due, sc };
  }

  if ((splitCurrency || crossCurrency) && !cbuRate) {
    return {
      needsDiscountChoice: false,
      needsRate: true,
      splitCurrency,
      crossCurrency,
      due,
      sc,
      uzsT,
      usdT,
    };
  }

  const paidGross = paymentAmountInSaleCurrency(uzsStr, usdStr, sc, cbuRate);
  const wantChange = !!form?.apply_change;
  const changeInSc = wantChange
    ? changeAmountInSaleCurrency(form.change_uzs, form.change_usd, sc, cbuRate)
    : 0;
  const changePending = wantChange && changeInSc == null;
  const paid = paidGross == null || changePending ? paidGross : paidGross - changeInSc;
  const short = paid != null ? due - paid : due;
  const needsDiscountChoice = paymentHasShortfall(due, paid, sc);
  const discountAmount =
    form?.balance_shortfall_type === 'discount'
      ? Math.max(0, parseFloat(form.balance_shortfall_amount) || 0)
      : 0;
  // A reserved item is bought like anything else once the customer comes for it, so its
  // remainder can be shared out the same way. The deposit is already off `due`, which means
  // the gap measured here is what is genuinely left to explain.
  const gapR = due != null && paid != null ? due - paid : 0;
  const tolR = sc === 'UZS' ? 1 : PAYMENT_SHORTFALL_TOLERANCE;
  const wantCreditR = !!form?.apply_credit;
  const namedCreditR = parseFloat(form?.credit_amount);
  let creditAmountR = 0;
  if (wantCreditR && gapR > tolR) {
    creditAmountR =
      Number.isFinite(namedCreditR) && namedCreditR > 0
        ? namedCreditR
        : Math.max(0, gapR - discountAmount);
  }
  const sharesExceedGapR = gapR > tolR && discountAmount + creditAmountR > gapR + tolR;
  return {
    needsDiscountChoice: needsDiscountChoice && creditAmountR + discountAmount + tolR < gapR,
    creditAmount: creditAmountR,
    creditDueDateMissing:
      creditAmountR > 0 && !String(form?.credit_due_date || '').trim(),
    creditWithNothingOwing: wantCreditR && gapR <= tolR,
    sharesExceedGap: sharesExceedGapR,
    gap: gapR,
    needsRate: false,
    splitCurrency,
    crossCurrency,
    due,
    paid,
    paidGross,
    changeInSc,
    changePending,
    requiredChange: paidGross != null ? paidGross - (due - discountAmount) : null,
    short,
    sc,
    uzsT,
    usdT,
  };
}

export function buildCompleteSaleRequest(paymentFormData, meta, exchangeRate) {
  // **What the shop actually received, which is not what the boxes say.** The boxes hold the
  // sale's total; the transfer is the slice of it that lands in the bank, so it comes off here.
  //
  // This is the one place the subtraction happens on the way out, and that is deliberate: a
  // single sale and every line of a group both pass through this function, so neither can record
  // money the drawer never saw, and the two cannot drift apart. The group splitter above
  // apportions the total and the transfer by the same weights, so each line arrives here with a
  // matching pair.
  //
  // **The som box carries it first, because a transfer is som.** Same currency, so no rate and
  // no rounding are involved in the common case; only what the som box cannot cover converts and
  // comes off the dollars. That one ordering handles both sale currencies, so neither the sale's
  // price nor which box the cashier happened to use can change what is recorded.
  //
  // Taking it off a box chosen by the *sale's* currency is what this replaced, and it was wrong
  // in both directions whenever a sale was settled in both currencies at once. A dollar sale paid
  // $5 in notes, 84 000 som in notes and 96 000 som wired put the wired som on the som box -- the
  // natural place, the transfer being som -- and the $8 subtraction was clamped at the $5 the
  // dollar box held, so the sale recorded $23 against a $20 price. A som sale whose transfer ran
  // past the som box lost the remainder the same way. Neither was caught by the form, because the
  // check adds the two boxes together before subtracting and so saw a payment that balanced.
  const scForTransfer = (meta?.sc || paymentFormData.sale_currency || 'USD').toUpperCase();
  const transferPart = transferInSaleCurrency(
    paymentFormData, scForTransfer, exchangeRate?.rate,
  );
  const uzsTyped = parseFloat(paymentFormData.uzs) || 0;
  const usdTyped = parseFloat(paymentFormData.usd) || 0;
  const transferRate = Number(exchangeRate?.rate);
  const transferRateUsable = Number.isFinite(transferRate) && transferRate > 0;
  // Whole som, and never more than the box holds: what is left over is `somSpill`.
  const somOff = Math.min(transferPart.som, uzsTyped);
  const somSpill = transferPart.som - somOff;
  // The spill needs a rate to cross the currency line. Without one nothing comes off the dollars
  // rather than a guess coming off them -- `transferNeedsRate` blocks the form in that state, so
  // the untaken subtraction cannot reach the books.
  const spillInUsd = somSpill > 0 && transferRateUsable ? somSpill / transferRate : 0;
  const requestData = {
    status: 'completed',
    notes: String(paymentFormData.completion_notes || '').trim(),
    // Whole som on the som side, cents on the dollar side -- the smallest thing anybody can
    // hand over in each. Never negative, for the reason given in `transferInSaleCurrency`.
    uzs: Math.max(0, Math.round(uzsTyped - somOff)),
    usd: Math.max(0, Math.round((usdTyped - spillInUsd) * 100) / 100),
  };
  if (paymentFormData.balance_shortfall_type === 'discount') {
    requestData.balance_shortfall_type = 'discount';
    const disc = parseFloat(paymentFormData.balance_shortfall_amount);
    if (Number.isFinite(disc) && disc > 0) {
      requestData.balance_shortfall_amount = disc;
    }
  }
  // A gift names nothing else: the server writes off the whole amount due and refuses the flag
  // outright if any money came with it, so there is no amount for the form to compute here.
  if (paymentFormData.apply_giveaway) {
    requestData.apply_giveaway = true;
  }
  if (paymentFormData.apply_credit) {
    requestData.apply_credit = true;
    requestData.credit_due_date = String(paymentFormData.credit_due_date || '').trim();
    // Sent only when the user actually named a share. Left off, the server credits the whole
    // remainder after the discount and computes that figure from the due and payment it already
    // holds — which is the number the balance sheet later removes on the other side, so a
    // second opinion from here could only disagree with it.
    const credit = parseFloat(paymentFormData.credit_amount);
    if (Number.isFinite(credit) && credit > 0) {
      requestData.credit_amount = credit;
    }
  }
  // Bank transfer. `transfer_amount` is always sent when the box is on — the server requires a
  // named figure, for the reason given in `emptyPaymentFormState`.
  if (paymentFormData.apply_transfer) {
    const transfer = parseFloat(paymentFormData.transfer_amount);
    if (Number.isFinite(transfer) && transfer > 0) {
      requestData.transfer_amount = transfer;
      // "Pul tushgan". Sent only alongside an amount, so a stale flag on its own can never reach
      // the server and be refused for a half-filled form.
      if (paymentFormData.transfer_received) {
        requestData.transfer_received = true;
      }
    }
  }
  if (paymentFormData.apply_currency_conversion_difference) {
    requestData.apply_currency_conversion_difference = true;
    // Only meaningful alongside additional profit, where it says how the surplus divides.
    const fxAmt = parseFloat(paymentFormData.currency_conversion_difference_amount);
    if (paymentFormData.apply_additional_profit && Number.isFinite(fxAmt) && fxAmt > 0) {
      requestData.currency_conversion_difference_amount = fxAmt;
    }
  }
  if (paymentFormData.apply_additional_profit) {
    requestData.apply_additional_profit = true;
  }
  const changeUzs = paymentFormData.apply_change ? parseFloat(paymentFormData.change_uzs) || 0 : 0;
  const changeUsd = paymentFormData.apply_change ? parseFloat(paymentFormData.change_usd) || 0 : 0;
  if (changeUzs > 0) requestData.change_uzs = changeUzs;
  if (changeUsd > 0) requestData.change_usd = changeUsd;
  const uzsT = requestData.uzs;
  const usdT = requestData.usd;
  // A transfer on a dollar-priced sale is a som figure the server has to convert, so the rate
  // the form showed travels with it. Without this the server falls back to the latest CBU row,
  // which is *usually* the same number and silently is not on the day the rate changes -- and
  // the sale would then be classified against a rate the cashier never saw.
  // A dollar-priced sale always needs it; a som-priced one needs it too once the transfer runs
  // past the som box *and* there are dollars for the remainder to come off, because the server
  // then has to value that crossing at the same rate the cashier was shown.
  //
  // `usdTyped > 0` is what keeps it off the commonest case of all: a sale settled wholly by
  // transfer types nothing anywhere, so the whole figure reads as spill while no money actually
  // crosses the currency line and no rate is involved in anything.
  const transferNeedsCbu =
    !!paymentFormData.apply_transfer
    && ((paymentFormData.sale_currency || '').toUpperCase() !== 'UZS'
      || (somSpill > 0 && usdTyped > 0));
  const needsCbu =
    exchangeRate?.rate &&
    (transferNeedsCbu ||
      (uzsT > 0 && usdT > 0) ||
      meta?.splitCurrency ||
      (meta?.crossCurrency && (uzsT > 0 || usdT > 0)) ||
      // Change crossing the currency line has to be valued at the same rate the server uses.
      changeUzs > 0 ||
      changeUsd > 0);
  if (needsCbu) {
    requestData.exchange_rate = exchangeRate.rate;
  }
  if (paymentFormData.dispatch_payment_needed) {
    const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
    requestData.dispatch_payment_amount = dAmt;
    requestData.dispatch_payment_currency = paymentFormData.dispatch_payment_currency || 'UZS';
  }
  return requestData;
}

/** Split one group payment across line items (remainder on last sale to avoid rounding drift). */
export function buildGroupCompleteRequests(groupSales, paymentFormData, meta, exchangeRate) {
  if (!groupSales?.length) return [];
  const cbuRate = exchangeRate?.rate ?? null;
  const dues = groupSales.map((sale) => computeAdvanceRemainingDue(sale, null, cbuRate) || 0);
  const totalDue = dues.reduce((sum, d) => sum + d, 0);
  const uzsIn = parseFloat(paymentFormData.uzs) || 0;
  const usdIn = parseFloat(paymentFormData.usd) || 0;
  let uzsLeft = uzsIn;
  let usdLeft = usdIn;

  // Change is split by the *same* weights as the payment, not dropped whole onto the last
  // line. The payment shares carry the group's surplus in proportion to each line's due, so
  // the matching share of the change is what cancels it; putting it all on one line would
  // leave that line paying far under its own due and the rest far over.
  const wantChange = !!paymentFormData.apply_change;
  const changeUzsIn = wantChange ? parseFloat(paymentFormData.change_uzs) || 0 : 0;
  const changeUsdIn = wantChange ? parseFloat(paymentFormData.change_usd) || 0 : 0;
  let changeUzsLeft = changeUzsIn;
  let changeUsdLeft = changeUsdIn;

  const applyGroupDiscount = paymentFormData.balance_shortfall_type === 'discount';
  // The named discount splits by the same weights as the payment, and for the same reason the
  // change does.
  //
  // **This is what was broken.** The group's whole figure used to ride down to every line while
  // the payment was apportioned, so each line was asked to forgive the group's total out of its
  // own slice of the gap. Two items at 250 000 and 245 000, 400 000 collected and 95 000
  // forgiven: the 245 000 line received 197 980 and was then told to write off 95 000 of a
  // 47 020 remainder, and the server refused with "Discount 95000 UZS exceeds the unpaid
  // remainder 47020 UZS". It refused *every* such group, because a whole discount is larger than
  // any one line's share of itself by definition — so the only group discount that ever worked
  // was a single-line one.
  //
  // Had the server been more permissive it would have been worse than an error: each line would
  // have recorded the full 95 000 and the shop would have written off 190 000 for a 95 000
  // discount, silently.
  //
  // The same applies to the named FX amount below, which the server bounds against each line's
  // surplus in exactly the same way.
  const sc = String(groupSales[0]?.sale_currency || 'USD').toUpperCase();
  // Soum has no decimals; dollars have two. Matching the payment split directly above, so a
  // line's discount and its share of the money are rounded to the same grid and cannot end up
  // a hundredth apart.
  const roundShare = (value) => (sc === 'UZS' ? Math.round(value) : Math.round(value * 100) / 100);

  const discountIn = applyGroupDiscount
    ? parseFloat(paymentFormData.balance_shortfall_amount) || 0
    : 0;
  let discountLeft = discountIn;

  const wantFx = !!paymentFormData.apply_currency_conversion_difference;
  const fxIn = wantFx && paymentFormData.apply_additional_profit
    ? parseFloat(paymentFormData.currency_conversion_difference_amount) || 0
    : 0;
  let fxLeft = fxIn;

  // The bank transfer, apportioned by the same weights and for the same reason the discount is.
  //
  // `...paymentFormData` carries every field down to every line, so an un-apportioned
  // `transfer_amount` would be recorded **once per line**: two items settled by a 500 000 som
  // transfer would open 1 000 000 of receivable, and with "Pul tushgan" would book 1 000 000
  // into the bank bucket against the 500 000 the bank actually holds. Unlike the discount, the
  // server would not refuse it — a transfer is a named figure, not a write-off bounded by a
  // remainder — so this is the quiet kind of wrong rather than the loud kind.
  //
  // Transfers are som-only, so `roundShare` gives whole som and the last share is taken by
  // subtraction: the lines add back to the typed figure to the som, with no dust to explain.
  const applyGroupTransfer = !!paymentFormData.apply_transfer;
  const transferIn = applyGroupTransfer ? parseFloat(paymentFormData.transfer_amount) || 0 : 0;
  let transferLeft = transferIn;
  // Credit rides down to every line, and every line opens its own debt. That is deliberate:
  // profit on a credit sale is recognized against that line's own cost, so a group cannot share
  // one debt row without the payment split quietly deciding how much profit each line reports.
  // The lines carry the same `sale_group`, which is what lets the UI show and settle them as one.
  const applyGroupCredit = !!paymentFormData.apply_credit;

  return groupSales.map((sale, idx) => {
    const isLast = idx === groupSales.length - 1;
    const weight = totalDue > 0 ? dues[idx] / totalDue : 1 / groupSales.length;
    const uzsShare = isLast ? uzsLeft : Math.round(uzsIn * weight);
    const usdShare = isLast ? usdLeft : Math.round(usdIn * weight * 100) / 100;
    uzsLeft -= uzsShare;
    usdLeft -= usdShare;

    const changeUzsShare = isLast ? changeUzsLeft : Math.round(changeUzsIn * weight);
    const changeUsdShare = isLast ? changeUsdLeft : Math.round(changeUsdIn * weight * 100) / 100;
    changeUzsLeft -= changeUzsShare;
    changeUsdLeft -= changeUsdShare;

    // Last line takes the remainder, as every other split here does: the shares then add back to
    // the figure the cashier typed exactly, with no rounding dust left over to explain.
    const discountShare = isLast ? discountLeft : roundShare(discountIn * weight);
    discountLeft -= discountShare;
    const fxShare = isLast ? fxLeft : roundShare(fxIn * weight);
    fxLeft -= fxShare;
    // **Whole som, never `roundShare`.** That helper rounds to the sale's currency, which on a
    // dollar-priced group is cents -- and a transfer is som whatever the goods were priced in,
    // so a share of 83.33 would be a figure no bank can send and the server refuses outright.
    const transferShare = isLast ? transferLeft : Math.round(transferIn * weight);
    transferLeft -= transferShare;

    const childForm = {
      ...paymentFormData,
      uzs: uzsShare > 0 ? String(uzsShare) : '',
      usd: usdShare > 0 ? String(usdShare) : '',
      // A line whose share rounds away has no discount to record, and the server refuses a
      // discount of nothing ("Enter the discount amount when Discount is selected"). Its
      // remainder has rounded away with it — the two are the same weighting — so there is
      // nothing left unexplained either.
      balance_shortfall_type: applyGroupDiscount && discountShare > 0 ? 'discount' : '',
      balance_shortfall_amount: discountShare > 0 ? String(discountShare) : '',
      apply_currency_conversion_difference: wantFx,
      currency_conversion_difference_amount: fxShare > 0 ? String(fxShare) : '',
      apply_credit: applyGroupCredit,
      // The named share is deliberately dropped per line: each line's debt is whatever is left
      // of its own due after its own slice of the payment, which the server already computes.
      // Sending the group's figure to every line would credit it once per line.
      credit_amount: '',
      // A line whose share rounds away is given no transfer at all: the server wants a named
      // positive figure and refuses a zero. Nothing is left unexplained by that — the line's
      // slice of the money is weighted the same way, so a transfer share that rounds to nothing
      // belongs to a line whose due the cash share already covers.
      apply_transfer: applyGroupTransfer && transferShare > 0,
      transfer_amount: transferShare > 0 ? String(transferShare) : '',
      apply_change: wantChange && (changeUzsShare > 0 || changeUsdShare > 0),
      change_uzs: changeUzsShare > 0 ? String(changeUzsShare) : '',
      change_usd: changeUsdShare > 0 ? String(changeUsdShare) : '',
    };
    const childMeta = isLast ? meta : { ...meta, needs: false, hasOverpayment: false, overpaymentAmount: null };
    return {
      id: sale.id,
      data: buildCompleteSaleRequest(childForm, childMeta, exchangeRate),
    };
  });
}

/**
 * Divide one handful of money across a group's delivery lines, by what each line still owes.
 *
 * The courier is handed a single sum for the whole basket and has one box per item to put it in,
 * so the natural thing is to split it evenly. That is almost always wrong: three items owing
 * $35.60, $5.60 and $35.60 take a third each, and the small one reads as hugely overpaid while
 * the other two read short. The server then judges each line on its own — writing off the two
 * shortfalls and rewriting the small line's price upward — and the basket that was $1.48 short
 * ends up with three separate faults that happen to cancel. Group #10 on 13 August is exactly
 * this, and it moved a $55.00 sale to $74.51.
 *
 * Weighting by due is the same rule `buildGroupCompleteRequests` uses at the counter; this is
 * that rule at the courier's door. Shares are rounded to whole som / cents and the last line
 * takes the remainder, so the shares always add back to what was actually handed over.
 *
 * Returns null when any line's due cannot be read yet (the CBU rate has not arrived), so the
 * caller leaves the boxes alone rather than filling them with a guess.
 */
export function splitDeliveryCollectionByDue(lines, totals, cbuRate) {
  const active = (lines || []).filter(Boolean);
  if (!active.length) return [];

  const dues = [];
  for (const line of active) {
    const due = computeAdvanceRemainingDue(line, null, cbuRate);
    if (due == null) return null;
    dues.push(due);
  }
  const totalDue = dues.reduce((sum, d) => sum + d, 0);

  const uzsIn = parseFloat(totals?.uzs) || 0;
  const usdIn = parseFloat(totals?.usd) || 0;
  let uzsLeft = uzsIn;
  let usdLeft = usdIn;

  return active.map((line, idx) => {
    const isLast = idx === active.length - 1;
    // Nothing owed anywhere (a fully pre-paid basket) has no weights to speak of, so fall back
    // to equal shares rather than dividing by zero.
    const weight = totalDue > 0 ? dues[idx] / totalDue : 1 / active.length;
    // The last line takes the remainder so the shares add back exactly. Rounding that remainder
    // too is not a second rounding — it is already a whole som or a whole cent, just carrying
    // the binary dust of the subtractions, and $34.919999999999995 has no business in a
    // payment field.
    const uzsShare = isLast ? Math.round(uzsLeft) : Math.round(uzsIn * weight);
    const usdShare = isLast
      ? Math.round(usdLeft * 100) / 100
      : Math.round(usdIn * weight * 100) / 100;
    uzsLeft -= uzsShare;
    usdLeft -= usdShare;
    return {
      id: line.id,
      uzs: uzsShare > 0 ? String(uzsShare) : '',
      usd: usdShare > 0 ? String(usdShare) : '',
    };
  });
}

/** Delivery after dispatch: 3-step settlement instead of single Complete & Pay (shop or from-order). */
export function shopDeliverySettlementRequired(sale) {
  if (!sale || sale.status !== 'dispatched') return false;
  if (sale.sale_type !== 'delivery') return false;
  return !!sale.dispatch_info;
}

/** 1–3 which settlement step applies; 0 if every timestamp exists (usually sale is completed). Null if not eligible. */
export function shopDeliverySettlementActiveStep(sale) {
  if (!shopDeliverySettlementRequired(sale)) return null;
  if (!sale.delivery_customer_paid_at) return 1;
  if (!sale.delivery_shop_remittance_at) return 2;
  if (!sale.delivery_dispatcher_fee_completed_at) return 3;
  return 0;
}

/** Primary label for the third settlement action (dispatch fee vs no fee). */
export function shopDeliverySettlementStep3Label(sale) {
  const d = sale?.dispatch_info || null;
  const uzFee = d ? parseFloat(d.delivery_cost_uzs ?? 0) || 0 : 0;
  const usFee = d ? parseFloat(d.delivery_cost ?? 0) || 0 : 0;
  const needsDispatchFeePayment = !!(d && !d.is_paid && (uzFee > 0 || usFee > 0));
  return needsDispatchFeePayment
    ? i18n.t('deliverySettlement.btnStep3Pay', { ns: 'sales' })
    : i18n.t('deliverySettlement.btnStep3Complete', { ns: 'sales' });
}

/** True while a customer-declined item hasn't yet been confirmed physically back at the shop. */
export function lineIsDeclinedPending(sale) {
  return !!(sale?.delivery_customer_declined_at && !sale?.delivery_return_confirmed_at);
}

/** True when this line is still an active part of the delivery settlement flow (not declined). */
export function lineNeedsSettlement(sale) {
  return shopDeliverySettlementRequired(sale) && !sale?.delivery_customer_declined_at;
}

function _groupLines(saleOrGroup) {
  const lines = saleOrGroup?.groupSales?.length ? saleOrGroup.groupSales : [saleOrGroup];
  return lines.filter(Boolean);
}

/** Lowest active step (1/2/3) across a group's still-active lines; 0 if none need settlement. */
export function groupSettlementActiveStep(lines) {
  const steps = (lines || [])
    .filter((l) => lineNeedsSettlement(l))
    .map((l) => shopDeliverySettlementActiveStep(l))
    .filter((s) => s != null && s !== 0);
  if (!steps.length) return 0;
  return Math.min(...steps);
}

/** True if any line in the group was declined at step 1 but not yet confirmed physically returned. */
export function groupHasPendingDeclinedReturns(lines) {
  return (lines || []).some((l) => lineIsDeclinedPending(l));
}

/** Group-aware replacement for shopDeliverySettlementRequired — true if any line still needs
 * settlement, or any line has a pending declined-return confirmation still outstanding. */
export function shopDeliverySettlementRequiredForGroup(saleOrGroup) {
  const lines = _groupLines(saleOrGroup);
  return lines.some((l) => lineNeedsSettlement(l)) || groupHasPendingDeclinedReturns(lines);
}

/**
 * What ticking (or clearing) the Bepul box does to the rest of the form.
 *
 * A gift is not a partly-paid sale. The whole price is written off, so Chegirma ("how much of
 * the gap is forgiven"), Konversiya farqi ("how much of the gap is exchange-rate noise") and
 * Nasiya ("how much of it is still owed") have nothing left to name — there is no gap, there is
 * no sale price being collected at all.
 *
 * Leaving those flags set while their boxes are hidden is the failure this exists to stop: the
 * operator ticks Bepul, the discount fields disappear, and a discount they can no longer see is
 * still submitted with the sale. Hiding a control does not clear it — this does, in the same
 * update, so the form can never hold a value the screen is not showing.
 *
 * Clearing Bepul deliberately restores nothing. The operator is back to an ordinary unpaid sale
 * and says again what they mean; silently reinstating a discount they abandoned would be the
 * same bug pointing the other way.
 */
export function applyGiveawayToggle(form, checked) {
  const next = { ...form, apply_giveaway: checked };
  if (!checked) return next;
  return {
    ...next,
    apply_credit: false,
    credit_amount: '',
    credit_due_date: '',
    balance_shortfall_type: '',
    balance_shortfall_amount: '',
    apply_currency_conversion_difference: false,
  };
}

/**
 * Whether the shortfall block — Chegirma and Konversiya farqi — should be on screen.
 *
 * Both answer "where did the missing money go?", which is only a question when money was typed
 * and fell short. Under Bepul nothing was typed and nothing is missing, so the block is not
 * merely irrelevant, it is a way to describe a gift as a discount.
 */
export function shortfallOptionsVisible(shortfallMeta, form) {
  return Boolean(shortfallMeta?.needs) && !form?.apply_giveaway;
}

