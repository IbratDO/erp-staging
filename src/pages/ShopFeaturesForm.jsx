import React, { useEffect, useState } from 'react';
import BusyForm, { SubmitButton } from '../components/BusyForm';

/**
 * What this shop does at all — its own card, its own Save.
 *
 * Kept apart from the shop's name deliberately. The two answer different questions and carry very
 * different consequences: renaming the shop changes a label, while switching a feature off changes
 * **who can do what** — the Nasiya checkbox leaves the payment window and Qarzdorlik leaves the menu.
 * Sharing one Save button meant one press did both, and abandoning a half-typed name meant abandoning
 * a toggle with it.
 *
 * Prop-driven for the same reason as its sibling: no component in this repo is rendered inside its
 * providers in a test, so a form reaching for `useSettings()` would be a form no test could drive.
 *
 * The list will grow — delivery, packaging, giveaway — which is the other reason this is a component
 * rather than a block inside the name form.
 *
 * Its width and its place on the page come from `.settings-group__cards` in TablePage.css. They used
 * to be an inline `maxWidth`, which no stylesheet could override and so no grid could arrange.
 */
const ShopFeaturesForm = ({
  initialNasiya = true,
  initialPosCustomerRequired = true,
  loading = false,
  saving = false,
  error = '',
  success = '',
  onSave,
  labels,
}) => {
  const [nasiya, setNasiya] = useState(initialNasiya);
  const [posCustomer, setPosCustomer] = useState(initialPosCustomerRequired);

  // The row arrives after the first paint, so each switch has to catch up once — and only when its
  // own saved value changes, or a re-render would throw away a click that has not been saved yet.
  // Two effects rather than one: a change to either saved value must not reset the other switch
  // and discard an unsaved click on it.
  useEffect(() => {
    setNasiya(initialNasiya);
  }, [initialNasiya]);
  useEffect(() => {
    setPosCustomer(initialPosCustomerRequired);
  }, [initialPosCustomerRequired]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saving) return undefined;
    // Returned so `BusyForm` can hold the button down for the real duration of the request.
    return onSave?.({ nasiya_enabled: nasiya, pos_customer_required: posCustomer });
  };

  if (loading) {
    return <div className="loading-screen">{labels.loading}</div>;
  }

  return (
    <BusyForm className="form-card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.25rem' }}>{labels.featuresTitle}</h2>
      <p className="form-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
        {labels.featuresIntro}
      </p>

      <div className="form-group">
        <label
          htmlFor="nasiya-enabled"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <input
            id="nasiya-enabled"
            type="checkbox"
            checked={nasiya}
            onChange={(e) => setNasiya(e.target.checked)}
          />
          <span>{labels.nasiyaLabel}</span>
        </label>
        <small className="form-hint">{labels.nasiyaHint}</small>
      </div>

      {/* Not a feature switch like the one above it, and the hint says so: nothing disappears
          either way. It changes how strict one field on the till is. It shares this card because
          an Admin thinks of both as "what the shop does", not because they work alike. */}
      <div className="form-group">
        <label
          htmlFor="pos-customer-required"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <input
            id="pos-customer-required"
            type="checkbox"
            checked={posCustomer}
            onChange={(e) => setPosCustomer(e.target.checked)}
          />
          <span>{labels.posCustomerLabel}</span>
        </label>
        <small className="form-hint">{labels.posCustomerHint}</small>
      </div>

      {error ? <div className="error-message">{error}</div> : null}
      {success ? (
        <div className="success-message" style={{ color: '#15803d', marginBottom: 12 }}>
          {success}
        </div>
      ) : null}
      <div className="form-actions">
        <SubmitButton className="btn-primary" disabled={saving}>
          {saving ? labels.saving : labels.save}
        </SubmitButton>
      </div>
    </BusyForm>
  );
};

export default ShopFeaturesForm;
