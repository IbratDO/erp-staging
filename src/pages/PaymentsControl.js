import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import GatewayPayments from './GatewayPayments';
import TransferPayments from './TransferPayments';
import { usePermissions } from '../hooks/usePermissions';
import './TablePage.css';

/**
 * To'lovlar nazorati — money the shop is owed by somebody who is not standing at the counter.
 *
 * Two subtabs, and they are here together because they are the same job done twice: a payment
 * that was promised by a third party and has to be checked against that party's own record.
 * Online to'lovlar checks Click and Payme; Perechisleniye to'lovlari checks the bank statement.
 *
 * **Online to'lovlar is the existing page, moved under this shell unchanged.** Nothing about it
 * is rewritten — it keeps its own data loading, its own actions and its own tests. The shell
 * only decides which of the two is on screen.
 *
 * **Each subtab is gated on its own permission, and the shell on either.** The accountant holds
 * `transfer.view` and not `gateway.view_pending`, so a shell demanding both would have hidden the
 * page from the one role built for it; a shell demanding neither would have shown a cashier a tab
 * whose contents the server refuses. So the tab strip shows only what the reader may open, and
 * the first one they may open is the one that starts selected — rather than a fixed default that
 * lands half the staff on an empty tab.
 */
const PaymentsControl = () => {
  const { t } = useTranslation(['sales', 'common']);
  const { hasPermission } = usePermissions();

  const tabs = [
    hasPermission('gateway.view_pending') && {
      key: 'online',
      label: t('paymentsControl.tabOnline'),
      render: () => <GatewayPayments embedded />,
    },
    hasPermission('transfer.view') && {
      key: 'transfer',
      label: t('paymentsControl.tabTransfer'),
      render: () => <TransferPayments />,
    },
  ].filter(Boolean);

  const [active, setActive] = useState(tabs[0]?.key || '');
  // A permission can disappear between renders — a refreshed `/users/me/`, a role changed by an
  // Admin while the page is open. Falling back to the first tab that still exists keeps the shell
  // from rendering nothing at all with no explanation.
  const current = tabs.find((tab) => tab.key === active) || tabs[0];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('paymentsControl.title')}</h1>
      </div>

      {tabs.length > 1 ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`btn ${tab.key === current?.key ? 'btn-primary' : ''}`}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {current ? current.render() : (
        <p className="form-hint">{t('paymentsControl.nothingToSee')}</p>
      )}
    </div>
  );
};

export default PaymentsControl;
