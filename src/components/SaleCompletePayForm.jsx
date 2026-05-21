import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDisplayAmount } from '../utils/currencyFormat';
import {
  emptyPaymentFormState,
  buildPaymentFormDataFromSale,
  computePaymentShortfallMeta,
  buildCompleteSaleRequest,
  validateAdvanceCompletionPayment,
  buildCrossCurrencyAdvanceConfirmMessage,
  saleHasOrderAdvance,
} from '../utils/saleCompletePayHelpers';

/**
 * Complete sale & pay (status → completed). Shared by Sales and Dispatchers tabs.
 */
export default function SaleCompletePayForm({ sale, onClose, onSuccess, showNotification }) {
  const [paymentFormData, setPaymentFormData] = useState(() => emptyPaymentFormState());

  useEffect(() => {
    if (sale) {
      setPaymentFormData(buildPaymentFormDataFromSale(sale));
    } else {
      setPaymentFormData(emptyPaymentFormState());
    }
  }, [sale]);

  if (!sale) return null;

  const shortfallMeta = computePaymentShortfallMeta(sale, paymentFormData);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const meta = computePaymentShortfallMeta(sale, paymentFormData);
      const advanceCheck = validateAdvanceCompletionPayment(
        sale,
        paymentFormData.uzs,
        paymentFormData.usd,
      );
      if (!advanceCheck.ok) {
        showNotification(advanceCheck.error, 'error');
        return;
      }
      if (advanceCheck.needsCrossCurrencyConfirm) {
        if (!window.confirm(buildCrossCurrencyAdvanceConfirmMessage(advanceCheck))) return;
      }

      if (meta.mixed && meta.short > 0.01 && !meta.hasAdvance) {
        showNotification(
          'Pay in one currency only (UZS or USD) when the amount is less than the total, matching the sale list price currency.',
          'error'
        );
        return;
      }

      if (meta.exceedsRemainingDue) {
        showNotification(
          `Payment cannot exceed the remaining amount due (${meta.due.toFixed(2)} ${meta.sc} after advance).`,
          'error',
        );
        return;
      }

      if (paymentFormData.dispatch_payment_needed) {
        const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
        if (dAmt <= 0) {
          showNotification('Enter the delivery / dispatch payment amount (or check dispatch setup).', 'error');
          return;
        }
      }

      if (
        meta.needs &&
        paymentFormData.balance_shortfall_type !== 'discount'
      ) {
        showNotification(
          'Payment is below the amount due. Select Discount to record the remainder, or collect more.',
          'error'
        );
        return;
      }

      if (meta.hasOverpayment && meta.due != null && meta.overpaymentAmount != null) {
        const msg = [
          `Payment entered is higher than amount due.`,
          `Due: ${meta.due.toFixed(2)} ${meta.sc} · Entered: ${meta.paid.toFixed(2)} ${meta.sc} · Excess: ${meta.overpaymentAmount.toFixed(2)} ${meta.sc}.`,
          `The extra amount will still be booked as collected sale payment.`,
          `Continue?`,
        ].join('\n\n');
        if (!window.confirm(msg)) return;
      }

      const requestData = buildCompleteSaleRequest(paymentFormData, meta);
      await api.post(`/sales/${sale.id}/update_status/`, requestData);
      showNotification('Sale completed successfully!', 'success');
      onSuccess?.();
      onClose?.();
    } catch (error) {
      console.error('Error completing sale:', error);
      showNotification(error.response?.data?.error || 'Error completing sale', 'error');
    }
  };

  const handleCancel = () => {
    setPaymentFormData(emptyPaymentFormState());
    onClose?.();
  };

  return (
    <div className="form-card" style={{ marginBottom: '20px' }}>
      <h2>Complete Sale #{sale.id}</h2>
      <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
        Enter the UZS and/or USD amount received.
      </p>
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
        <div>
          <strong>List price:</strong> {formatDisplayAmount(listUnit, sc)} per unit
          {qty > 1 ? ` · ${formatDisplayAmount(listTotal, sc)} total` : ''}
        </div>
        <div>
          <strong>Discount:</strong> {formatDisplayAmount(discountAmountPerUnit, sc)} per unit
          {saleDiscountTotal > 0 && qty > 1
            ? ` · ${formatDisplayAmount(saleDiscountTotal, sc)} total`
            : ''}
        </div>
        <div>
          <strong>Final price:</strong> {formatDisplayAmount(finalUnit, sc)} per unit
        </div>
        <div>
          <strong>Amount due:</strong> {formatDisplayAmount(finalDue, sc)}
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {paymentFormData.prepayment_amount && parseFloat(paymentFormData.prepayment_amount) > 0 && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Prepayment Already Received</label>
              <input
                type="number"
                step="0.01"
                value={paymentFormData.prepayment_amount ?? ''}
                readOnly
                style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
              />
              <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                This amount was received when the order was created
              </small>
            </div>
          )}
          <div className="form-group">
            <label>UZS</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={paymentFormData.uzs ?? ''}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>USD</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={paymentFormData.usd ?? ''}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, usd: e.target.value })}
            />
          </div>

          {shortfallMeta.due != null && !Number.isNaN(shortfallMeta.due) && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
                <strong>Amount due (after prepayment):</strong>{' '}
                {shortfallMeta.sc === 'UZS'
                  ? `${shortfallMeta.due.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS`
                  : `${shortfallMeta.due.toFixed(2)} USD`}
                {saleHasOrderAdvance(sale) && (
                  <>
                    {' '}
                    · Max in {shortfallMeta.sc}: same amount · remainder may be collected in{' '}
                    {shortfallMeta.sc === 'USD' ? 'UZS' : 'USD'} (confirmation required)
                  </>
                )}
                {shortfallMeta.paid != null && (
                  <>
                    {' '}
                    · <strong>Entered in {shortfallMeta.sc} fields:</strong> {shortfallMeta.paid.toFixed(2)}
                  </>
                )}
              </p>
            </div>
          )}
          {shortfallMeta.needs && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: '#555', lineHeight: 1.45 }}>
                Payment is below the amount due. To complete, choose{' '}
                <strong>Discount</strong> so the unpaid remainder{' '}
                {shortfallMeta.short != null ? `(${shortfallMeta.short.toFixed(2)} ${shortfallMeta.sc}) ` : ''}
                is recorded as a discount, or increase the payment.
              </p>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="sale_complete_shortfall"
                  checked={paymentFormData.balance_shortfall_type === 'discount'}
                  onChange={() =>
                    setPaymentFormData({ ...paymentFormData, balance_shortfall_type: 'discount' })
                  }
                />
                <span>Discount (record remainder as discount)</span>
              </label>
            </div>
          )}

          {paymentFormData.dispatch_payment_needed && (
            <>
              <div
                className="form-group"
                style={{ gridColumn: '1 / -1', marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e0e0e0' }}
              >
                <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>Dispatch payment</h3>
              </div>
              <div className="form-group">
                <label>Dispatch Payment Amount ({paymentFormData.dispatch_payment_currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentFormData.dispatch_payment_amount ?? ''}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, dispatch_payment_amount: e.target.value })
                  }
                  required={paymentFormData.dispatch_payment_needed}
                />
              </div>
              <div className="form-group">
                <label>Dispatch Payment Currency</label>
                <select
                  value={paymentFormData.dispatch_payment_currency || 'UZS'}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, dispatch_payment_currency: e.target.value })
                  }
                  required={paymentFormData.dispatch_payment_needed}
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea
              rows={3}
              value={paymentFormData.completion_notes ?? ''}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, completion_notes: e.target.value })}
            />
            <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
              {shortfallMeta.needs
                ? 'Optional. Choosing Discount still records the remainder; add a note only if you want it on the completion record.'
                : 'Optional when the entered payment equals or exceeds the amount due.'}
            </small>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary">
            Complete Sale
          </button>
          <button type="button" className="btn-edit" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
