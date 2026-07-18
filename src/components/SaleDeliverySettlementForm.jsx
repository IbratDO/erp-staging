import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';
import useCbuExchangeRate from '../hooks/useCbuExchangeRate';
import { formatDisplayAmount } from '../utils/currencyFormat';
import {
  buildPaymentFormDataFromSale,
  deliveryStep2PaymentFromStep1,
  computeAdvanceRemainingDue,
  computePaymentDifferenceMeta,
  emptyPaymentFormState,
  paymentNeedsCbuConversion,
} from '../utils/saleCompletePayHelpers';
import {
  runSalePaymentSubmitFlow,
  combinedPaymentInSaleCurrency,
} from '../utils/salePaymentFlowHelpers';

function DeliveryPaymentAmountFields({ form, setForm, meta, t }) {
  return (
    <>
      <div className="form-group">
        <label>{t('currency.uzs', { ns: 'common' })}</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={form.uzs ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, uzs: e.target.value }))}
        />
      </div>
      <div className="form-group">
        <label>{t('currency.usd', { ns: 'common' })}</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={form.usd ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, usd: e.target.value }))}
        />
      </div>
      {meta.due != null && !Number.isNaN(meta.due) && (
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
            <strong>{t('deliverySettlement.amountDue')}</strong> {formatDisplayAmount(meta.due, meta.sc)}
            {meta.paid != null ? (
              <>
                {' '}
                ·{' '}
                <strong>
                  {meta.splitCurrency || meta.crossCurrency
                    ? t('completePay.totalAtCbuIn', { currency: meta.sc })
                    : t('completePay.enteredIn', { currency: meta.sc })}
                </strong>{' '}
                {formatDisplayAmount(meta.paid, meta.sc)}
              </>
            ) : meta.mixed ? (
              <span style={{ color: '#b45309' }}> — {t('deliverySettlement.loadingCbu')}</span>
            ) : null}
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Shop delivery settlement: 3 steps with UZS/USD + CBU (same rules as Complete & Pay).
 */
export default function SaleDeliverySettlementForm({
  sale: saleProp,
  onClose,
  onSuccess,
  onAfterStepRecorded,
  showNotification,
}) {
  const { t } = useAppTranslation(['sales', 'common']);
  const { hasAnyPermission, hasPermission } = usePermissions();
  const canShopRemittance = hasPermission('sales.delivery_shop_received');
  const canPayDispatchFee = hasAnyPermission([
    'sales.delivery_pay_dispatch_fee',
    'sales.complete_pay',
  ]);
  const [sale, setSale] = useState(null);
  const [step1, setStep1] = useState(() => emptyPaymentFormState());
  const [step2, setStep2] = useState(() => emptyPaymentFormState());
  const [step2Note, setStep2Note] = useState('');
  const [step3Pay, setStep3Pay] = useState({ uzs: '', usd: '' });
  const [saleLoading, setSaleLoading] = useState(true);
  const cardRef = useRef(null);
  const formInitSaleIdRef = useRef(null);
  const step1PrefillSaleIdRef = useRef(null);
  const step3PrefillSaleIdRef = useRef(null);
  const { exchangeRate, exchangeRateError, cbuRate } = useCbuExchangeRate(!!saleProp?.id);

  useEffect(() => {
    const timer = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(timer);
  }, [saleProp?.id]);

  useEffect(() => {
    let cancel = false;
    if (!saleProp?.id) {
      setSaleLoading(false);
      return undefined;
    }
    setSaleLoading(true);
    formInitSaleIdRef.current = null;
    step1PrefillSaleIdRef.current = null;
    step3PrefillSaleIdRef.current = null;
    (async () => {
      try {
        const { data } = await api.get(`/sales/${saleProp.id}/`);
        if (!cancel) setSale(data);
      } catch {
        if (!cancel) setSale(saleProp);
      } finally {
        if (!cancel) setSaleLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [saleProp?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- saleProp snapshot on fetch only

  useEffect(() => {
    if (!sale?.id || saleLoading) return;
    if (formInitSaleIdRef.current === sale.id && !cbuRate) return;
    const alreadyInit = formInitSaleIdRef.current === sale.id;
    formInitSaleIdRef.current = sale.id;
    const fd = buildPaymentFormDataFromSale(sale, cbuRate);
    fd.dispatch_payment_needed = false;
    fd.dispatch_payment_amount = '';
    const step2FromStep1 = deliveryStep2PaymentFromStep1(sale);
    setStep1({ ...fd });
    setStep2(
      step2FromStep1
        ? { ...fd, uzs: step2FromStep1.uzs, usd: step2FromStep1.usd }
        : { ...fd },
    );
    // When CBU arrives after first init, refresh remaining prefill for open step1 only.
    if (alreadyInit && cbuRate && !sale.delivery_customer_paid_at) {
      const due = computeAdvanceRemainingDue(sale, null, cbuRate);
      const sc = (sale.sale_currency || 'USD').toUpperCase();
      if (due != null && due > 0) {
        setStep1((prev) => ({
          ...prev,
          uzs: sc === 'UZS' ? String(Math.round(due)) : '',
          usd: sc === 'USD' ? due.toFixed(2) : '',
        }));
      }
    }
  }, [sale?.id, saleLoading, cbuRate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sale?.id || saleLoading || sale.delivery_customer_paid_at) return;
    if (step1PrefillSaleIdRef.current === sale.id) return;
    step1PrefillSaleIdRef.current = sale.id;
    const due = computeAdvanceRemainingDue(sale, null, cbuRate);
    if (due == null) return;
    const sc = sale.sale_currency || 'USD';
    if (sc === 'UZS' && due > 0) {
      setStep1((prev) => ({ ...prev, uzs: String(Math.round(due)), usd: '' }));
    } else if (due > 0) {
      setStep1((prev) => ({ ...prev, usd: due.toFixed(2), uzs: '' }));
    }
  }, [sale?.id, saleLoading, cbuRate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sale?.id) return;
    if (!sale.delivery_shop_remittance_at && sale.delivery_customer_paid_at) {
      setStep2Note('');
    }
  }, [sale?.id, sale?.delivery_customer_paid_at, sale?.delivery_shop_remittance_at]);

  const d = sale?.dispatch_info || null;
  const uzFee = d ? parseFloat(d.delivery_cost_uzs ?? 0) || 0 : 0;
  const usFee = d ? parseFloat(d.delivery_cost ?? 0) || 0 : 0;
  const dispatchFeeCurrency = uzFee > 0 ? 'UZS' : 'USD';
  const dispatchFeeDue = uzFee > 0 ? uzFee : usFee;

  const activeStepPreview = sale
    ? !sale.delivery_customer_paid_at
      ? 1
      : !sale.delivery_shop_remittance_at
        ? 2
        : !sale.delivery_dispatcher_fee_completed_at
          ? 3
          : 0
    : 0;

  useEffect(() => {
    if (!sale?.id || saleLoading || activeStepPreview !== 3) return;
    if (!d || dispatchFeeDue <= 0) {
      setStep3Pay({ uzs: '', usd: '' });
      step3PrefillSaleIdRef.current = sale.id;
      return;
    }
    if (step3PrefillSaleIdRef.current === sale.id) return;
    step3PrefillSaleIdRef.current = sale.id;
    if (dispatchFeeCurrency === 'UZS') {
      setStep3Pay({ uzs: String(Math.round(dispatchFeeDue)), usd: '' });
    } else {
      setStep3Pay({ uzs: '', usd: String(dispatchFeeDue.toFixed(2)) });
    }
  }, [sale?.id, saleLoading, activeStepPreview, dispatchFeeDue, dispatchFeeCurrency, d]);

  if (!sale || saleLoading) return null;

  const meta1 = computePaymentDifferenceMeta(sale, step1, cbuRate);
  const meta2 = computePaymentDifferenceMeta(sale, step2, cbuRate);
  const step3CombinedTotal =
    dispatchFeeDue > 0
      ? combinedPaymentInSaleCurrency(
          { sale_currency: dispatchFeeCurrency },
          step3Pay.uzs,
          step3Pay.usd,
          cbuRate,
        )
      : null;

  const s1 = !!sale.delivery_customer_paid_at;
  const s2 = !!sale.delivery_shop_remittance_at;
  const s3 = !!sale.delivery_dispatcher_fee_completed_at;
  const activeStep = !s1 ? 1 : !s2 ? 2 : !s3 ? 3 : 0;
  const needsDispatchFeePayment = !!(d && !d.is_paid && dispatchFeeDue > 0);

  const productLabel = sale.product_detail
    ? [sale.product_detail.brand, sale.product_detail.model].filter(Boolean).join(' ').trim() ||
      t('deliverySettlement.productFallback')
    : t('deliverySettlement.productFallback');

  const handleStep1 = async () => {
    const sc = sale.sale_currency || 'USD';
    const uzsT = parseFloat(step1.uzs) || 0;
    const usdT = parseFloat(step1.usd) || 0;
    if (uzsT + usdT === 0) {
      showNotification?.(t('deliverySettlement.errAmount'), 'error');
      return;
    }
    const needsCbuRate =
      (uzsT > 0 && usdT > 0) ||
      (sc === 'USD' && uzsT > 0 && usdT === 0) ||
      (sc === 'UZS' && usdT > 0 && uzsT === 0);
    if (needsCbuRate && !cbuRate) {
      showNotification?.(
        exchangeRateError || t('completePay.errRateLoading'),
        'error',
      );
      return;
    }
    const totalInSaleCurrency = combinedPaymentInSaleCurrency(sale, step1.uzs, step1.usd, cbuRate);
    if (totalInSaleCurrency == null) {
      showNotification?.(t('deliverySettlement.errCalc'), 'error');
      return;
    }
    const due = computeAdvanceRemainingDue(sale);
    const tol = sc === 'UZS' ? 1 : 0.02;
    const amountChanged =
      due == null ||
      Number.isNaN(due) ||
      Math.abs(totalInSaleCurrency - due) > tol;
    if (amountChanged) {
      const ok = window.confirm(
        [
          t('deliverySettlement.confirmStep1Title'),
          '',
          t('deliverySettlement.confirmStep1SaleLine', { id: sale.id, product: productLabel }),
          '',
          t('deliverySettlement.confirmStep1Expected', {
            amount: formatDisplayAmount(due, sc),
          }),
          t('deliverySettlement.confirmStep1Entered', {
            currency: sc,
            amount: formatDisplayAmount(totalInSaleCurrency, sc),
          }),
          t('deliverySettlement.confirmStep1Amounts', {
            uzs: uzsT.toFixed(2),
            usd: usdT.toFixed(2),
          }),
          '',
          t('deliverySettlement.confirmStep1Note'),
        ].join('\n'),
      );
      if (!ok) return;
    }
    try {
      const body = {
        uzs: uzsT,
        usd: usdT,
        sale_currency: sc,
      };
      if (exchangeRate?.rate && (uzsT > 0 && usdT > 0)) {
        body.exchange_rate = exchangeRate.rate;
      } else if (exchangeRate?.rate && ((sc === 'USD' && uzsT > 0) || (sc === 'UZS' && usdT > 0))) {
        body.exchange_rate = exchangeRate.rate;
      }
      await api.post(`/sales/${sale.id}/delivery_customer_paid/`, body);
      showNotification?.(t('deliverySettlement.step1Success'), 'success');
      await Promise.resolve(onAfterStepRecorded?.());
      onClose?.();
    } catch (e) {
      showNotification?.(e.response?.data?.error || e.response?.data?.detail || t('deliverySettlement.step1Err'), 'error');
    }
  };

  const handleStep2 = async (e) => {
    e.preventDefault();
    const flow = await runSalePaymentSubmitFlow({
      sale,
      paymentFormData: step2,
      exchangeRate,
      exchangeRateError,
      showNotification,
      allowDiscount: true,
    });
    if (!flow.ok) return;
    const body = { ...flow.requestData };
    const trimmedNote = String(step2Note || '').trim();
    if (trimmedNote) body.delivery_shop_remittance_note = trimmedNote;
    try {
      await api.post(`/sales/${sale.id}/delivery_shop_received_payment/`, body);
      showNotification?.(t('deliverySettlement.step2Success'), 'success');
      await Promise.resolve(onAfterStepRecorded?.());
      onClose?.();
    } catch (err) {
      showNotification?.(
        err.response?.data?.error || err.response?.data?.detail || t('deliverySettlement.step2Err'),
        'error',
      );
    }
  };

  const handleStep3 = async (e) => {
    e.preventDefault();
    try {
      const body = {};
      if (needsDispatchFeePayment) {
        const uzsT = parseFloat(step3Pay.uzs) || 0;
        const usdT = parseFloat(step3Pay.usd) || 0;
        if (uzsT + usdT === 0) {
          showNotification?.(t('deliverySettlement.errDispatchFee'), 'error');
          return;
        }
        if ((uzsT > 0 && usdT > 0) || (dispatchFeeCurrency === 'USD' && uzsT > 0) || (dispatchFeeCurrency === 'UZS' && usdT > 0)) {
          if (!cbuRate) {
            showNotification?.(
              exchangeRateError || t('completePay.errRateLoading'),
              'error',
            );
            return;
          }
        }
        const paidTotal = combinedPaymentInSaleCurrency(
          { sale_currency: dispatchFeeCurrency },
          step3Pay.uzs,
          step3Pay.usd,
          cbuRate,
        );
        if (paidTotal == null) {
          showNotification?.(t('deliverySettlement.errDispatchCalc'), 'error');
          return;
        }
        const tol = dispatchFeeCurrency === 'UZS' ? 1 : 0.02;
        const isCrossCurrencyOnly =
          (dispatchFeeCurrency === 'UZS' && usdT > 0 && uzsT === 0) ||
          (dispatchFeeCurrency === 'USD' && uzsT > 0 && usdT === 0);
        const amountMismatch = Math.abs(paidTotal - dispatchFeeDue) > tol;
        let confirmDispatchFee = false;
        if (amountMismatch) {
          const ok = window.confirm(
            [
              t('deliverySettlement.confirmStep3PayTitle'),
              '',
              t('deliverySettlement.confirmStep3PlannedFee', {
                amount: formatDisplayAmount(dispatchFeeDue, dispatchFeeCurrency),
              }),
              t('deliverySettlement.confirmStep3PaymentEntered', {
                amount: formatDisplayAmount(paidTotal, dispatchFeeCurrency),
              }),
              t('deliverySettlement.confirmStep3Amounts', {
                uzs: uzsT.toFixed(2),
                usd: usdT.toFixed(2),
              }),
              '',
              t('deliverySettlement.confirmStep3MismatchNote'),
              t('deliverySettlement.confirmStep3Proceed'),
            ].join('\n'),
          );
          if (!ok) return;
          confirmDispatchFee = true;
        } else if (isCrossCurrencyOnly) {
          const ok = window.confirm(
            [
              t('deliverySettlement.confirmStep3FeeTitle'),
              '',
              t('deliverySettlement.confirmStep3FeeOnRecord', {
                amount: formatDisplayAmount(dispatchFeeDue, dispatchFeeCurrency),
              }),
              t('deliverySettlement.confirmStep3FeeAtCbu', {
                currency: dispatchFeeCurrency,
                amount: formatDisplayAmount(paidTotal, dispatchFeeCurrency),
              }),
              t('deliverySettlement.confirmStep3Amounts', {
                uzs: uzsT.toFixed(2),
                usd: usdT.toFixed(2),
              }),
              exchangeRate?.label ? `\n${exchangeRate.label}` : '',
              '',
              t('completePay.confirmContinue'),
            ]
              .filter(Boolean)
              .join('\n'),
          );
          if (!ok) return;
          confirmDispatchFee = true;
        }
        body.uzs = uzsT;
        body.usd = usdT;
        if (exchangeRate?.rate) body.exchange_rate = exchangeRate.rate;
        if (confirmDispatchFee) {
          body.confirm_dispatch_fee_payment = true;
        }
      }
      await api.post(`/sales/${sale.id}/delivery_pay_dispatch_fee/`, body);
      showNotification?.(
        needsDispatchFeePayment
          ? t('deliverySettlement.step3SuccessPay')
          : t('deliverySettlement.step3Success'),
        'success',
      );
      await Promise.resolve(onSuccess?.());
      onClose?.();
    } catch (err) {
      showNotification?.(
        err.response?.data?.error || err.response?.data?.detail || t('deliverySettlement.step3Err'),
        'error',
      );
    }
  };

  return (
    <div ref={cardRef} style={{ marginBottom: 20 }}>
      {activeStep === 0 ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>
            {t('deliverySettlement.allDone', { id: sale.id })}
          </p>
        </div>
      ) : null}

      {activeStep === 1 ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>{t('deliverySettlement.step1Title', { id: sale.id })}</h2>
          <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
            {t('deliverySettlement.step1Intro')}
          </p>
          {exchangeRate?.label ? (
            <p style={{ color: '#4a5568', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRate.label}</p>
          ) : exchangeRateError ? (
            <p style={{ color: '#b45309', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRateError}</p>
          ) : null}
          <div className="form-grid">
            <DeliveryPaymentAmountFields form={step1} setForm={setStep1} meta={meta1} t={t} />
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn-primary" onClick={handleStep1}>
              {t('deliverySettlement.step1Button')}
            </button>
          </div>
        </div>
      ) : null}

      {activeStep === 2 && !canShopRemittance ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>{t('deliverySettlement.settlementTitle', { id: sale.id })}</h2>
          <p style={{ color: '#666', margin: 0, fontSize: '0.9em', lineHeight: 1.45 }}>
            {t('deliverySettlement.step2NoPerm')}
          </p>
        </div>
      ) : null}

      {activeStep === 2 && canShopRemittance ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>{t('deliverySettlement.step2Title', { id: sale.id })}</h2>
          <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
            {t('deliverySettlement.step2Intro')}
          </p>
          {exchangeRate?.label ? (
            <p style={{ color: '#4a5568', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRate.label}</p>
          ) : exchangeRateError ? (
            <p style={{ color: '#b45309', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRateError}</p>
          ) : null}
          <form onSubmit={handleStep2}>
            <div className="form-grid">
              {step2.prepayment_amount && parseFloat(step2.prepayment_amount) > 0 ? (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>{t('deliverySettlement.prepaymentOnRecord')}</label>
                  <input readOnly style={{ background: '#f5f5f5' }} value={step2.prepayment_amount ?? ''} />
                </div>
              ) : null}
              <DeliveryPaymentAmountFields form={step2} setForm={setStep2} meta={meta2} t={t} />
              {meta2.needs && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '0.9em', color: '#555', lineHeight: 1.45 }}>
                    {t('completePay.shortfallHint')}
                  </p>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={step2.balance_shortfall_type === 'discount'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const def =
                          meta2.short > 0
                            ? (meta2.sc === 'UZS'
                              ? String(Math.round(meta2.short))
                              : meta2.short.toFixed(2))
                            : '';
                        setStep2({
                          ...step2,
                          balance_shortfall_type: checked ? 'discount' : '',
                          balance_shortfall_amount: checked
                            ? (step2.balance_shortfall_amount || def)
                            : '',
                        });
                      }}
                    />
                    <span>{t('completePay.discountOption')}</span>
                  </label>
                  {step2.balance_shortfall_type === 'discount' && (
                    <div style={{ marginTop: 10, maxWidth: 280 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
                        {t('completePay.discountAmountLabel', { currency: meta2.sc })}
                      </label>
                      <input
                        type="number"
                        step={meta2.sc === 'UZS' ? '1' : '0.01'}
                        min="0"
                        value={step2.balance_shortfall_amount ?? ''}
                        onChange={(e) =>
                          setStep2({ ...step2, balance_shortfall_amount: e.target.value })
                        }
                      />
                    </div>
                  )}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 12 }}>
                    <input
                      type="checkbox"
                      checked={!!step2.apply_currency_conversion_difference}
                      onChange={(e) =>
                        setStep2({
                          ...step2,
                          apply_currency_conversion_difference: e.target.checked,
                        })
                      }
                    />
                    <span>{t('completePay.conversionDifferenceOption')}</span>
                  </label>
                </div>
              )}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('deliverySettlement.noteOptional')}</label>
                <textarea
                  rows={3}
                  value={step2Note}
                  onChange={(e) => setStep2Note(e.target.value)}
                  placeholder={t('deliverySettlement.notePlaceholder')}
                  style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('deliverySettlement.step2Button')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activeStep === 3 && !canPayDispatchFee ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>{t('deliverySettlement.settlementTitle', { id: sale.id })}</h2>
          <p style={{ color: '#666', margin: 0, fontSize: '0.9em', lineHeight: 1.45 }}>
            {t('deliverySettlement.step3NoPerm')}
          </p>
        </div>
      ) : null}

      {activeStep === 3 && canPayDispatchFee ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>
            {needsDispatchFeePayment
              ? t('deliverySettlement.step3TitlePay', { id: sale.id })
              : t('deliverySettlement.step3TitleComplete', { id: sale.id })}
          </h2>
          <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
            {needsDispatchFeePayment
              ? t('deliverySettlement.step3IntroPay')
              : t('deliverySettlement.step3IntroFree')}
          </p>
          {needsDispatchFeePayment ? (
            <form onSubmit={handleStep3}>
              {exchangeRate?.label ? (
                <p style={{ color: '#4a5568', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRate.label}</p>
              ) : exchangeRateError ? (
                <p style={{ color: '#b45309', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRateError}</p>
              ) : null}
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
                    <strong>{t('deliverySettlement.dispatchFeeDue')}</strong>{' '}
                    {formatDisplayAmount(dispatchFeeDue, dispatchFeeCurrency)}
                    {step3CombinedTotal != null ? (
                      <>
                        {' '}
                        ·{' '}
                        <strong>
                          {paymentNeedsCbuConversion(
                            step3Pay.uzs,
                            step3Pay.usd,
                            dispatchFeeCurrency,
                          )
                            ? t('completePay.totalAtCbuIn', { currency: dispatchFeeCurrency })
                            : t('sellReserved.entered', { currency: dispatchFeeCurrency })}
                        </strong>{' '}
                        {formatDisplayAmount(step3CombinedTotal, dispatchFeeCurrency)}
                      </>
                    ) : step3Pay.uzs || step3Pay.usd ? (
                      <span style={{ color: '#b45309' }}> — {t('deliverySettlement.loadingCbu')}</span>
                    ) : null}
                  </p>
                </div>
                <div className="form-group">
                  <label>{t('currency.uzs', { ns: 'common' })}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={step3Pay.uzs}
                    onChange={(e) => setStep3Pay((prev) => ({ ...prev, uzs: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>{t('currency.usd', { ns: 'common' })}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={step3Pay.usd}
                    onChange={(e) => setStep3Pay((prev) => ({ ...prev, usd: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {t('deliverySettlement.step3ButtonPay')}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleStep3}>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {t('deliverySettlement.step3ButtonComplete')}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn-edit" onClick={onClose}>
          {t('actions.close', { ns: 'common' })}
        </button>
      </div>
    </div>
  );
}
