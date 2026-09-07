/**
 * Whether a sale row may offer a "Chek" button.
 *
 * Its own module because a group row is built by spreading its **first** line
 * (`buildCombinedSaleForGroup` does `{...first}`), so every field read off that row describes one
 * line rather than the purchase. Sales #427-429 were a three-item shop sale whose first item had
 * been returned: the row inherited `returned`, the button disappeared, and the two items still on
 * the receipt could not be printed.
 *
 * Any completed shop line is enough. The receipt covers the whole checkout and the server resolves
 * it from any line of the group, so one printable line makes the purchase printable.
 *
 * A group with nothing completed left is correctly refused — the receipt endpoint will not print a
 * sale that is not completed, and a button that only produces an error is worse than no button.
 */
export function canPrintReceiptFor(sale, groupSales = null) {
  const lines = groupSales?.length ? groupSales : [sale];
  return lines.some(
    (line) => line && line.status === 'completed' && line.sale_type === 'bought_from_shop',
  );
}
