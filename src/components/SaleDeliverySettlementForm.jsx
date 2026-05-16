import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  buildPaymentFormDataFromSale,
  computePaymentShortfallMeta,
  emptyPaymentFormState,
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
  const [step1SellingPrice, setStep1SellingPrice] = useState('');
  const [step1SaleCurrency, setStep1SaleCurrency] = useState('USD');
  const [step2Note, setStep2Note] = useState('');

  const [dispAmount, setDispAmount] = useState('');
  const [dispCurrency, setDispCurrency] = useState('UZS');

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
      setStep1SellingPrice(sale.selling_price != null && sale.selling_price !== '' ? String(sale.selling_price) : '');
      setStep1SaleCurrency(sale.sale_currency || 'USD');
    }
  }, [sale?.id, sale?.delivery_customer_paid_at, sale?.selling_price, sale?.sale_currency]);

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

  const handleStep1 = async () => {
    const sp = parseFloat(String(step1SellingPrice).replace(',', '.'));
    if (Number.isNaN(sp) || sp < 0) {
      showNotification?.('Enter a valid selling price (0 or greater).', 'error');
      return;
    }
    if (step1SaleCurrency !== 'USD' && step1SaleCurrency !== 'UZS') {
      showNotification?.('Sale currency must be USD or UZS.', 'error');
      return;
    }
    const qty = sale.quantity ?? 1;
    const lineTotalEntered = sp * qty;
    const actualSpRaw = sale.selling_price;
    const actualSp = parseFloat(actualSpRaw != null && actualSpRaw !== '' ? String(actualSpRaw).replace(',', '.') : '');
    const actualCurrency = sale.sale_currency || 'USD';
    const actualSpFmt = Number.isFinite(actualSp) ? `${actualSp.toFixed(2)} ${actualCurrency}` : '—';
    const enteredSpFmt = `${sp.toFixed(2)} ${step1SaleCurrency}`;
    const actualLineFmt = Number.isFinite(actualSp)
      ? `${(actualSp * qty).toFixed(2)} ${actualCurrency}`
      : '—';
    const enteredLineFmt = `${lineTotalEntered.toFixed(2)} ${step1SaleCurrency}`;
    const ok = window.confirm(
      [
        'Confirm “Payment received by dispatch”?',
        '',
        `Sale #${sale.id} · ${qty} × ${productLabel}`,
        '',
        `Actual on record · selling price (per unit): ${actualSpFmt}`,
        `Entered · selling price (per unit): ${enteredSpFmt}`,
        '',
        `Actual on record · line total (${qty} × price): ${actualLineFmt}`,
        `Entered · line total (${qty} × price): ${enteredLineFmt}`,
        '',
        'This records courier hand-off only (no shop cash movement yet).',
      ].join('\n')
    );
    if (!ok) return;

    try {
      await api.post(`/sales/${sale.id}/delivery_customer_paid/`, {
        selling_price: sp,
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
          'Proceed?',
        ].join('\n')
      );
      if (!okShop) return;

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
        const plannedFmt = `${plannedAmt.toFixed(2)} ${plannedCcy}`;
        const enteredFmt = `${amt.toFixed(2)} ${dispCurrency}`;
        const tol = plannedCcy === 'UZS' ? 1 : 0.02;
        const matchesOnRecord =
          plannedCcy === dispCurrency && Math.abs(plannedAmt - amt) <= tol;
        const step3ConfirmLines = [
          'Confirm “Pay for dispatch & complete sale”?',
          '',
          `Sale #${sale.id}`,
          '',
          `Planned dispatch fee on record (actual): ${plannedFmt}`,
          `Delivery payment entered: ${enteredFmt}`,
          '',
          matchesOnRecord
            ? 'Entered matches dispatch on record (within rounding).'
            : 'Entered amount or currency differs from dispatch on record — the dispatch fee will be updated to match this payment.',
          '',
          'This withdraws from shop balances and marks the sale completed.',
        ];
        const ok = window.confirm(step3ConfirmLines.join('\n'));
        if (!ok) return;
        body.dispatch_payment_amount = amt;
        body.dispatch_payment_currency = dispCurrency;
      } else {
        const ok = window.confirm(
          [
            'Complete this sale without a dispatch fee payout?',
            '',
            `Sale #${sale.id}`,
            'The sale will be marked Completed.',
          ].join('\n')
        );
        if (!ok) return;
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
    <div style={{ marginBottom: 20 }}>
      {activeStep === 0 ? (
        <p style={{ color: '#666', marginBottom: 20, fontSize: '0.9rem' }}>
          All settlement steps are already recorded for this sale.
        </p>
      ) : (
        <p style={{ color: '#666', marginBottom: 16, fontSize: '0.88rem' }}>
          Sale #{sale.id}
        </p>
      )}

      {activeStep === 1 ? (
      <div className="form-card" style={{ marginBottom: 20 }}>
        <h2>Payment received by dispatch</h2>
        <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9em' }}>
          The courier delivered and collected payment from the customer. Recording this confirms that hand‑off only
          (no shop cash ledger change yet). You can adjust the list price and currency before confirming.
        </p>
        <div className="form-grid">
          <div className="form-group">
            <label>Selling price (per unit)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={step1SellingPrice}
              onChange={(e) => setStep1SellingPrice(e.target.value)}
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
        <h2>Payment received by shop</h2>
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
        <h2>{needsDispatchFeePayment ? 'Pay for dispatch & complete sale' : 'Complete sale'}</h2>
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
