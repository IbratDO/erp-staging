import React, { useEffect, useState } from 'react';
import BusyForm, { SubmitButton } from '../components/BusyForm';

/**
 * The shop-settings form, with no context and no router around it.
 *
 * Split out from the page so it can be tested by handing it props. Nothing in this repo renders a
 * page inside its providers in a test — there is no React Testing Library here and the existing
 * component tests mount a component directly with `react-dom/client` — so a form that reached for
 * `useSettings()` itself would be a form no test could drive.
 *
 * It owns the text in the box and nothing else. Loading, saving and telling the rest of the app the
 * name changed all belong to the page.
 */
const ShopSettingsForm = ({
  initialName = '',
  loading = false,
  saving = false,
  error = '',
  success = '',
  onSave,
  labels,
}) => {
  const [shopName, setShopName] = useState(initialName);

  // The row arrives after the first paint, so the box has to catch up once — but only when the
  // saved value actually changes, or every render would throw away what is being typed.
  useEffect(() => {
    setShopName(initialName);
  }, [initialName]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Two guards, and both are needed. `saving` catches a submit that never went through the
    // button — pressing Enter in the box, which a disabled submit button does not reliably stop.
    // Returning the promise is what lets `BusyForm` hold the button down for the real duration of
    // the request; a handler that returns nothing leaves its `busy` state up for a single tick,
    // which is the same as not having it.
    if (saving) return undefined;
    return onSave?.(shopName);
  };

  if (loading) {
    return <div className="loading-screen">{labels.loading}</div>;
  }

  return (
    <BusyForm className="form-card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <div className="form-group">
        <label htmlFor="shop-name">{labels.shopNameLabel}</label>
        <input
          id="shop-name"
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          maxLength={120}
          autoComplete="organization"
        />
        <small className="form-hint">{labels.shopNameHint}</small>
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

export default ShopSettingsForm;
