import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  emptyPaymentFormState,
  buildPaymentFormDataFromSale,
  computePaymentShortfallMeta,
  buildCompleteSaleRequest,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const meta = computePaymentShortfallMeta(sale, paymentFormData);
      if (meta.mixed && meta.short > 0.01) {
        showNotification(
          'Pay in one currency only (UZS or USD) when the amount is less than the total, matching the sale list price currency.',
          'error'
        );
        return;
      }
      if (meta.needs && !paymentFormData.balance_shortfall_type) {
        showNotification('Select Discount or On credit for the remaining balance.', 'error');
        return;
      }

      if (paymentFormData.dispatch_payment_needed) {
        const dAmt = parseFloat(String(paymentFormData.dispatch_payment_amount).replace(',', '.')) || 0;
        if (dAmt <= 0) {
          showNotification('Enter the delivery / dispatch payment amount (or check dispatch setup).', 'error');
          return;
        }
      }

      if (meta.needs && !String(paymentFormData.completion_notes || '').trim()) {
        showNotification(
          'Please enter notes when the payment is less than the amount due (discount or on credit).',
          'error'
        );
        return;
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
        Fill in any combination of payment methods. Leave a field empty or 0 if not used.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {paymentFormData.prepayment_amount && parseFloat(paymentFormData.prepayment_amount) > 0 && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Prepayment Already Received</label>
              <input
                type="number"
                step="0.01"
                value={paymentFormData.prepayment_amount}
                readOnly
                style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
              />
              <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                This amount was received when the order was created
              </small>
            </div>
          )}
          <div className="form-group">
            <label>UZS — Cash</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={paymentFormData.uzs_cash}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs_cash: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>UZS — Card</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={paymentFormData.uzs_card}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs_card: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>USD — Cash</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={paymentFormData.usd_cash}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, usd_cash: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>USD — Card</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={paymentFormData.usd_card}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, usd_card: e.target.value })}
            />
          </div>

          {shortfallMeta.due != null && !Number.isNaN(shortfallMeta.due) && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
                <strong>Amount due (after prepayment):</strong> {shortfallMeta.due.toFixed(2)} {shortfallMeta.sc || 'USD'}
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
            <div
              className="form-group"
              style={{
                gridColumn: '1 / -1',
                alignItems: 'flex-start',
                maxWidth: '100%',
              }}
            >
              <div
                style={{
                  color: '#2c3e50',
                  fontWeight: 500,
                  fontSize: 14,
                  marginBottom: 4,
                }}
              >
                Remainder {shortfallMeta.short != null ? shortfallMeta.short.toFixed(2) : ''} {shortfallMeta.sc}:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    width: 'auto',
                    maxWidth: '100%',
                  }}
                >
                  <input
                    type="radio"
                    name="sf"
                    checked={paymentFormData.balance_shortfall_type === 'discount'}
                    onChange={() =>
                      setPaymentFormData({ ...paymentFormData, balance_shortfall_type: 'discount' })
                    }
                  />
                  <span>Discount</span>
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    width: 'auto',
                    maxWidth: '100%',
                  }}
                >
                  <input
                    type="radio"
                    name="sf"
                    checked={paymentFormData.balance_shortfall_type === 'on_credit'}
                    onChange={() =>
                      setPaymentFormData({ ...paymentFormData, balance_shortfall_type: 'on_credit' })
                    }
                  />
                  <span>On credit</span>
                </label>
              </div>
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
                  value={paymentFormData.dispatch_payment_amount}
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
              <div className="form-group">
                <label>Dispatch Payment Type</label>
                <select
                  value={paymentFormData.dispatch_payment_type || 'cash'}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, dispatch_payment_type: e.target.value })
                  }
                  required={paymentFormData.dispatch_payment_needed}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes{shortfallMeta.needs ? ' *' : ''}</label>
            <textarea
              rows={3}
              value={paymentFormData.completion_notes}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, completion_notes: e.target.value })}
              required={shortfallMeta.needs}
            />
            {!shortfallMeta.needs ? (
              <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                Optional when the entered payment equals or exceeds the amount due.
              </small>
            ) : (
              <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                Required when selecting discount or on credit for the unpaid remainder.
              </small>
            )}
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
