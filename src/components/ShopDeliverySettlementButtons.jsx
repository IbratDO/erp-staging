import React from 'react';
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
  if (!shopDeliverySettlementRequired(sale)) return null;

  const step = shopDeliverySettlementActiveStep(sale);
  if (!step || step === 0) return null;

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
    return <button {...btnProps}>Payment received by shop</button>;
  }
  return <button {...btnProps}>{shopDeliverySettlementStep3Label(sale)}</button>;
}
