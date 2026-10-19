import React, { useEffect, useState } from 'react';
import BusyForm, { SubmitButton } from '../components/BusyForm';

/**
 * A payment provider's merchant credentials — its own card, its own Save.
 *
 * Each business configures its own Click merchant here, because the two installations share a
 * codebase but not a database. Before this existed the credentials would have had to live in the
 * server's `.env`, which means the owner cannot change them and every rotation is a file edit on two
 * machines.
 *
 * **The secret is never shown back, so the field has to say what it knows.** The server returns only
 * `secret_set`, so an empty box means two different things — "nothing stored" and "something stored,
 * leave it alone" — and the placeholder is the only thing that tells them apart. Getting that wrong
 * is how an owner clears a working credential by pressing Save.
 *
 * **Clearing is a button, not an empty field**, mirroring the server: a blank secret on Save is
 * ignored. The trap being avoided is an owner opening this page to change the cashbox code, pressing
 * Save, and taking the till offline.
 *
 * **"Tekshirish" never charges anybody.** It asks the server whether the configuration is coherent
 * and makes no call to the provider at all. A test button that proves the credentials work by
 * charging a real customer is the obvious trap, and the reason the result says so out loud.
 *
 * Prop-driven like its siblings: nothing in this repo is rendered inside its providers in a test, so
 * a form reaching for a context would be a form no test could drive.
 */
const PaymentProviderForm = ({
  provider = 'click',
  initial = null,
  loading = false,
  saving = false,
  checking = false,
  clearing = false,
  error = '',
  success = '',
  checkResult = null,
  onSave,
  onCheck,
  onClearSecret,
  labels,
}) => {
  const [serviceId, setServiceId] = useState('');
  const [merchantUserId, setMerchantUserId] = useState('');
  const [cashboxCode, setCashboxCode] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(false);

  const secretStored = !!initial?.secret_set;

  // The row arrives after the first paint, so the fields catch up once. Keyed on the saved values
  // only, so a re-render cannot throw away something typed but not yet saved.
  useEffect(() => {
    setServiceId(initial?.service_id || '');
    setMerchantUserId(initial?.merchant_user_id || '');
    setCashboxCode(initial?.cashbox_code || '');
    setEnabled(!!initial?.enabled);
    // Deliberately not reset from `initial`: there is nothing to reset it *to*, and wiping what the
    // owner has typed on every refresh would be its own bug.
    setSecret('');
  }, [initial]);

  // Tekshirish asks the **server** about the **saved** row, so pressing it over a form full of
  // freshly typed values reports everything as empty - which is exactly what happened: the fields
  // were filled, the button was pressed before Save, and it answered "Service ID is empty".
  // Knowing whether anything is unsaved is the only way the button can avoid lying.
  const dirty = (
    serviceId.trim() !== (initial?.service_id || '')
    || merchantUserId.trim() !== (initial?.merchant_user_id || '')
    || cashboxCode.trim() !== (initial?.cashbox_code || '')
    || enabled !== !!initial?.enabled
    || !!secret.trim()
  );

  // A result describing the row before these edits is worse than no result, so it is hidden rather
  // than left sitting under changed fields looking current.
  const showCheck = checkResult && !dirty;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saving) return undefined;
    const body = {
      service_id: serviceId.trim(),
      merchant_user_id: merchantUserId.trim(),
      cashbox_code: cashboxCode.trim(),
      enabled,
    };
    // Sent only when something was typed. An empty string would be a request to change the secret
    // to nothing, which is what the Clear button is for.
    if (secret.trim()) body.secret_key = secret.trim();
    return onSave?.(body);
  };

  if (loading) {
    return <div className="loading-screen">{labels.loading}</div>;
  }

  return (
    <BusyForm
      className="form-card"
      onSubmit={handleSubmit}
      style={{ maxWidth: 480, marginTop: '1.5rem' }}
    >
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.25rem' }}>{labels.title}</h2>
      <p className="form-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>{labels.intro}</p>

      <div className="form-group">
        <label htmlFor={`${provider}-service-id`}>{labels.serviceId}</label>
        <input
          id={`${provider}-service-id`}
          type="text"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label htmlFor={`${provider}-merchant-user`}>{labels.merchantUserId}</label>
        <input
          id={`${provider}-merchant-user`}
          type="text"
          value={merchantUserId}
          onChange={(e) => setMerchantUserId(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label htmlFor={`${provider}-secret`}>{labels.secretKey}</label>
        <input
          id={`${provider}-secret`}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={secretStored ? labels.secretStored : labels.secretMissing}
          autoComplete="new-password"
        />
        <small className="form-hint">
          {secretStored ? labels.secretKeepHint : labels.secretNewHint}
        </small>
        {secretStored ? (
          <button
            type="button"
            className="btn-edit btn-dialog"
            style={{ marginTop: 8 }}
            onClick={() => onClearSecret?.()}
            disabled={clearing}
          >
            {clearing ? labels.clearing : labels.clearSecret}
          </button>
        ) : null}
      </div>

      <div className="form-group">
        <label htmlFor={`${provider}-cashbox`}>{labels.cashboxCode}</label>
        <input
          id={`${provider}-cashbox`}
          type="text"
          value={cashboxCode}
          onChange={(e) => setCashboxCode(e.target.value)}
          autoComplete="off"
        />
        <small className="form-hint">{labels.cashboxHint}</small>
      </div>

      <div className="form-group">
        <label
          htmlFor={`${provider}-enabled`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <input
            id={`${provider}-enabled`}
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>{labels.enabledLabel}</span>
        </label>
        <small className="form-hint">{labels.enabledHint}</small>
      </div>

      {error ? <div className="error-message">{error}</div> : null}
      {success ? (
        <div className="success-message" style={{ color: '#15803d', marginBottom: 12 }}>
          {success}
        </div>
      ) : null}

      {showCheck ? (
        <div
          className="form-card"
          style={{ padding: 12, marginBottom: 12, background: '#f8fafc' }}
        >
          <strong style={{ color: checkResult.ok ? '#15803d' : '#b45309' }}>
            {checkResult.ok ? labels.checkOk : labels.checkNotReady}
          </strong>
          {checkResult.problems?.length ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: '0.9em' }}>
              {checkResult.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          ) : null}
          {/* Said plainly, because "test the connection" normally implies something was sent. */}
          <p className="form-hint" style={{ marginBottom: 0, marginTop: 8 }}>
            {labels.checkNoCharge}
          </p>
        </div>
      ) : null}

      {/* Said whether or not anything is unsaved, so the button's job is never a guess. */}
      <p className="form-hint" style={{ marginBottom: 8, textAlign: 'right' }}>
        {dirty ? labels.checkNeedsSave : labels.checkChecksSaved}
      </p>
      <div className="form-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          className="btn-edit btn-dialog"
          onClick={() => onCheck?.()}
          disabled={checking || dirty}
          title={dirty ? labels.checkNeedsSave : undefined}
        >
          {checking ? labels.checking : labels.check}
        </button>
        <SubmitButton className="btn-primary btn-dialog" disabled={saving}>
          {saving ? labels.saving : labels.save}
        </SubmitButton>
      </div>
    </BusyForm>
  );
};

export default PaymentProviderForm;
