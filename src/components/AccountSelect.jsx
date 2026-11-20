import React from 'react';
import useAppTranslation from '../hooks/useAppTranslation';
import { accountsForCurrency } from '../utils/moneyAccounts';

/**
 * "Out of which account?" — one picker, used by every form that pays money out.
 *
 * Exists so the markup is written once. There are four of these on the Orders page alone (the
 * order payment and the freight bill, each with a som and a dollar leg), and a picker copied four
 * times is a picker that will come to disagree with itself about the blank option or the label
 * namespace.
 *
 * **Blank is the first option and the default**, and it is a real choice rather than an empty
 * one: "the route the shop has always used" — cash, then card. Keeping it first and preselected is
 * what makes this component safe to drop into an existing form, because a user who ignores it
 * records exactly what they recorded before Phase 2 existed.
 *
 * **Renders nothing when the currency has no accounts.** `accountsForCurrency('EUR')` is empty, so
 * a form asking about a currency the shop does not hold shows no picker instead of an empty
 * select that looks broken.
 */
const AccountSelect = ({
  currency,
  value,
  onChange,
  label,
  hint,
  id,
  disabled = false,
  // Money arriving, not leaving. It changes only the wording of the blank option: the default
  // route for an incoming payment is the currency's cash bucket, with no card step to fall
  // through to, so "cash, then card" would describe something that cannot happen.
  incoming = false,
}) => {
  const { t } = useAppTranslation(['common', 'moneyBalance']);
  const options = accountsForCurrency(currency);
  if (!options.length) return null;

  return (
    <div className="form-group">
      <label htmlFor={id}>{label || t('account.label', { ns: 'common' })}</label>
      <select
        id={id}
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {t(incoming ? 'account.autoIncoming' : 'account.auto', { ns: 'common' })}
        </option>
        {options.map((b) => (
          <option key={b.value} value={b.value}>
            {t(b.labelKey, { ns: 'moneyBalance' })}
          </option>
        ))}
      </select>
      {hint ? <small className="form-hint">{hint}</small> : null}
    </div>
  );
};

export default AccountSelect;
