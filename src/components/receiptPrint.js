import { renderCode128Svg } from './labelPrint';

/**
 * The 80×300mm chek handed to a customer.
 *
 * 80mm is the standard thermal receipt width, and the 300mm height is a *page*, not a target: a
 * chek for two items uses a fraction of it. Whether the printer then feeds the full 300mm or cuts
 * at the end of the content is the driver's decision, not this stylesheet's — set the form to a
 * continuous or receipt mode if a short sale is coming out with a foot of blank paper after it.
 *
 * Pure: takes the receipt payload the API returns and gives back a whole HTML document as a
 * string, which `printHtml` then prints from an isolated iframe. Nothing here touches React or
 * the page. Same shape as `labelPrint`, and it shares that module's Code128 renderer so the two
 * kinds of printed code can never be encoded differently.
 *
 * **The page has a fixed height, and the content does not.** A label is one sticker and must
 * never spill; a receipt for six pairs of shoes legitimately runs onto a second sheet, the way
 * every till roll in the world does. So `.receipt` sets no height and clips nothing — the browser
 * paginates. The one thing guarded against is the *blank* second sheet, which is what a fixed
 * height plus a trailing margin produces.
 *
 * **The barcode identifies the purchase, not the line.** The customer walks back in holding one
 * piece of paper for what may have been three pairs, so the code opens the whole checkout and the
 * operator picks what is coming back. That decision lives in `receipt_utils` on the server; this
 * module just prints what it is given.
 */

const RECEIPT_MM = { width: 80, height: 300 };

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Money as the shop writes it.
 *
 * Written the way the box labels write it — `formatLabelPrice` has always used y.e and uzs, and a
 * customer holding both a sticker and a receipt should not see two notations for one currency.
 *
 * Dollars to the cent, so'm grouped and whole: nobody has ever handed over a fraction of a som,
 * and printing "1 356 425.00" on a chek reads as an error.
 */
export function formatReceiptMoney(amount, currency) {
  // Absent is not zero. `Number(null)` is 0, so without this an amount the API never sent would
  // print as a confident "0.00 $" on a piece of paper the customer keeps — a missing figure
  // should show as nothing and be noticed, not as a number that happens to be wrong.
  if (amount == null || amount === '') return '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  if (String(currency || 'USD').toUpperCase() === 'UZS') {
    return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} uzs`;
  }
  return `${n.toFixed(2)} y.e`;
}

/** "05.09.2026 15:58" — fixed, not locale-dependent, so every chek reads the same. */
export function formatReceiptDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Date only, for a promised payment day — the hour would be noise on a due date. */
export function formatReceiptDay(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const STYLES = `
  @page { size: ${RECEIPT_MM.width}mm ${RECEIPT_MM.height}mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${RECEIPT_MM.width}mm; background: #fff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  .receipt {
    width: ${RECEIPT_MM.width}mm;
    /* No height and no overflow rule on purpose — see the module docstring. A long purchase
       flows onto a second sheet; a label never may. */
    padding: 3mm 2.5mm;
    /* No webfonts: one that has not loaded when print() fires renders in fallback metrics and
       reflows the page after the sheet count has been decided. */
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 10.5pt;
    line-height: 1.25;
  }
  .receipt__shop {
    font-size: 16.5pt; font-weight: 700; text-align: center;
    letter-spacing: 0.4px; margin-bottom: 1mm;
  }
  .receipt__meta { text-align: center; font-size: 9pt; margin-bottom: 1.5mm; }
  .receipt__rule { border-top: 1px dashed #000; margin: 1.5mm 0; }
  .receipt__item { margin-bottom: 1.5mm; }
  /* The item name may wrap rather than ellipsing. 80mm fits most model names on one line, but
     the long ones still have nowhere to go sideways, and a customer reading "Armani Exchange
     technical…" cannot tell what they bought. A receipt has the vertical room a sticker does
     not. */
  .receipt__name { font-weight: 700; }
  .receipt__attrs { font-size: 9pt; }
  .receipt__line { display: flex; justify-content: space-between; gap: 2mm; }
  .receipt__line span:last-child { white-space: nowrap; }
  .receipt__total { font-size: 13.5pt; font-weight: 700; }
  /* The debt is the part a customer must not miss, so it is boxed rather than listed. */
  .receipt__credit {
    border: 1px solid #000; padding: 1.2mm; margin-top: 1.5mm; font-size: 10.5pt;
  }
  .receipt__credit-amount { font-weight: 700; font-size: 12.75pt; }
  .receipt__foot { text-align: center; margin-top: 2mm; }
  .receipt__code { display: block; width: 100%; height: 11mm; }
  .receipt__human { font-size: 9pt; letter-spacing: 0.4px; }
  .receipt__thanks { font-size: 9pt; margin-top: 1.5mm; }
`;

/** One item block: what it is, then quantity × price and the line total. */
function itemMarkup(item, currency, labels) {
  // Brand and model split by a bar, as on the label: many models are themselves two words, so a
  // space leaves no way to see where the brand ends.
  const name = [item.brand, item.model].filter(Boolean).join(' | ');
  const attrs = [item.size, item.color].filter(Boolean).join(' · ');
  const qty = Number(item.quantity) || 0;
  const unit = formatReceiptMoney(item.unit_price, currency);
  const total = item.is_giveaway
    ? labels.giveaway
    : formatReceiptMoney(item.total, currency);
  return `
    <div class="receipt__item">
      <div class="receipt__name">${esc(name)}</div>
      ${attrs ? `<div class="receipt__attrs">${esc(attrs)}</div>` : ''}
      <div class="receipt__line">
        <span>${qty} × ${esc(unit)}</span>
        <span>${esc(total)}</span>
      </div>
    </div>`;
}

function summaryMarkup(receipt, labels) {
  const ccy = receipt.currency;
  const rows = [];
  const discount = Number(receipt.discount_total) || 0;
  // The subtotal only earns its place when something came off it; on a plain sale it would just
  // repeat the total one line above it.
  if (discount > 0) {
    rows.push(`<div class="receipt__line"><span>${esc(labels.subtotal)}</span>`
      + `<span>${esc(formatReceiptMoney(receipt.subtotal, ccy))}</span></div>`);
    rows.push(`<div class="receipt__line"><span>${esc(labels.discount)}</span>`
      + `<span>-${esc(formatReceiptMoney(discount, ccy))}</span></div>`);
  }
  rows.push(`<div class="receipt__line receipt__total"><span>${esc(labels.total)}</span>`
    + `<span>${esc(formatReceiptMoney(receipt.total, ccy))}</span></div>`);
  return rows.join('');
}

function creditMarkup(receipt, labels) {
  const owed = Number(receipt.credit_amount) || 0;
  if (owed <= 0) return '';
  const due = formatReceiptDay(receipt.credit_due_date);
  return `
    <div class="receipt__credit">
      <div>${esc(labels.creditTitle)}</div>
      <div class="receipt__credit-amount">${esc(
        formatReceiptMoney(owed, receipt.credit_currency || receipt.currency),
      )}</div>
      ${due ? `<div>${esc(labels.creditDue)}: ${esc(due)}</div>` : ''}
    </div>`;
}

/**
 * The whole chek, as a printable document.
 *
 * `labels` carries every piece of wording, so this module holds no language of its own and the
 * receipt prints in whatever the shop's interface is set to.
 */
export function buildReceiptHtml(receipt, labels) {
  if (!receipt) return '';
  const items = (receipt.items || []).map((i) => itemMarkup(i, receipt.currency, labels)).join('');
  const barcode = renderCode128Svg(receipt.code);
  // Date only. The customer's name is deliberately left off: the person holding the paper already
  // knows who they are, and a receipt gets dropped, left in a bag, or handed to whoever comes back
  // with the item — so printing a name puts it somewhere it serves nobody. The endpoint still
  // reports it, because the screen has a use for it that the printed page does not.
  const meta = formatReceiptDate(receipt.sale_date);

  const body = `
    <div class="receipt">
      <div class="receipt__shop">${esc(labels.shopName)}</div>
      ${meta ? `<div class="receipt__meta">${esc(meta)}</div>` : ''}
      <div class="receipt__rule"></div>
      ${items}
      <div class="receipt__rule"></div>
      ${summaryMarkup(receipt, labels)}
      ${creditMarkup(receipt, labels)}
      <div class="receipt__foot">
        ${barcode}
        <div class="receipt__human">${esc(receipt.code || '')}</div>
        ${labels.thanks ? `<div class="receipt__thanks">${esc(labels.thanks)}</div>` : ''}
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(receipt.code || labels.shopName)}</title>
<style>${STYLES}</style></head>
<body>${body}</body></html>`;
}
