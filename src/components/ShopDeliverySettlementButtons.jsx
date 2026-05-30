import React from 'react';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';
import {
  shopDeliverySettlementActiveStep,
  shopDeliverySettlementRequired,
  shopDeliverySettlementStep3Label,
} from '../utils/saleCompletePayHelpers';

/**
 * One settlement control at a time: only the current step’s button is shown; earlier steps disappear
 * from the row after they are recorded (sale data advances to the next timestamp).
 */
export default function ShopDeliverySettlementButtons({ sale, onOpenSettlement, classNameButton = 'btn-status' }) {
  const { t } = useAppTranslation('sales');
  const { hasAnyPermission, hasPermission } = usePermissions();
  const canShopRemittance = hasPermission('sales.delivery_shop_received');
  const canPayDispatchFee = hasAnyPermission([
    'sales.delivery_pay_dispatch_fee',
    'sales.complete_pay',
  ]);

  if (!shopDeliverySettlementRequired(sale)) return null;

  const step = shopDeliverySettlementActiveStep(sale);
  if (!step) return null;

  const statusSpanStyle = { fontSize: '0.82rem', lineHeight: 1.3 };

  if (step === 0) {
    return (
      <span style={{ ...statusSpanStyle, color: '#059669' }}>
        {t('deliverySettlement.settlementFinished')}
      </span>
    );
  }

  if (step === 3 && !canPayDispatchFee) {
    return (
      <span style={{ ...statusSpanStyle, color: '#64748b' }}>
        {t('deliverySettlement.awaitingShopFee')}
      </span>
    );
  }

  const open = () => {
    if (sale?.id) onOpenSettlement(sale.id);
  };

  const btnProps = {
    type: 'button',
    className: classNameButton,
    onClick: open,
    style: {
      fontSize: '0.82rem',
      lineHeight: 1.2,
      whiteSpace: 'normal',
      textAlign: 'left',
    },
  };

  if (step === 1) {
    return <button {...btnProps}>{t('deliverySettlement.btnStep1')}</button>;
  }
  if (step === 2) {
    if (!canShopRemittance) {
      return (
        <span style={{ ...statusSpanStyle, color: '#64748b' }}>
          {t('deliverySettlement.awaitingShopRemittance')}
        </span>
      );
    }
    return <button {...btnProps}>{t('deliverySettlement.btnStep2')}</button>;
  }
  return <button {...btnProps}>{shopDeliverySettlementStep3Label(sale)}</button>;
}
