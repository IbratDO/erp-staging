import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { usePermissions } from '../hooks/usePermissions';

/**
 * To'lovlar nazorati — the group's landing path, which shows nothing of its own.
 *
 * The two kinds of promised money are **two pages under one sidebar group**, the same shape as
 * Ombor: `/payments-control/online` for Click and Payme, `/payments-control/billing` for bank
 * transfers. Each is a whole page with its own title, its own permission and its own route, so
 * neither carries a tab strip and neither knows the other exists.
 *
 * This component exists only so `/payments-control` itself keeps working — it is in bookmarks and
 * in the deploy notes, and so is the older `/gateway-payments`. **It redirects to the first page
 * the reader may actually open**, rather than to a fixed default: the accountant holds
 * `transfer.view` alone and whoever watches the gateways holds `gateway.view_pending` alone, so a
 * fixed landing would send half the staff to a page the server refuses.
 *
 * `replace`, so the redirect does not sit in the history and trap the back button on it.
 */
const PaymentsControl = () => {
  const { t } = useTranslation(['sales']);
  const { hasPermission } = usePermissions();

  if (hasPermission('gateway.view_pending')) {
    return <Navigate to="/payments-control/online" replace />;
  }
  if (hasPermission('transfer.view')) {
    return <Navigate to="/payments-control/billing" replace />;
  }

  // Reachable only if a permission disappeared between the route's own check and this render --
  // a refreshed `/users/me/`, a role changed by an Admin while the page was open.
  return (
    <div className="page-container">
      <p className="form-hint">{t('paymentsControl.nothingToSee')}</p>
    </div>
  );
};

export default PaymentsControl;
