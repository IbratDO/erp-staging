import React from 'react';
import { usePermissions } from '../hooks/usePermissions';
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
  const { hasAnyPermission, hasPermission } = usePermissions();
  const canShopRemittance = hasPermission('sales.delivery_shop_received');
  const canPayDispatchFee = hasAnyPermission([
    'sales.delivery_pay_dispatch_fee',
    'sales.complete_pay',
  ]);

  if (!shopDeliverySettlementRequired(sale)) return null;

  const step = shopDeliverySettlementActiveStep(sale);
  if (!step || step === 0) return null;

  if (step === 3 && !canPayDispatchFee) {
    return (
      <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.3 }}>
        Awaiting shop: dispatch fee &amp; completion
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
    return <button {...btnProps}>Payment received by dispatch</button>;
  }
  if (step === 2) {
    if (!canShopRemittance) {
      return (
        <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.3 }}>
          Awaiting shop: payment remittance
        </span>
      );
    }
    return <button {...btnProps}>Payment received by shop</button>;
  }
  return <button {...btnProps}>{shopDeliverySettlementStep3Label(sale)}</button>;
}
