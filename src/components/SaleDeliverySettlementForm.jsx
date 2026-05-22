import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import {
  buildPaymentFormDataFromSale,
  computeAdvanceRemainingDue,
  computePaymentShortfallMeta,
  emptyPaymentFormState,
  saleDiscountAmountPerUnit,
} from '../utils/saleCompletePayHelpers';

/**
 * Shop delivery settlement: each open shows one step’s card matching the actions column (by sale timestamps).
 * Steps 1–2 close after save so the grid shows the next action; step 3 calls onSuccess and closes.
 */
export default function SaleDeliverySettlementForm({
  sale: saleProp,
  onClose,
  onSuccess,
  /** Runs after steps 1 or 2 save — refresh grids before overlay closes */
  onAfterStepRecorded,
  showNotification,
}) {
  const [sale, setSale] = useState(saleProp);
  const [step2, setStep2] = useState(() => emptyPaymentFormState());
  const [step1TotalCollected, setStep1TotalCollected] = useState('');
  const [step1SaleCurrency, setStep1SaleCurrency] = useState('USD');
  const [step2Note, setStep2Note] = useState('');

  const [dispAmount, setDispAmount] = useState('');
  const [dispCurrency, setDispCurrency] = useState('UZS');
  const cardRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(t);
  }, [saleProp?.id]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!saleProp?.id) return;
      try {
        const { data } = await api.get(`/sales/${saleProp.id}/`);
        if (!cancel) setSale(data);
      } catch {
        /* use prop */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [saleProp?.id]);

  useEffect(() => {
    if (!sale) {
      setStep2(emptyPaymentFormState());
      return;
    }
    const fd = buildPaymentFormDataFromSale(sale);
    fd.dispatch_payment_needed = false;
    fd.dispatch_payment_amount = '';
    setStep2(fd);
  }, [sale]);

  useEffect(() => {
    if (!sale?.id) return;
    if (!sale.delivery_customer_paid_at) {
      const expectedTotal = computeAdvanceRemainingDue(sale);
      setStep1TotalCollected(expectedTotal > 0 ? expectedTotal.toFixed(2) : '');
      setStep1SaleCurrency(sale.sale_currency || 'USD');
    }
  }, [sale]);

  useEffect(() => {
    if (!sale?.id) return;
    if (!sale.delivery_shop_remittance_at && sale.delivery_customer_paid_at) {
      setStep2Note('');
    }
  }, [sale?.id, sale?.delivery_customer_paid_at, sale?.delivery_shop_remittance_at]);

  const d = sale?.dispatch_info || null;
  const uzFee = d ? parseFloat(d.delivery_cost_uzs ?? 0) || 0 : 0;
  const usFee = d ? parseFloat(d.delivery_cost ?? 0) || 0 : 0;

  useEffect(() => {
    if (!d) return;
    if (uzFee > 0) {
      setDispCurrency('UZS');
      setDispAmount(d.delivery_cost_uzs != null && String(d.delivery_cost_uzs) !== '' ? String(d.delivery_cost_uzs) : '');
    } else if (usFee > 0) {
      setDispCurrency('USD');
      setDispAmount(d.delivery_cost != null && String(d.delivery_cost) !== '' ? String(d.delivery_cost) : '');
    } else {
      setDispAmount('');
    }
  }, [d, uzFee, usFee]);

  if (!sale) return null;

  const meta2 = computePaymentShortfallMeta(sale, step2);

  const s1 = !!sale.delivery_customer_paid_at;
  const s2 = !!sale.delivery_shop_remittance_at;
  const s3 = !!sale.delivery_dispatcher_fee_completed_at;

  /** 1–3 = which single card is shown; 0 = all recorded (normally the modal closes on step 3). */
  const activeStep = !s1 ? 1 : !s2 ? 2 : !s3 ? 3 : 0;

  const needsDispatchFeePayment = !!(d && !d.is_paid && (uzFee > 0 || usFee > 0));

  const productLabel = sale.product_detail
    ? [sale.product_detail.brand, sale.product_detail.model].filter(Boolean).join(' ').trim() || 'Product'
    : 'Product';

  const amountTolerance = (currency) => (currency === 'UZS' ? 1 : 0.02);

  const paymentMatchesExpectedDue = (due, sc, uzsT, usdT) => {
    if (due == null || Number.isNaN(due)) return false;
    const tol = amountTolerance(sc);
    if (sc === 'USD') {
      return uzsT === 0 && Math.abs(usdT - due) <= tol;
    }
    return usdT === 0 && Math.abs(uzsT - due) <= tol;
  };

  const handleStep1 = async () => {
    const totalCollected = parseFloat(String(step1TotalCollected).replace(',', '.'));
    if (Number.isNaN(totalCollected) || totalCollected < 0) {
      showNotification?.('Enter a valid total amount collected (0 or greater).', 'error');
      return;
    }
    if (step1SaleCurrency !== 'USD' && step1SaleCurrency !== 'UZS') {
      showNotification?.('Sale currency must be USD or UZS.', 'error');
      return;
    }
    const qty = sale.quantity ?? 1;
    const actualCurrency = sale.sale_currency || 'USD';
    const actualDueAtDoor = computeAdvanceRemainingDue(sale);
    const discPerUnit = saleDiscountAmountPerUnit(sale);
    const discNote =
      discPerUnit > 0
        ? ` (includes $${discPerUnit.toFixed(2)}/unit discount off list)`
        : '';
    const actualFmt =
      actualDueAtDoor != null && !Number.isNaN(actualDueAtDoor)
        ? `${actualDueAtDoor.toFixed(2)} ${actualCurrency}${discNote}`
        : '—';
    const enteredFmt = `${totalCollected.toFixed(2)} ${step1SaleCurrency}`;
    const amountChanged =
      actualDueAtDoor == null ||
      Number.isNaN(actualDueAtDoor) ||
      Math.abs(totalCollected - actualDueAtDoor) > amountTolerance(actualCurrency) ||
      step1SaleCurrency !== actualCurrency;
    if (amountChanged) {
      const ok = window.confirm(
        [
          'Confirm “Payment received by dispatch”?',
          '',
          `Sale #${sale.id} · ${qty} × ${productLabel}`,
          '',
          `Expected on record (total collected from customer): ${actualFmt}`,
          `Entered · total collected: ${enteredFmt}`,
          '',
          'Amount or currency differs from the sale on record.',
          'This records courier hand-off only (no shop cash movement yet).',
        ].join('\n')
      );
      if (!ok) return;
    }

    try {
      await api.post(`/sales/${sale.id}/delivery_customer_paid/`, {
        total_collected: totalCollected,
        sale_currency: step1SaleCurrency,
      });
      showNotification?.('Payment received by dispatch has been recorded.', 'success');
      await Promise.resolve(onAfterStepRecorded?.());
      onClose?.();
    } catch (e) {
      showNotification?.(e.response?.data?.error || e.response?.data?.detail || 'Could not save step 1', 'error');
    }
  };

  const handleStep2 = async (e) => {
    e.preventDefault();
    try {
      if (meta2.mixed && meta2.short > 0.01) {
        showNotification?.(
          'Pay in one currency only (UZS or USD), matching the sale list price currency, when paying less than the total.',
          'error'
        );
        return;
      }
      if (
        meta2.needs &&
        step2.balance_shortfall_type !== 'discount'
      ) {
        showNotification?.(
          'Payment is below the amount due. Select Discount to record the remainder, or collect more.',
          'error'
        );
        return;
      }
      const eu = parseFloat(step2.uzs) || 0;
      const ed = parseFloat(step2.usd) || 0;
      const paymentChanged =
        meta2.mixed ||
        meta2.hasOverpayment ||
        (meta2.needs && step2.balance_shortfall_type === 'discount') ||
        !paymentMatchesExpectedDue(meta2.due, meta2.sc, eu, ed);

      if (paymentChanged) {
        const dueLines =
          meta2.due != null && !Number.isNaN(meta2.due) && meta2.sc
            ? [`Amount due / actual (${meta2.sc}): ${meta2.due.toFixed(2)} ${meta2.sc}`]
            : [];
        const enteredMainLines =
          meta2.paid != null && !Number.isNaN(meta2.paid) && meta2.sc
            ? [`Payment entered (in ${meta2.sc}, from UZS + USD buckets): ${meta2.paid.toFixed(2)} ${meta2.sc}`]
            : [];
        const overLines =
          meta2.hasOverpayment && meta2.due != null && meta2.paid != null && meta2.overpaymentAmount != null
            ? [
                '',
                `Overpayment warning: entered is ${meta2.paid.toFixed(2)} ${meta2.sc}; due is ${meta2.due.toFixed(2)} ${meta2.sc}; excess ${meta2.overpaymentAmount.toFixed(2)} ${meta2.sc}.`,
              ]
            : [];

        const okShop = window.confirm(
          [
            'Confirm “Payment received by shop”?',
            '',
            ...dueLines,
            ...enteredMainLines,
            '',
            `Entered · UZS: ${eu.toFixed(2)}`,
            `Entered · USD: ${ed.toFixed(2)}`,
            ...overLines,
            '',
            'Amount or currency differs from what is due on record.',
            'Proceed?',
          ].join('\n')
        );
        if (!okShop) return;
      }

      const body = {
        uzs: parseFloat(step2.uzs) || 0,
        usd: parseFloat(step2.usd) || 0,
      };
      if (meta2.needs && step2.balance_shortfall_type === 'discount') {
        body.balance_shortfall_type = 'discount';
      }
      const trimmedNote = String(step2Note || '').trim();
      if (trimmedNote) {
        body.delivery_shop_remittance_note = trimmedNote;
      }
      await api.post(`/sales/${sale.id}/delivery_shop_received_payment/`, body);
      showNotification?.('Payment received by shop has been recorded.', 'success');
      await Promise.resolve(onAfterStepRecorded?.());
      onClose?.();
    } catch (err) {
      showNotification?.(
        err.response?.data?.error || err.response?.data?.detail || 'Could not save step 2',
        'error'
      );
    }
  };

  const handleStep3 = async (e) => {
    e.preventDefault();
    try {
      const body = {};
      if (needsDispatchFeePayment) {
        const amt = parseFloat(String(dispAmount).replace(',', '.')) || 0;
        if (amt <= 0) {
          showNotification?.('Enter a positive delivery payment amount.', 'error');
          return;
        }
        const plannedAmt = uzFee > 0 ? uzFee : usFee;
        const plannedCcy = uzFee > 0 ? 'UZS' : 'USD';
        const tol = amountTolerance(plannedCcy);
        const dispatchPaymentChanged =
          plannedCcy !== dispCurrency || Math.abs(plannedAmt - amt) > tol;
        if (dispatchPaymentChanged) {
          const plannedFmt = `${plannedAmt.toFixed(2)} ${plannedCcy}`;
          const enteredFmt = `${amt.toFixed(2)} ${dispCurrency}`;
          const ok = window.confirm(
            [
              'Confirm “Pay for dispatch & complete sale”?',
              '',
              `Sale #${sale.id}`,
              '',
              `Planned dispatch fee on record (actual): ${plannedFmt}`,
              `Delivery payment entered: ${enteredFmt}`,
              '',
              'Entered amount or currency differs from dispatch on record — the dispatch fee will be updated to match this payment.',
              '',
              'This withdraws from shop balances and marks the sale completed.',
            ].join('\n')
          );
          if (!ok) return;
        }
        body.dispatch_payment_amount = amt;
        body.dispatch_payment_currency = dispCurrency;
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
        'error'
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
          The courier delivered and collected payment from the customer. Enter the full amount collected (same idea as
          step 2). This confirms hand‑off only — no shop cash ledger change yet.
        </p>
        <div className="form-grid">
          <div className="form-group">
            <label>Total amount collected ({step1SaleCurrency})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={step1TotalCollected}
              onChange={(e) => setStep1TotalCollected(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Sale currency</label>
            <select value={step1SaleCurrency} onChange={(e) => setStep1SaleCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
            </select>
          </div>
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
          Enter what the courier remitted to the shop (UZS and/or USD — same rules as Complete & Pay). This books
          sale income and clears receivable where applicable.
        </p>
          <form onSubmit={handleStep2}>
            <div className="form-grid">
              {step2.prepayment_amount && parseFloat(step2.prepayment_amount) > 0 ? (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Prepayment on record</label>
                  <input readOnly style={{ background: '#f5f5f5' }} value={step2.prepayment_amount ?? ''} />
                </div>
              ) : null}
              <div className="form-group">
                <label>UZS</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={step2.uzs ?? ''}
                  onChange={(e) => setStep2({ ...step2, uzs: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>USD</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={step2.usd ?? ''}
                  onChange={(e) => setStep2({ ...step2, usd: e.target.value })}
                />
              </div>

              {meta2.due != null && !Number.isNaN(meta2.due) && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
                    <strong>Amount due:</strong> {meta2.due.toFixed(2)} {meta2.sc || 'USD'}
                    {meta2.paid != null ? (
                      <>
                        {' '}
                        · <strong>Entered ({meta2.sc}):</strong> {meta2.paid.toFixed(2)}
                      </>
                    ) : null}
                  </p>
                </div>
              )}
              {meta2.needs && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '0.9em', color: '#555', lineHeight: 1.45 }}>
                    Payment is below the amount due. Choose{' '}
                    <strong>Discount</strong> to record the remainder, or increase the payment.
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
            ? 'Edit the delivery fee if needed — the planned dispatch totals will be updated to match what you confirm. Pays from shop balances and marks the sale Completed.'
            : 'No dispatch fee payout is configured. Submit to mark the sale Completed.'}
        </p>
        {needsDispatchFeePayment ? (
          <form onSubmit={handleStep3}>
            <div className="form-grid">
              <div className="form-group">
                <label>Delivery amount ({dispCurrency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dispAmount}
                  onChange={(e) => setDispAmount(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select value={dispCurrency} onChange={(e) => setDispCurrency(e.target.value)} required>
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                </select>
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
