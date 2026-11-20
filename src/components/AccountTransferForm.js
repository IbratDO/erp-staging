import React, { useMemo, useState } from 'react';
import api from '../utils/api';
import useAppTranslation from '../hooks/useAppTranslation';
import AmountInput from './AmountInput';
import BusyForm, { SubmitButton } from './BusyForm';
import { LEDGER_BUCKETS } from '../utils/ledgerBuckets';
import { accountCurrency } from '../utils/moneyAccounts';

/**
 * Moving the shop's own money between its own accounts — Phase 2, slice 6.
 *
 * The sibling of `CurrencyConversionForm`, and a separate form for the same reason the two are
 * separate models: a conversion changes **what currency** money is in, so it needs a rate and
 * shows the difference it books to profit. A transfer changes **which account** holds it at the
 * same value, so there is no rate and no gain — and a form that tried to be both would show a
 * rate field that is meaningless half the time.
 *
 * **The "to" list excludes the chosen "from" and every other currency.** The server refuses both
 * (`same_account`, `cross_currency`), but a picker that offers a choice the server will reject
 * reads as a broken page. Crossing currencies points the user at the conversion form instead,
 * because that is the thing they actually want.
 *
 * Both amounts are whole-soum when the account is a soum one — `AmountInput`'s `wholeOnly`, the
 * mask layer of the three the whole-soum rule lives in. The server refuses tiyin too; this just
 * means nobody has to be told after pressing the button.
 */
const AccountTransferForm = ({ onSuccess, onCancel }) => {
  const { t } = useAppTranslation(['moneyBalance', 'common']);

  const [form, setForm] = useState({
    from_account: '',
    to_account: '',
    amount: '',
    fee: '',
    transfer_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [error, setError] = useState('');
  const [needsClosedReason, setNeedsClosedReason] = useState(false);
  const [closedReason, setClosedReason] = useState('');

  const currency = accountCurrency(form.from_account);

  /** Where this money may go: same currency, and not back into the account it came from. */
  const destinations = useMemo(() => {
    if (!form.from_account) return [];
    return LEDGER_BUCKETS.filter(
      (b) => b.value !== form.from_account && accountCurrency(b.value) === currency,
    );
  }, [form.from_account, currency]);

  const pickSource = (value) => {
    setForm((prev) => ({
      ...prev,
      from_account: value,
      // Drop a destination that no longer belongs to the new source's currency, or that is now
      // the source itself. Without this the form would post a pair the server refuses, and the
      // user would get an error about a field that looks right.
      to_account:
        prev.to_account
        && prev.to_account !== value
        && accountCurrency(prev.to_account) === accountCurrency(value)
          ? prev.to_account
          : '',
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/cash-balance/transfer-between-accounts/', {
        from_account: form.from_account,
        to_account: form.to_account,
        amount: form.amount || 0,
        fee: form.fee || 0,
        transfer_date: form.transfer_date,
        notes: String(form.notes || '').trim(),
        closed_period_reason: closedReason || undefined,
      });
      setNeedsClosedReason(false);
      setClosedReason('');
      if (onSuccess) await onSuccess(res.data);
    } catch (err) {
      const data = err.response?.data || {};
      const code = Array.isArray(data.code) ? data.code[0] : data.code;
      // `period_closed_reason_required` means the owner may post it but has to say why, so the
      // reason box appears only once the server has asked for it. A cashier moving today's money
      // never sees it.
      setNeedsClosedReason(code === 'period_closed_reason_required');
      setError(
        (Array.isArray(data.error) ? data.error[0] : data.error)
        || data.detail
        || t('transfer.failed'),
      );
    }
  };

  const ready = form.from_account && form.to_account && parseFloat(form.amount) > 0;

  return (
    <BusyForm onSubmit={submit}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="xfer-from">{t('transfer.from')}</label>
          <select
            id="xfer-from"
            value={form.from_account}
            onChange={(e) => pickSource(e.target.value)}
            required
          >
            <option value="">{t('transfer.choose')}</option>
            {LEDGER_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>{t(b.labelKey)}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="xfer-to">{t('transfer.to')}</label>
          <select
            id="xfer-to"
            value={form.to_account}
            onChange={(e) => setForm({ ...form, to_account: e.target.value })}
            disabled={!form.from_account}
            required
          >
            <option value="">{t('transfer.choose')}</option>
            {destinations.map((b) => (
              <option key={b.value} value={b.value}>{t(b.labelKey)}</option>
            ))}
          </select>
          {form.from_account && (
            <small className="form-hint">{t('transfer.sameCurrencyHint')}</small>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="xfer-amount">{t('transfer.amount')}</label>
          <AmountInput
            id="xfer-amount"
            placeholder="0"
            currency={currency || 'UZS'}
            wholeOnly={currency === 'UZS'}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="xfer-fee">{t('transfer.fee')}</label>
          <AmountInput
            id="xfer-fee"
            placeholder="0"
            currency={currency || 'UZS'}
            wholeOnly={currency === 'UZS'}
            value={form.fee}
            onChange={(e) => setForm({ ...form, fee: e.target.value })}
          />
          <small className="form-hint">{t('transfer.feeHint')}</small>
        </div>

        <div className="form-group">
          <label htmlFor="xfer-date">{t('transfer.date')}</label>
          <input
            id="xfer-date"
            type="date"
            value={form.transfer_date}
            onChange={(e) => setForm({ ...form, transfer_date: e.target.value })}
            required
          />
          <small className="form-hint">{t('transfer.dateHint')}</small>
        </div>

        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="xfer-notes">{t('transfer.notes')}</label>
          <textarea
            id="xfer-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {needsClosedReason && (
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="xfer-closed-reason">{t('transfer.closedReason')} *</label>
            <textarea
              id="xfer-closed-reason"
              rows={2}
              value={closedReason}
              onChange={(e) => setClosedReason(e.target.value)}
              required
            />
            <small className="form-hint">{t('transfer.closedReasonHint')}</small>
          </div>
        )}
      </div>

      {error && (
        <div className="notification-banner error" style={{ marginTop: '12px' }}>
          {error}
        </div>
      )}

      <div className="form-actions">
        <SubmitButton className="btn-primary" disabled={!ready}>
          {t('transfer.record')}
        </SubmitButton>
        <button type="button" className="btn-edit" onClick={onCancel}>
          {t('actions.cancel', { ns: 'common' })}
        </button>
      </div>
    </BusyForm>
  );
};

export default AccountTransferForm;
