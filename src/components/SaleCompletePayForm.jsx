import React, { useCallback, useEffect, useState } from 'react';
import BusyForm, { SubmitButton } from './BusyForm';
import Modal from './Modal';
import usePermissions from '../hooks/usePermissions';
import AmountInput from './AmountInput';
import ClickChargeModal from './ClickChargeModal';
import './GatewayUI.css';
import gatewayApi from '../utils/gatewayPayApi';
import {
  cashShare,
  formatGrouped,
  LIVE_METHODS,
  methodsSettled,
  overAllocated,
  parseGrouped,
  ROW_METHODS,
  toAmount as methodAmount,
} from '../utils/paymentMethods';
import {
  completionBlock,
  failureText,
  isPending,
  totalUsable,
  withGatewayRefs,
  withGatewayRefsOnEveryLine,
} from '../utils/gatewayPayHelpers';
import SaleChangeFields from './SaleChangeFields';
import api from '../utils/api';
import { formatDisplayAmount } from '../utils/currencyFormat';
import useAppTranslation from '../hooks/useAppTranslation';
import {
  emptyPaymentFormState,
  buildPaymentFormDataFromSale,
  computePaymentDifferenceMeta,
  buildCompleteSaleRequest,
  buildGroupCompleteRequests,
  validateAdvanceCompletionPayment,
  buildCrossCurrencyAdvanceConfirmMessage,
  buildSplitCurrencyConfirmMessage,
  buildAdditionalProfitConfirmMessage,
  buildCreditConfirmMessage,
  buildGiveawayConfirmMessage,
  saleHasOrderAdvance,
  saleAcceptsChange,
  applyGiveawayToggle,
  shortfallOptionsVisible,
} from '../utils/saleCompletePayHelpers';

/**
 * Complete sale & pay (status → completed). Shared by Sales and Dispatchers tabs.
 */
export default function SaleCompletePayForm({ sale, onClose, onSuccess, showNotification }) {
  const { t } = useAppTranslation(['sales', 'common']);
  const { hasPermission } = usePermissions();
  const canGiveaway = hasPermission('sales.giveaway');
  // Masked for everybody when the shop has Nasiya savdo switched off, so the same check answers
  // both "may this person lend?" and "does this shop lend at all?". See `feature_flags` on the server.
  const canMarkCredit = hasPermission('sales.mark_credit');
  const groupSales = sale?.groupSales?.length ? sale.groupSales : null;
  const [paymentFormData, setPaymentFormData] = useState(() => emptyPaymentFormState());
  const [exchangeRate, setExchangeRate] = useState(null);
  const [exchangeRateError, setExchangeRateError] = useState(null);

  // Gateway charges already taken for this sale. Loaded on open, which is the resume-after-a-crash
  // path: the till creates its sale rows before this window opens, so a crash kills the browser and
  // not the sale. Reopening it has to show what has already been paid, or the cashier charges the
  // customer a second time for money sitting right there.
  const [gatewayPayments, setGatewayPayments] = useState([]);
  const [clickOpen, setClickOpen] = useState(false);
  // Which provider the scan window is charging. The gesture is the same for both, so one
  // window serves both rather than a second copy that drifts.
  const [scanProvider, setScanProvider] = useState('click');
  const [clickBusy, setClickBusy] = useState(false);
  const [clickError, setClickError] = useState('');
  const [lastClickPayment, setLastClickPayment] = useState(null);
  // What the cashier intends to put on each method. Cash is absent on purpose -- it is the
  // remainder of the soum, computed rather than typed.
  const [methodAmounts, setMethodAmounts] = useState({});
  // A person saying they have the notes in hand. Nothing is written when it is pressed; the sale
  // still records money in one moment, when it is completed.
  const [cashConfirmed, setCashConfirmed] = useState(false);
  // Counted separately from the soum, because that is how notes are counted in a drawer.
  const [usdCashConfirmed, setUsdCashConfirmed] = useState(false);

  const loadGatewayPayments = useCallback(async () => {
    // Guarded rather than conditioned on by the caller: these hooks sit above the component's
    // `if (!sale) return null`, because hooks must run in the same order on every render.
    if (!sale) return;
    try {
      const { data } = await gatewayApi.forSale(api, {
        saleId: sale.id,
        saleGroupId: groupSales?.length ? sale.sale_group : null,
      });
      setGatewayPayments(data?.results || []);
    } catch {
      // A role without the permission, or Click switched off. Not an error worth showing: the
      // button simply will not appear, and a cash sale is unaffected.
      setGatewayPayments([]);
    }
  }, [sale, groupSales?.length]);

  useEffect(() => {
    loadGatewayPayments();
  }, [loadGatewayPayments]);

  // A tick given for one figure means nothing once that figure changes, so editing the dollars
  // clears the dollar tick. The soum side does the same in `setMethodAmount`.
  //
  // Up here with the other hooks, not beside the handler it belongs to: this component returns
  // early in places, and a hook below one of those returns runs on some renders and not others.
  useEffect(() => { setUsdCashConfirmed(false); }, [paymentFormData.usd]);


  useEffect(() => {
    if (!sale) {
      setExchangeRate(null);
      setExchangeRateError(null);
      setPaymentFormData(emptyPaymentFormState());
      return;
    }
    // Prefill immediately (same-currency advances work without rate); rebuild when CBU loads.
    setPaymentFormData(buildPaymentFormDataFromSale(sale, null));
    let cancelled = false;
    api
      .get('/exchange-rate/')
      .then((res) => {
        if (!cancelled) {
          setExchangeRate(res.data);
          setExchangeRateError(null);
          setPaymentFormData(buildPaymentFormDataFromSale(sale, res.data?.rate ?? null));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExchangeRate(null);
          setExchangeRateError(t('completePay.errCbuRate'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sale, t]);

  if (!sale) return null;

  const cbuRate = exchangeRate?.rate ?? null;
  const shortfallMeta = computePaymentDifferenceMeta(sale, paymentFormData, cbuRate);
  const sc = paymentFormData.sale_currency || sale.sale_currency || 'USD';
  const listUnit = paymentFormData.list_unit_price ?? (parseFloat(sale.selling_price) || 0);
  const discountAmountPerUnit = paymentFormData.discount_amount_per_unit ?? (parseFloat(sale.discount_price) || 0);
  const finalUnit = paymentFormData.final_unit_price ?? Math.max(0, listUnit - discountAmountPerUnit);
  const qty = parseFloat(sale.quantity) || 1;
  const listTotal = paymentFormData.list_total_amount ?? listUnit * qty;
  const saleDiscountTotal = paymentFormData.sale_discount_total ?? discountAmountPerUnit * qty;
  const finalDue =
    shortfallMeta.due != null && !Number.isNaN(shortfallMeta.due)
      ? shortfallMeta.due
      : paymentFormData.final_amount_due ?? finalUnit * qty;

  // The change panel keys off the *gross* surplus, not `shortfallMeta.needs`: once change
  // covers the surplus the payment reads as exact and `needs` goes false, which would pull the
  // panel out from under the amounts the user just typed.
  const changeTol = shortfallMeta.sc === 'UZS' ? 1 : 0.005;
  // Credit is offered only against a genuine shortfall. There is nothing to owe on a surplus,
  // and the server would reject it, so the box should not be there to tick.
  //
  // The permission is folded in here rather than at the checkbox so everything downstream follows:
  // the shortfall hint stops mentioning nasiya, and `staleCredit` clears an `apply_credit` that a
  // stale form still carries — which matters the moment an Admin switches the feature off mid-shift.
  // A debt has to be owed by somebody, so a sale with no customer cannot go on nasiya. The till
  // can now ring a basket up anonymously (`ShopSettings.pos_customer_required`), and a
  // `CreditSale` reads its debtor off the sale rather than storing one — so the receivable would
  // sit on Qarzdorlik for ever with a blank name and nobody to ask.
  //
  // `=== null` and not `!= null`: only an **explicitly** absent customer hides the box. A sale
  // serialized without the field at all is a shape this form has never had to think about, and
  // silently hiding nasiya from every one of them would be a far worse failure than the server
  // refusing the odd request. The server carries the same check and is the real guard.
  const customerUnknown = sale?.customer === null;
  const creditAvailable =
    canMarkCredit
    && !customerUnknown
    && shortfallMeta.short != null && shortfallMeta.short > changeTol;
  const onCredit = !!paymentFormData.apply_credit;
  // Bepul is offered only when the sale really is free: nothing typed in either currency, and
  // something actually owing. Part-paid is a discount on a real sale, and the server refuses
  // the flag in that case anyway — so showing the box there would only invite a rejection.
  const nothingReceived =
    !(parseFloat(paymentFormData.uzs) > 0) && !(parseFloat(paymentFormData.usd) > 0);
  const giveawayAvailable =
    canGiveaway && nothingReceived && shortfallMeta.due != null && shortfallMeta.due > 0;
  const isGiveaway = !!paymentFormData.apply_giveaway;
  const changeAvailable =
    saleAcceptsChange(sale)
    && (
      paymentFormData.apply_change
      || (shortfallMeta.requiredChange != null && shortfallMeta.requiredChange > changeTol)
    );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const meta = computePaymentDifferenceMeta(sale, paymentFormData, cbuRate);
      const uzsT = parseFloat(paymentFormData.uzs) || 0;
      const usdT = parseFloat(paymentFormData.usd) || 0;
      const advanceCheck = validateAdvanceCompletionPayment(
        sale,
        paymentFormData.uzs,
        paymentFormData.usd,
        undefined,
        cbuRate,
        meta.changeInSc || 0,
      );
      if (!advanceCheck.ok) {
        showNotification(advanceCheck.error, 'error');
        return;
      }

      if (meta.mixed) {
        showNotification(t('completePay.errRateLoading'), 'error');
        return;
      }

      if (advanceCheck.needsSplitCurrencyConfirm) {
        if (
          !window.confirm(
            buildSplitCurrencyConfirmMessage({
              sale,
              uzsAmount: advanceCheck.uzsAmount,
              usdAmount: advanceCheck.usdAmount,
              due: advanceCheck.due,
              sc: advanceCheck.sc,
              cbuRate: advanceCheck.cbuRate,
              paidInSaleCurrency: advanceCheck.paidInSaleCurrency,
              exchangeRate,
            }),
          )
        ) {
          return;
        }
      } else if (advanceCheck.needsCrossCurrencyConfirm) {
        if (!window.confirm(buildCrossCurrencyAdvanceConfirmMessage(advanceCheck, exchangeRate))) return;
      } else if ((meta.splitCurrency || meta.crossCurrency) && (uzsT > 0 || usdT > 0)) {
        if (
          !window.confirm(
            buildSplitCurrencyConfirmMessage({
              sale,
              uzsAmount: uzsT,
              usdAmount: usdT,
              due: meta.due,
              sc: meta.sc,
              cbuRate,
              paidInSaleCurrency: meta.paid,
              exchangeRate,
            }),
          )
        ) {
          return;
        }
      }

      if (meta.exceedsRemainingDue) {
        showNotification(
          t('completePay.errExceedsDue', { due: meta.due.toFixed(2), currency: meta.sc }),
          'error',
        );
        return;
      }

      if (paymentFormData.dispatch_payment_needed) {
        const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
        if (dAmt <= 0) {
          showNotification(t('completePay.errDispatchAmount'), 'error');
          return;
        }
      }

      if (
        paymentFormData.balance_shortfall_type === 'discount'
        && !(parseFloat(paymentFormData.balance_shortfall_amount) > 0)
      ) {
        showNotification(t('completePay.errDiscountAmount'), 'error');
        return;
      }

      // Asked before anything is sent, because this is the one completion where the shop ends
      // up with less than it started and nobody hands anything over to make that obvious.
      if (paymentFormData.apply_giveaway) {
        if (!window.confirm(buildGiveawayConfirmMessage(meta))) return;
      }

      const wantsCredit = !!paymentFormData.apply_credit;
      if (wantsCredit) {
        if (meta.creditWithNothingOwing) {
          showNotification(t('completePay.errCreditNothingOwing'), 'error');
          return;
        }
        if (meta.sharesExceedGap) {
          showNotification(t('completePay.errSharesExceedGap'), 'error');
          return;
        }
        if (meta.creditDueDateMissing) {
          showNotification(t('completePay.errCreditDueDate'), 'error');
          return;
        }
        if (!window.confirm(buildCreditConfirmMessage(meta, paymentFormData.credit_due_date))) return;
      }

      if (paymentFormData.apply_change) {
        const chUzs = parseFloat(paymentFormData.change_uzs) || 0;
        const chUsd = parseFloat(paymentFormData.change_usd) || 0;
        if (chUzs <= 0 && chUsd <= 0) {
          showNotification(t('completePay.errChangeAmount'), 'error');
          return;
        }
        if (meta.changePending) {
          showNotification(t('completePay.errRateLoading'), 'error');
          return;
        }
      }

      // Ticked credit, then raised the payment until nothing was owing. The box has already
      // gone from the form, so drop the stale flag rather than sending a debt of nothing.
      const staleCredit = wantsCredit && !creditAvailable;
      let effForm = staleCredit
        ? { ...paymentFormData, apply_credit: false, credit_amount: '', credit_due_date: '' }
        : paymentFormData;
      let effMeta = staleCredit ? computePaymentDifferenceMeta(sale, effForm, cbuRate) : meta;
      if (meta.needsAdditionalProfitConfirm) {
        if (!window.confirm(buildAdditionalProfitConfirmMessage(meta, exchangeRate))) return;
        effForm = { ...effForm, apply_additional_profit: true };
        effMeta = computePaymentDifferenceMeta(sale, effForm, cbuRate);
      }

      // Nothing typed in either currency and none of the options ticked, on a sale that is owed
      // money. Its own message rather than the generic shortfall one, because there is no
      // "difference" to classify here — the form has simply been told nothing, and completing
      // would record the sale as paid in full against a till that never saw a som.
      if (
        !effMeta.mixed
        && effMeta.paid == null
        && effMeta.due != null
        && effMeta.due > 0
      ) {
        showNotification(t('completePay.errNothingEntered'), 'error');
        return;
      }

      if (effMeta.differenceNeedsClassification) {
        showNotification(t('completePay.errShortfall'), 'error');
        return;
      }

      // **Withheld while any Click charge is unresolved.** Completing against a charge that may not
      // have succeeded credits the till with money the shop might not have, and every report
      // downstream believes it. The opposite failure -- Click paid and the sale still open -- is
      // visible, blocks nothing and is recoverable from the needs-check list.
      // Every part of the soum has to have been collected, each by its own kind of evidence: the
      // drawer by a person who looked in it, Click by Click. A sale completed short credits the
      // till with money the shop does not have, and every report downstream believes it.
      if (!methodState.ready) {
        showNotification(
          methodState.missing.includes('over')
            ? t('gateway.overAllocated')
            : t('gateway.errNotCollected'),
          'error',
        );
        return;
      }
      const gatewayBlock = completionBlock(gatewayPayments);
      if (gatewayBlock.blocked) {
        showNotification(t('gateway.errUnresolved', { count: gatewayBlock.count }), 'error');
        return;
      }

      // References only -- never an amount. The server moves the matching slice from the cash leg
      // to the card leg itself, from charges it made and recorded; a `uzs_card` figure sent from
      // here would be folded straight back into cash by its sanitiser.
      const requestData = withGatewayRefs(
        buildCompleteSaleRequest(effForm, effMeta, exchangeRate), gatewayPayments,
      );
      if (groupSales?.length) {
        const requests = withGatewayRefsOnEveryLine(
          buildGroupCompleteRequests(groupSales, effForm, effMeta, exchangeRate),
          gatewayPayments,
        );
        for (const req of requests) {
          await api.post(`/sales/${req.id}/update_status/`, req.data);
        }
        showNotification(t('completePay.successGroup', { count: groupSales.length }), 'success');
      } else {
        await api.post(`/sales/${sale.id}/update_status/`, requestData);
        showNotification(t('completePay.success'), 'success');
      }
      onSuccess?.();
      onClose?.();
    } catch (error) {
      console.error('Error completing sale:', error);
      showNotification(error.response?.data?.error || t('completePay.errComplete'), 'error');
    }
  };

  const handleClickCharge = async ({ otpData, amountUzs, idempotencyKey }) => {
    setClickError('');
    setClickBusy(true);
    try {
      const { data } = await gatewayApi.charge(api, {
        otpData,
        amountUzs,
        idempotencyKey,
        provider: scanProvider,
        saleId: sale.id,
        saleGroupId: groupSales?.length ? sale.sale_group : null,
      });
      setLastClickPayment(data);
      await loadGatewayPayments();
      if (data?.consumable) {
        // Paid. The window closes and the cashier carries on with any cash -- but **only now that
        // the payment window behind it states the amount in green**. Closing on its own was the
        // whole of the feedback during the first live payment, and it read as nothing happening.
        setClickOpen(false);
        showNotification(
          t('gateway.taken', {
            amount: Number(data.amount_uzs).toLocaleString(
              undefined, { maximumFractionDigits: 0 },
            ),
          }),
          'success',
        );
      }
    } catch (err) {
      setClickError(
        err.response?.data?.error
        || err.response?.data?.otp_data?.[0]
        || err.response?.data?.amount_uzs?.[0]
        || err.response?.data?.detail
        || t('gateway.errCharge'),
      );
    } finally {
      setClickBusy(false);
    }
  };

  const handleClickCheck = async (ref) => {
    setClickError('');
    setClickBusy(true);
    try {
      const { data } = await gatewayApi.refresh(api, ref);
      setLastClickPayment(data);
      await loadGatewayPayments();
    } catch (err) {
      setClickError(err.response?.data?.error || t('gateway.errCheck', { provider: providerName }));
    } finally {
      setClickBusy(false);
    }
  };

  const handleCancel = () => {
    setPaymentFormData(emptyPaymentFormState());
    onClose?.();
  };

  // The soum the sale is taking, which is what the method row divides up. Read from the form's
  // own box rather than recomputed, so the two can never disagree about the total.
  const uzsPosted = methodAmount(paymentFormData.uzs);
  // Dollars take no part in the soum split: they are only ever cash, so this column mirrors the
  // box above rather than dividing anything.
  const usdPosted = methodAmount(paymentFormData.usd);
  const cashDue = cashShare(uzsPosted, methodAmounts);
  const clickTakenUzs = totalUsable(gatewayPayments);
  const methodState = methodsSettled({
    uzsPosted, amounts: methodAmounts, cashConfirmed, clickTakenUzs,
    usdPosted, usdCashConfirmed,
  });

  const setMethodAmount = (method, value) => {
    // Stored as a plain number string; `formatGrouped` decides how it is displayed. Keeping those
    // apart is what lets the box show "400 000" without the amount that reaches Click changing.
    setMethodAmounts((prev) => ({ ...prev, [method]: parseGrouped(value) }));
    // Any change to the split means the drawer figure has changed, so a tick given for the old
    // figure no longer means anything. Making the cashier look again is the point.
    setCashConfirmed(false);
  };

  // What to suggest charging, in soum. The sale is usually priced in dollars, so this goes through
  // the rate the form already holds rather than forming a second opinion about it.
  const clickDueUzs = (() => {
    const due = shortfallMeta?.due;
    if (due == null || Number.isNaN(due)) return 0;
    if (shortfallMeta.sc === 'UZS') return Math.round(due);
    const rate = parseFloat(exchangeRate?.rate);
    return Number.isFinite(rate) && rate > 0 ? Math.round(due * rate) : 0;
  })();

  // Named for the provider being charged, so a Payme window does not say Click. The scan
  // instructions and the waiting state are identical for both, because the gesture is.
  const providerName = t(`gateway.method_${scanProvider}`);
  const clickLabels = {
    title: t('gateway.titleFor', { provider: providerName }),
    intro: t('gateway.introFor', { provider: providerName }),
    close: t('actions.close', { ns: 'common' }),
    amount: t('gateway.amount'),
    amountHint: t('gateway.amountHint'),
    scan: t('gateway.scan'),
    scanHint: t('gateway.scanHintFor', { provider: providerName }),
    waitingForScan: t('gateway.waitingForScan'),
    typeByHand: t('gateway.typeByHand'),
    chargeButton: t('gateway.chargeButton'),
    charging: t('gateway.charging'),
    check: t('gateway.check', { provider: providerName }),
    checking: t('gateway.checking'),
    tryAgain: t('gateway.tryAgain'),
    alreadyTaken: t('gateway.alreadyTaken'),
    soum: t('currency.uzs', { ns: 'common' }),
    unresolvedTitle: t('gateway.unresolvedTitle'),
    unresolvedBody: t('gateway.unresolvedBody', { provider: providerName }),
    declinedTitle: t('gateway.declinedTitle'),
    declinedBody: t('gateway.declinedBody', { provider: providerName }),
    // Resolved here rather than inside the dialog so the precedence between our wording and the
    // provider's lives in one tested helper instead of in a component.
    ...(() => {
      const { text, note } = failureText(lastClickPayment, t);
      return { failureText: text, failureNote: note };
    })(),
    statePaid: t('gateway.statePaid'),
    stateFailed: t('gateway.stateFailed'),
    statePending: t('gateway.statePending'),
    stateOwed: t('gateway.stateOwed'),
    stateReversed: t('gateway.stateReversed'),
    stateUnknown: t('gateway.stateUnknown'),
  };

  // The caller only renders this component when there is a sale to settle, so it is open
  // whenever it exists; `onClose` unmounts it from the parent's side.
  return (
    <Modal
      open
      onClose={handleCancel}
      closeLabel={t('actions.close', { ns: 'common' })}
      closeOnBackdrop={false}
      title={t('completePay.title', { id: sale.id })}
    >
      <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>{t('completePay.intro')}</p>
      {exchangeRate?.label && (
        <p style={{ color: '#4a5568', marginBottom: '12px', fontSize: '0.85em' }}>{exchangeRate.label}</p>
      )}
      {exchangeRateError && (
        <p style={{ color: '#b45309', marginBottom: '12px', fontSize: '0.85em' }}>{exchangeRateError}</p>
      )}
      <div
        style={{
          marginBottom: 16,
          padding: '12px 14px',
          background: '#f8f9fa',
          borderRadius: 6,
          fontSize: '0.9em',
          color: '#444',
          lineHeight: 1.5,
        }}
      >
        {/* One line rather than four. These are four readings of the same price and they were
            taking a quarter of the window to say so; read across, the relationship between them
            is the obvious thing instead of something to assemble. */}
        <div className="pay-summary">
          <span>
            <strong>{t('completePay.listPrice')}</strong> {formatDisplayAmount(listUnit, sc)}{' '}
            {t('completePay.perUnit')}
            {qty > 1 ? ` · ${formatDisplayAmount(listTotal, sc)} ${t('completePay.total')}` : ''}
          </span>
          <span>
            <strong>{t('completePay.discount')}</strong>{' '}
            {formatDisplayAmount(discountAmountPerUnit, sc)} {t('completePay.perUnit')}
            {saleDiscountTotal > 0 && qty > 1
              ? ` · ${formatDisplayAmount(saleDiscountTotal, sc)} ${t('completePay.total')}`
              : ''}
          </span>
          <span>
            <strong>{t('completePay.finalPrice')}</strong> {formatDisplayAmount(finalUnit, sc)}{' '}
            {t('completePay.perUnit')}
          </span>
          <span className="pay-summary__due">
            <strong>{t('completePay.amountDue')}</strong> {formatDisplayAmount(finalDue, sc)}
          </span>
        </div>
      </div>
      <BusyForm onSubmit={handleSubmit}>
        <div className="form-grid">
          {paymentFormData.prepayment_amount && parseFloat(paymentFormData.prepayment_amount) > 0 && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>{t('completePay.prepayment')}</label>
              <input
                type="text"
                value={formatDisplayAmount(
                  paymentFormData.prepayment_amount,
                  paymentFormData.prepayment_currency || sc,
                )}
                readOnly
                style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
              />
              <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                {t('completePay.prepaymentHint')}
              </small>
            </div>
          )}
          <div className="form-group">
            <label>{t('currency.uzs', { ns: 'common' })}</label>
            <AmountInput
              placeholder="0"
              value={paymentFormData.uzs ?? ''}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>{t('currency.usd', { ns: 'common' })}</label>
            <AmountInput
              placeholder="0"
              value={paymentFormData.usd ?? ''}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, usd: e.target.value })}
            />
          </div>

          {shortfallMeta.due != null && !Number.isNaN(shortfallMeta.due) && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
                <strong>{t('completePay.amountDueAfterPrepay')}</strong>{' '}
                {shortfallMeta.sc === 'UZS'
                  ? `${shortfallMeta.due.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
                  : `${shortfallMeta.due.toFixed(2)} USD`}
                {saleHasOrderAdvance(sale) && (
                  <>
                    {' '}
                    {t('completePay.maxInCurrency', {
                      currency: shortfallMeta.sc,
                      other: shortfallMeta.sc === 'USD' ? 'UZS' : 'USD',
                    })}
                  </>
                )}
                {shortfallMeta.paid != null &&
                (parseFloat(paymentFormData.uzs) || parseFloat(paymentFormData.usd)) ? (
                  <>
                    {' '}
                    ·{' '}
                    <strong>
                      {shortfallMeta.splitCurrency || shortfallMeta.crossCurrency
                        ? t('completePay.totalAtCbuIn', { currency: shortfallMeta.sc })
                        : t('completePay.enteredIn', { currency: shortfallMeta.sc })}
                    </strong>{' '}
                    {shortfallMeta.sc === 'UZS'
                      ? shortfallMeta.paid.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : shortfallMeta.paid.toFixed(2)}{' '}
                    {shortfallMeta.sc === 'UZS' ? 'UZS' : 'USD'}
                  </>
                ) : null}
              </p>
            </div>
          )}
          {changeAvailable && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <SaleChangeFields
                form={paymentFormData}
                setForm={setPaymentFormData}
                sc={shortfallMeta.sc}
                required={shortfallMeta.requiredChange}
                cbuRate={cbuRate}
                t={t}
              />
            </div>
          )}
          {shortfallOptionsVisible(shortfallMeta, paymentFormData) && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: '#555', lineHeight: 1.45 }}>
                {creditAvailable ? t('completePay.shortfallHintCredit') : t('completePay.shortfallHint')}
              </p>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={paymentFormData.balance_shortfall_type === 'discount'}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const defaultDisc =
                      shortfallMeta.short != null && shortfallMeta.short > 0
                        ? (shortfallMeta.sc === 'UZS'
                          ? String(Math.round(shortfallMeta.short))
                          : shortfallMeta.short.toFixed(2))
                        : '';
                    setPaymentFormData({
                      ...paymentFormData,
                      balance_shortfall_type: checked ? 'discount' : '',
                      balance_shortfall_amount: checked
                        ? (paymentFormData.balance_shortfall_amount || defaultDisc)
                        : '',
                    });
                  }}
                />
                <span>{t('completePay.discountOption')}</span>
              </label>
              {paymentFormData.balance_shortfall_type === 'discount' && (
                <div style={{ marginTop: 10, maxWidth: 280 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
                    {t('completePay.discountAmountLabel', { currency: shortfallMeta.sc })}
                  </label>
                  <AmountInput
                    step={shortfallMeta.sc === 'UZS' ? '1' : '0.01'}
                    value={paymentFormData.balance_shortfall_amount ?? ''}
                    onChange={(e) =>
                      setPaymentFormData({
                        ...paymentFormData,
                        balance_shortfall_amount: e.target.value,
                      })
                    }
                  />
                </div>
              )}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  marginTop: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!paymentFormData.apply_currency_conversion_difference}
                  onChange={(e) =>
                    setPaymentFormData({
                      ...paymentFormData,
                      apply_currency_conversion_difference: e.target.checked,
                    })
                  }
                />
                <span>{t('completePay.conversionDifferenceOption')}</span>
              </label>
              {paymentFormData.apply_currency_conversion_difference
                && shortfallMeta.remainingAfterDiscount != null && (
                <p style={{ margin: '8px 0 0', fontSize: '0.85em', color: '#555' }}>
                  {t('completePay.conversionDifferenceValue', {
                    amount:
                      shortfallMeta.sc === 'UZS'
                        ? Math.round(shortfallMeta.remainingAfterDiscount).toLocaleString()
                        : shortfallMeta.remainingAfterDiscount.toFixed(2),
                    currency: shortfallMeta.sc,
                  })}
                </p>
              )}

            </div>
          )}

          {/*
            Bepul — stock handed over as a gift.

            Outside the shortfall block for the same reason credit is: that block reacts to money
            that was typed and fell short, and here nothing is typed at all. It appears only when
            the sale really is free, and only for the three roles allowed to take that loss, so
            for everyone else the option is not there to reach for.
          */}
          {giveawayAvailable && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isGiveaway}
                  onChange={(e) => {
                    // A gift cannot also be a debt, a discount or an exchange-rate difference:
                    // the whole price is written off, so there is nothing left for any of them
                    // to name. Their boxes disappear, and this clears what they held.
                    setPaymentFormData(applyGiveawayToggle(paymentFormData, e.target.checked));
                  }}
                />
                <span>{t('completePay.giveawayOption')}</span>
              </label>
              {isGiveaway && (
                <p style={{ margin: '8px 0 0', fontSize: '0.85em', color: '#b45309', lineHeight: 1.45 }}>
                  {t('completePay.giveawayHint', {
                    amount: formatDisplayAmount(finalDue, shortfallMeta.sc),
                    currency: shortfallMeta.sc,
                  })}
                </p>
              )}
            </div>
          )}

          {/*
            Outside the shortfall block on purpose. That block only appears once money has been
            typed and come up short, which is exactly the case a credit sale is not: the customer
            takes the goods and hands over nothing, so there is no shortfall to react to. Credit
            is a choice made up front, so it is offered wherever anything is still owing.
          */}
          {creditAvailable && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onCredit}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    // Mirrors the Bepul box, which already clears credit: the two are opposite
                    // answers to the same question — the customer owes it, or nobody does — and
                    // the server refuses a sale that claims to be both.
                    setPaymentFormData({
                      ...paymentFormData,
                      apply_credit: checked,
                      credit_amount: checked ? paymentFormData.credit_amount : '',
                      credit_due_date: checked ? paymentFormData.credit_due_date : '',
                      ...(checked ? { apply_giveaway: false } : {}),
                    });
                  }}
                />
                <span>{t('completePay.creditOption')}</span>
              </label>
              {onCredit && (
                <div style={{ marginTop: 10, maxWidth: 280 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
                    {t('completePay.creditAmountLabel', { currency: shortfallMeta.sc })}
                  </label>
                  <AmountInput
                    step={shortfallMeta.sc === 'UZS' ? '1' : '0.01'}
                    placeholder={
                      shortfallMeta.creditAmount != null
                        ? (shortfallMeta.sc === 'UZS'
                          ? String(Math.round(shortfallMeta.creditAmount))
                          : shortfallMeta.creditAmount.toFixed(2))
                        : '0'
                    }
                    value={paymentFormData.credit_amount ?? ''}
                    onChange={(e) =>
                      setPaymentFormData({ ...paymentFormData, credit_amount: e.target.value })
                    }
                  />
                  <small style={{ color: '#666', marginTop: 5, display: 'block' }}>
                    {t('completePay.creditAmountHint')}
                  </small>
                  <label
                    style={{ display: 'block', marginTop: 10, marginBottom: 4, fontSize: '0.9em' }}
                  >
                    {t('completePay.creditDueDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={paymentFormData.credit_due_date ?? ''}
                    onChange={(e) =>
                      setPaymentFormData({ ...paymentFormData, credit_due_date: e.target.value })
                    }
                    required
                  />
                  <small style={{ color: '#666', marginTop: 5, display: 'block' }}>
                    {t('completePay.creditDueDateHint')}
                  </small>
                </div>
              )}
            </div>
          )}

          {paymentFormData.dispatch_payment_needed && (
            <>
              <div
                className="form-group"
                style={{ gridColumn: '1 / -1', marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e0e0e0' }}
              >
                <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>{t('completePay.dispatchPayment')}</h3>
              </div>
              <div className="form-group">
                <label>
                  {t('completePay.dispatchAmount', {
                    currency: paymentFormData.dispatch_payment_currency,
                  })}
                </label>
                <AmountInput
                  value={paymentFormData.dispatch_payment_amount ?? ''}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, dispatch_payment_amount: e.target.value })
                  }
                  required={paymentFormData.dispatch_payment_needed}
                />
              </div>
              <div className="form-group">
                <label>{t('completePay.dispatchCurrency')}</label>
                <select
                  value={paymentFormData.dispatch_payment_currency || 'UZS'}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, dispatch_payment_currency: e.target.value })
                  }
                  required={paymentFormData.dispatch_payment_needed}
                >
                  <option value="USD">{t('currency.usd', { ns: 'common' })}</option>
                  <option value="UZS">{t('currency.uzs', { ns: 'common' })}</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>{t('completePay.notes')}</label>
            <textarea
              rows={2}
              value={paymentFormData.completion_notes ?? ''}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, completion_notes: e.target.value })}
            />
            <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
              {shortfallMeta.needs ? t('completePay.notesDiscountHint') : t('completePay.notesOptional')}
            </small>
          </div>

          {/*
            How the soum is divided, and how each part is confirmed.

            **Cash is the remainder.** Every other method is entered deliberately and what is left
            is what the drawer must receive, so the parts cannot fail to add up to the total --
            there is no second number to disagree with.

            **The two buttons mean different things.** `To'landi` is a person saying they looked in
            the drawer: a tick, nothing written, and the sale still records money in one moment
            when it is completed. `Qabul qilish` on Click opens the scanner and really takes money.
            So what the cashier typed into the Click box counts for nothing on its own -- only
            Click's own answer settles that part.
          */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>{t('gateway.methods')}</label>
            <div className="pay-methods">
              {ROW_METHODS.map((method) => {
                // From the shared list, not restated here. Restating it is why adding Payme to
                // `LIVE_METHODS` left the column greyed: the constant and the till disagreed, and
                // only the till was visible.
                const live = LIVE_METHODS.includes(method);
                const isCash = method === 'cash';
                const isUsd = method === 'cash_usd';
                // Both cash columns are shown rather than asked for: soum is the remainder of the
                // split, and dollars are only ever taken in cash so there is nothing to divide.
                const shown = isCash
                  ? formatGrouped(cashDue)
                  : (isUsd ? formatGrouped(usdPosted, 2) : formatGrouped(methodAmounts[method]));
                const takenHere = isCash
                  ? cashConfirmed
                  : (isUsd ? usdCashConfirmed : clickTakenUzs > 0);
                return (
                  <div className="pay-method" key={method}>
                    <span className="pay-method__name">
                      {t(`gateway.method_${method}`)}
                      {live ? '' : ` · ${t('gateway.comingSoon')}`}
                    </span>
                    {/* Text, not `type="number"`: a number input refuses to hold "400 000" and
                        hands back an empty value, so the figure on screen and the figure that
                        would be charged stop being the same thing. `inputMode` still brings up a
                        numeric keypad on a phone. */}
                    <input
                      className="pay-method__amount"
                      type="text"
                      inputMode="numeric"
                      value={shown}
                      // Both cash columns are readings rather than fields -- see above.
                      readOnly={isCash || isUsd}
                      disabled={!live}
                      onChange={(e) => setMethodAmount(method, e.target.value)}
                      aria-label={t(`gateway.method_${method}`)}
                    />
                    {isCash || isUsd ? (
                      <button
                        type="button"
                        className="btn-primary btn-dialog pay-method__button"
                        disabled={isUsd
                          ? (usdPosted <= 0 || usdCashConfirmed)
                          : (cashDue <= 0 || cashConfirmed)}
                        onClick={() => (isUsd ? setUsdCashConfirmed(true) : setCashConfirmed(true))}
                      >
                        {t('gateway.markPaid')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-edit btn-dialog pay-method__button"
                        disabled={!live || methodAmount(methodAmounts[method]) <= 0}
                        title={live ? undefined : t('gateway.comingSoon')}
                        onClick={() => {
                          setClickError('');
                          setLastClickPayment(null);
                          setScanProvider(method);
                          setClickOpen(true);
                        }}
                      >
                        {t('gateway.accept')}
                      </button>
                    )}
                    {takenHere ? (
                      <span className="pay-method__done">
                        {isCash || isUsd
                          ? t('gateway.cashCollected')
                          : t('gateway.clickCollected', {
                            amount: clickTakenUzs.toLocaleString(
                              undefined, { maximumFractionDigits: 0 },
                            ),
                          })}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {overAllocated(uzsPosted, methodAmounts) ? (
              <div className="error-message" style={{ marginTop: 8 }}>
                {t('gateway.overAllocated')}
              </div>
            ) : null}

            {/* The charges that stop Yakunlash. Stated separately from money in hand, with the
                amount **not** added up: nobody knows whether that money exists, and showing a
                total would imply it does. */}
            {gatewayPayments.some(isPending) ? (
              <div className="form-card gw-panel gw-panel--blocked">
                <strong className="gw-panel__title">
                  {t('gateway.blockingTitle', {
                    count: gatewayPayments.filter(isPending).length,
                  })}
                </strong>
                <p className="gw-panel__body">{t('gateway.blockingBody')}</p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="form-actions">
          <SubmitButton className="btn-primary">
            {t('completeSale')}
          </SubmitButton>
          <button type="button" className="btn-edit" onClick={handleCancel}>
            {t('actions.cancel', { ns: 'common' })}
          </button>
        </div>
      </BusyForm>

      {/* Outside the completion form on purpose: a form nested in a form is invalid HTML, and the
          inner submit would bubble up and complete the sale instead of charging the card. */}
      <ClickChargeModal
        open={clickOpen}
        onClose={() => setClickOpen(false)}
        // The amount typed into the Click box, when there is one: the cashier has already decided
        // how much of this sale goes on Click, and re-suggesting the whole sale would invite
        // charging the customer for the cash part as well.
        dueUzs={methodAmount(methodAmounts[scanProvider]) || clickDueUzs}
        payments={gatewayPayments}
        busy={clickBusy}
        error={clickError}
        lastPayment={lastClickPayment}
        onCharge={handleClickCharge}
        onCheck={handleClickCheck}
        labels={clickLabels}
      />
    </Modal>
  );
}
