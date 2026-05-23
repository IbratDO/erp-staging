import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import useCbuExchangeRate from '../hooks/useCbuExchangeRate';
import { formatDisplayAmount } from '../utils/currencyFormat';
import {
  buildPaymentFormDataFromSale,
  deliveryStep2PaymentFromStep1,
  computeAdvanceRemainingDue,
  computePaymentShortfallMeta,
  emptyPaymentFormState,
} from '../utils/saleCompletePayHelpers';
import {
  runSalePaymentSubmitFlow,
  combinedPaymentInSaleCurrency,
} from '../utils/salePaymentFlowHelpers';

function DeliveryPaymentAmountFields({ form, setForm, meta }) {
  return (
    <>
      <div className="form-group">
        <label>UZS</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={form.uzs ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, uzs: e.target.value }))}
        />
      </div>
      <div className="form-group">
        <label>USD</label>
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
            <strong>Amount due:</strong> {formatDisplayAmount(meta.due, meta.sc)}
            {meta.paid != null ? (
              <>
                {' '}
                · <strong>Entered ({meta.sc}):</strong> {formatDisplayAmount(meta.paid, meta.sc)}
              </>
            ) : meta.mixed ? (
              <span style={{ color: '#b45309' }}> — loading CBU rate…</span>
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
    const t = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(t);
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
    if (formInitSaleIdRef.current === sale.id) return;
    formInitSaleIdRef.current = sale.id;
    const fd = buildPaymentFormDataFromSale(sale);
    fd.dispatch_payment_needed = false;
    fd.dispatch_payment_amount = '';
    const step2FromStep1 = deliveryStep2PaymentFromStep1(sale);
    setStep1({ ...fd });
    setStep2(
      step2FromStep1
        ? { ...fd, uzs: step2FromStep1.uzs, usd: step2FromStep1.usd }
        : { ...fd },
    );
  }, [sale?.id, saleLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sale?.id || saleLoading || sale.delivery_customer_paid_at) return;
    if (step1PrefillSaleIdRef.current === sale.id) return;
    step1PrefillSaleIdRef.current = sale.id;
    const due = computeAdvanceRemainingDue(sale);
    const sc = sale.sale_currency || 'USD';
    if (sc === 'UZS' && due > 0) {
      setStep1((prev) => ({ ...prev, uzs: String(Math.round(due)), usd: '' }));
    } else if (due > 0) {
      setStep1((prev) => ({ ...prev, usd: due.toFixed(2), uzs: '' }));
    }
  }, [sale?.id, saleLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const meta1 = computePaymentShortfallMeta(sale, step1, cbuRate);
  const meta2 = computePaymentShortfallMeta(sale, step2, cbuRate);
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
    ? [sale.product_detail.brand, sale.product_detail.model].filter(Boolean).join(' ').trim() || 'Product'
    : 'Product';

  const handleStep1 = async () => {
    const sc = sale.sale_currency || 'USD';
    const uzsT = parseFloat(step1.uzs) || 0;
    const usdT = parseFloat(step1.usd) || 0;
    if (uzsT + usdT === 0) {
      showNotification?.('Enter at least one amount collected from the customer.', 'error');
      return;
    }
    const needsCbuRate =
      (uzsT > 0 && usdT > 0) ||
      (sc === 'USD' && uzsT > 0 && usdT === 0) ||
      (sc === 'UZS' && usdT > 0 && uzsT === 0);
    if (needsCbuRate && !cbuRate) {
      showNotification?.(
        exchangeRateError || 'Exchange rate is still loading. Try again in a moment.',
        'error',
      );
      return;
    }
    const totalInSaleCurrency = combinedPaymentInSaleCurrency(sale, step1.uzs, step1.usd, cbuRate);
    if (totalInSaleCurrency == null) {
      showNotification?.('Could not calculate total collected.', 'error');
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
          'Confirm “Payment received by dispatch”?',
          '',
          `Sale #${sale.id} · ${productLabel}`,
          '',
          `Expected on record: ${formatDisplayAmount(due, sc)}`,
          `Entered (in ${sc}, at CBU rate): ${formatDisplayAmount(totalInSaleCurrency, sc)}`,
          `UZS: ${uzsT.toFixed(2)} · USD: ${usdT.toFixed(2)}`,
          '',
          'This records courier hand-off only (no shop cash movement yet).',
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
      showNotification?.('Payment received by dispatch has been recorded.', 'success');
      await Promise.resolve(onAfterStepRecorded?.());
      onClose?.();
    } catch (e) {
      showNotification?.(e.response?.data?.error || e.response?.data?.detail || 'Could not save step 1', 'error');
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
      showNotification?.('Payment received by shop has been recorded.', 'success');
      await Promise.resolve(onAfterStepRecorded?.());
      onClose?.();
    } catch (err) {
      showNotification?.(
        err.response?.data?.error || err.response?.data?.detail || 'Could not save step 2',
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
          showNotification?.('Enter at least one amount for the dispatch fee.', 'error');
          return;
        }
        if ((uzsT > 0 && usdT > 0) || (dispatchFeeCurrency === 'USD' && uzsT > 0) || (dispatchFeeCurrency === 'UZS' && usdT > 0)) {
          if (!cbuRate) {
            showNotification?.(
              exchangeRateError || 'Exchange rate is still loading. Try again in a moment.',
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
          showNotification?.('Could not calculate dispatch payment total.', 'error');
          return;
        }
        const tol = dispatchFeeCurrency === 'UZS' ? 1 : 0.02;
        if (Math.abs(paidTotal - dispatchFeeDue) > tol) {
          const ok = window.confirm(
            [
              'Confirm “Pay for dispatch & complete sale”?',
              '',
              `Planned dispatch fee: ${formatDisplayAmount(dispatchFeeDue, dispatchFeeCurrency)}`,
              `Payment entered (at CBU): ${formatDisplayAmount(paidTotal, dispatchFeeCurrency)}`,
              `UZS: ${uzsT.toFixed(2)} · USD: ${usdT.toFixed(2)}`,
              '',
              'Amount differs from dispatch on record — fee will be updated to match.',
              'Proceed?',
            ].join('\n'),
          );
          if (!ok) return;
        }
        body.uzs = uzsT;
        body.usd = usdT;
        if (exchangeRate?.rate) body.exchange_rate = exchangeRate.rate;
      }
      await api.post(`/sales/${sale.id}/delivery_pay_dispatch_fee/`, body);
      showNotification?.(
        needsDispatchFeePayment
          ? 'Pay for dispatch completed — sale is now completed.'
          : 'Sale completed.',
        'success',
      );
      await Promise.resolve(onSuccess?.());
      onClose?.();
    } catch (err) {
      showNotification?.(
        err.response?.data?.error || err.response?.data?.detail || 'Could not complete step 3',
        'error',
      );
    }
  };

  return (
    <div ref={cardRef} style={{ marginBottom: 20 }}>
      {activeStep === 0 ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>
            All settlement steps are already recorded for sale #{sale.id}.
          </p>
        </div>
      ) : null}

      {activeStep === 1 ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>Payment received by dispatch — Sale #{sale.id}</h2>
          <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
            Enter what the courier collected from the customer (UZS and/or USD; mixed amounts use the CBU rate).
            Hand-off only — no shop cash movement yet.
          </p>
          {exchangeRate?.label ? (
            <p style={{ color: '#4a5568', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRate.label}</p>
          ) : exchangeRateError ? (
            <p style={{ color: '#b45309', marginBottom: 12, fontSize: '0.85em' }}>{exchangeRateError}</p>
          ) : null}
          <div className="form-grid">
            <DeliveryPaymentAmountFields form={step1} setForm={setStep1} meta={meta1} />
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn-primary" onClick={handleStep1}>
              Payment received by dispatch
            </button>
          </div>
        </div>
      ) : null}

      {activeStep === 2 ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>Payment received by shop — Sale #{sale.id}</h2>
          <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
            Enter what the courier remitted to the shop (UZS and/or USD — same rules as Complete & Pay). Books sale
            income and clears receivable where applicable.
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
                  <label>Prepayment on record</label>
                  <input readOnly style={{ background: '#f5f5f5' }} value={step2.prepayment_amount ?? ''} />
                </div>
              ) : null}
              <DeliveryPaymentAmountFields form={step2} setForm={setStep2} meta={meta2} />
              {meta2.needs && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '0.9em', color: '#555', lineHeight: 1.45 }}>
                    Payment is below the amount due. Choose <strong>Discount</strong> to record the remainder, or
                    collect more.
                  </p>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="delivery_settlement_shortfall"
                      checked={step2.balance_shortfall_type === 'discount'}
                      onChange={() => setStep2({ ...step2, balance_shortfall_type: 'discount' })}
                    />
                    <span>Discount (remainder after courier remittance)</span>
                  </label>
                </div>
              )}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Note (optional)</label>
                <textarea
                  rows={3}
                  value={step2Note}
                  onChange={(e) => setStep2Note(e.target.value)}
                  placeholder="Any note about this remittance…"
                  style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Record payment received by shop
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activeStep === 3 ? (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>
            {needsDispatchFeePayment
              ? `Pay for dispatch & complete sale — Sale #${sale.id}`
              : `Complete sale — Sale #${sale.id}`}
          </h2>
          <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
            {needsDispatchFeePayment
              ? 'Pay the dispatch fee from shop balances (UZS and/or USD at CBU rate). Marks the sale completed.'
              : 'No dispatch fee payout is configured. Submit to mark the sale completed.'}
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
                    <strong>Dispatch fee due:</strong>{' '}
                    {formatDisplayAmount(dispatchFeeDue, dispatchFeeCurrency)}
                    {step3CombinedTotal != null ? (
                      <>
                        {' '}
                        · <strong>Entered:</strong>{' '}
                        {formatDisplayAmount(step3CombinedTotal, dispatchFeeCurrency)}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="form-group">
                  <label>UZS</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={step3Pay.uzs}
                    onChange={(e) => setStep3Pay((prev) => ({ ...prev, uzs: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>USD</label>
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
                  Pay for dispatch & complete sale
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleStep3}>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Complete sale
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn-edit" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
