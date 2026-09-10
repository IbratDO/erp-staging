import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import api from '../utils/api';
import apiGetAll from '../utils/fetchAllPages';
import CustomerQuickAddModal from '../components/CustomerQuickAddModal';
import CustomerSearchableSelect from '../components/CustomerSearchableSelect';
import FormSearchableSelect from '../components/FormSearchableSelect';
import LanguageToggle from '../components/LanguageToggle';
import ProductSearchableSelect from '../components/ProductSearchableSelect';
import SaleCompletePayForm from '../components/SaleCompletePayForm';
import { buildReceiptHtml } from '../components/receiptPrint';
import printHtmlDocument from '../utils/printHtml';
import useAppTranslation from '../hooks/useAppTranslation';
import useBarcodeScanner from '../hooks/useBarcodeScanner';
import { usePermissions } from '../hooks/usePermissions';
import { normalizeScan, looksLikeLayerCode } from '../utils/layerBarcode';
import { beepError, beepOk, primeScanBeep } from '../utils/scanBeep';
import {
  applyScanToBatchLines,
  batchItemFromLine,
  batchLineTotals,
  convertLinesToCurrency,
  currencyForFirstLine,
  currencyForLayer,
  emptyBatchLine,
  linesPricedAboveCatalogue,
  productForLayer,
  repriceBatchLine,
} from './batchSaleLines';
import { checkBatchLines } from './batchSaleChecks';
import { layerSalePickerLabel } from '../utils/productCost';
import { buildCombinedSaleForGroup } from '../utils/saleGroupDisplay';
import { formatDisplayAmount } from '../utils/currencyFormat';
import { getCachedProducts } from '../utils/catalogCache';
import './Pos.css';

/**
 * Kassa — the till.
 *
 * One screen for a counter sale: scan, and the basket fills; press To'lash, and the payment window
 * opens over it; the chek prints and the screen clears for the next customer. It exists because the
 * same sale on the Sotuvlar page costs two modals and a hunt through a table in between, which is
 * fine for reviewing a sale and hopeless with somebody waiting.
 *
 * **It writes no money code of its own, and that is the point.** The basket is assembled here, but
 * the sale is created by `batch_create` and paid for by `SaleCompletePayForm` — the same two calls
 * the Sotuvlar page makes, in the same order. Every guard those carry comes along: the overpayment
 * check, the shortfall classification that opens a nasiya or records a discount, the change legs,
 * the receivable settlement. Every money bug traced in this system lived in completion logic, and a
 * till with its own copy of that would be a second surface for all of them.
 *
 * **Full screen, no sidebar.** Chosen deliberately: fewer places to misclick with a queue, and more
 * room for the basket. Leaving is an explicit act.
 */
export default function Pos() {
  const { t } = useAppTranslation(['sales', 'common']);
  const tr = useCallback((key, opts) => t(key, { ns: 'sales', ...opts }), [t]);
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canPay = hasPermission('sales.complete_pay');

  const [lines, setLines] = useState([emptyBatchLine()]);
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [cbuRate, setCbuRate] = useState(null);
  const [packages, setPackages] = useState([]);
  const [currencyOverride, setCurrencyOverride] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [paySale, setPaySale] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const seqRef = useRef(0);

  const say = useCallback((kind, text) => {
    seqRef.current += 1;
    setFeedback({ kind, text, seq: seqRef.current });
    if (kind === 'ok') beepOk();
    else beepError();
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const loadShelf = useCallback(async () => {
    const [inv, cust, prods, pkgs] = await Promise.all([
      apiGetAll('/inventory/layers/'),
      apiGetAll('/customers/'),
      getCachedProducts(api),
      // Packaging is optional stock: a shop that does not box anything has none, and the till
      // must not refuse to open over it.
      apiGetAll('/packages/').catch(() => ({ data: [] })),
    ]);
    setInventory(inv.data.results || inv.data || []);
    setCustomers(cust.data.results || cust.data || []);
    setProducts(prods || []);
    setPackages(pkgs.data?.results || pkgs.data || []);
  }, []);

  useEffect(() => {
    primeScanBeep();
    loadShelf().catch(() => say('error', tr('pos.errLoad')));
    api.get('/exchange-rate/')
      .then((r) => setCbuRate(r.data?.rate ?? null))
      .catch(() => { /* a same-currency basket never needs it */ });
  }, [loadShelf, say, tr]);

  /**
   * The currency the basket is being rung up in — the first item's, once there is one.
   *
   * `null` until then, and that null is the thing to be careful with: `resolveLayerListPrice`
   * compares the layer's own currency against it, finds no match, and converts. A $100 item
   * priced against a null currency came out as **0.01** — divided by the som rate as though it
   * were som. So nothing is ever priced against this directly; see `currencyForItem`.
   */
  const basketCurrency = useMemo(
    () => currencyForFirstLine(lines, inventory, products),
    [lines, inventory, products],
  );
  /**
   * What the basket is being rung up in.
   *
   * The first item's own currency by default, so nothing has to be chosen for the ordinary sale —
   * and an explicit choice wins, for the customer who wants a som-priced item in dollars. Choosing
   * one converts every line already in the basket; see `flipCurrency`.
   */
  const saleCurrency = currencyOverride || basketCurrency || 'USD';

  /**
   * The currency to price an incoming item against.
   *
   * The basket's, once it has one — a second item has to be quoted in the currency the first
   * established, or the total would add som to dollars. For the *first* item there is nothing to
   * follow, so it sets the currency itself, and pricing it in its own terms is both correct and
   * the only way to avoid the conversion that produced 0.01.
   */
  const currencyForItem = useCallback(
    (item) => currencyOverride
      || basketCurrency
      || currencyForLayer(item.value, inventory, products)
      || 'USD',
    [currencyOverride, basketCurrency, inventory, products],
  );

  /**
   * Ring the basket up in the other currency.
   *
   * Every line already in it is converted at the CBU rate, because a basket half in som and half
   * in dollars has no total. Refused without a rate rather than done badly — the alternative is
   * silently leaving the old figures under a new currency symbol.
   */
  const flipCurrency = (next) => {
    if (next === saleCurrency) return;
    if (lines.some((l) => l.layer) && !cbuRate) {
      say('error', tr('pos.errNoRate'));
      return;
    }
    setCurrencyOverride(next);
    setLines((prev) => convertLinesToCurrency(prev, next, cbuRate));
  };

  // `amount` is already what the customer pays: `selling_price` on a line is the per-unit price
  // *after* its discount, so `discount` beside it is what they were let off, not something still
  // to come away. Subtracting it here took it off twice — the same double-discount the payload
  // builder had, in the other direction.
  const totals = useMemo(() => batchLineTotals(lines), [lines]);

  /**
   * Everything on the shelf, in the one shape the picker and the scan reducer both read.
   *
   * `{ value, label, product, layer }` — the same items the Sotuvlar batch modal builds, so a
   * scan and a pick land on identical code and cannot diverge in what they add to the basket.
   */
  const pickerItems = useMemo(
    () => (inventory || [])
      .filter((layer) => Number(layer.quantity) > 0)
      .map((layer) => {
        const product = productForLayer(layer, products);
        if (!product) return null;
        return {
          value: String(layer.batch_id),
          label: layerSalePickerLabel(product, layer),
          product,
          layer,
        };
      })
      .filter(Boolean),
    [inventory, products],
  );

  const handleScan = useCallback((raw) => {
    const code = normalizeScan(raw);
    if (!code) return;
    const item = pickerItems.find((i) => normalizeScan(i.layer?.barcode) === code);
    if (!item) {
      // Silence for anything that is not recognisably one of ours — the hook fires on any fast
      // burst, and beeping at a fast typist teaches them to ignore the beep.
      if (looksLikeLayerCode(code)) say('error', tr('pos.scanUnknown', { code }));
      return;
    }
    setLines((prev) => {
      const { lines: next, result } = applyScanToBatchLines(prev, item, {
        inventory, products, saleCurrency: currencyForItem(item), cbuRate,
      });
      if (result.kind === 'at-stock-cap') say('error', tr('pos.atStockCap', { name: result.label }));
      else say('ok', tr('pos.scanAdded', { name: result.label }));
      return next;
    });
  }, [pickerItems, inventory, products, currencyForItem, cbuRate, say, tr]);

  useBarcodeScanner({ enabled: !paySale, onScan: handleScan });

  const setLine = (key, patch) => setLines(
    (prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
  );
  /**
   * The price and discount boxes, edited through the same rule the Sotuvlar form uses.
   *
   * They are not two independent numbers. `batchItemFromLine` sends the **list** price whenever a
   * discount is present and lets the server subtract, so a till that stored a discount without
   * lowering the price it displays would show 109 and charge 89.
   */
  const repriceLine = (key, field, value) => setLines(
    (prev) => prev.map((l) => (l.key === key ? repriceBatchLine(l, field, value, saleCurrency) : l)),
  );
  const dropLine = (key) => setLines((prev) => {
    const next = prev.filter((l) => l.key !== key);
    return next.length ? next : [emptyBatchLine()];
  });
  const bumpQty = (line, by) => {
    const item = pickerItems.find((i) => i.value === String(line.layer));
    const cap = item ? Number(item.layer?.quantity) || 0 : Infinity;
    const next = Math.max(1, Math.min(cap, (parseInt(line.quantity, 10) || 0) + by));
    // One box per unit: a line for three pairs needs three boxes, and leaving the packaging at
    // its old count is how a basket passes the stock check and short-changes the store room.
    const pkg = line.packageLines?.[0];
    setLine(line.key, {
      quantity: String(next),
      ...(pkg ? { packageLines: [{ ...pkg, quantity: next }] } : {}),
    });
  };

  const filled = lines.filter((l) => l.layer);

  /** Every category with something on the shelf — the filter above the picker. */
  const categories = useMemo(
    () => [...new Set(pickerItems.map((i) => i.product?.category).filter(Boolean))].sort(),
    [pickerItems],
  );
  const [category, setCategory] = useState('');
  const visibleItems = useMemo(
    () => (category ? pickerItems.filter((i) => i.product?.category === category) : pickerItems),
    [pickerItems, category],
  );

  /**
   * Ring the basket up, then hand it to the payment window.
   *
   * Two calls, both existing: `batch_create` makes the sales exactly as the Sotuvlar page does,
   * and its response carries the created rows, so they go straight into the payment form without
   * a second fetch or a guess about which sales were just made.
   */
  const startPayment = async () => {
    if (!customer) { say('error', tr('pos.errCustomer')); return; }
    setBusy(true);
    try {
      // The shelf as it stands *now*, not as it was when the till was opened. Somebody else may
      // have sold the last pair while this basket was being built, and finding out from the
      // server after the customer is at the counter is the worst moment to find out.
      let shelf = inventory;
      try {
        const fresh = await apiGetAll('/inventory/layers/');
        shelf = fresh.data.results || fresh.data || [];
        setInventory(shelf);
      } catch { /* keep what we have and let the server be the backstop */ }

      const problem = checkBatchLines(lines, { inventory: shelf, packages });
      if (problem) { say('error', tr(`pos.check.${problem.code}`, problem.params)); return; }

      // Selling above the shelf price is allowed; typing an extra zero is not something the shop
      // should find out about a week later. Asked once, here — afterwards a ten-times price reads
      // as an ordinary sale, with nothing short and nothing failing to balance.
      const above = linesPricedAboveCatalogue(filled);
      if (above.length) {
        const detail = above
          .map((r) => tr('batch.abovePriceLine', {
            asked: formatDisplayAmount(r.asked, saleCurrency),
            shelf: formatDisplayAmount(r.shelf, saleCurrency),
          }))
          .join('\n');
        const message = `${tr('batch.abovePriceConfirm', { count: above.length })}\n\n${detail}`;
        // eslint-disable-next-line no-alert
        if (!window.confirm(message)) return;
      }

      const { data } = await api.post('/sales/batch_create/', {
        customer: parseInt(customer, 10),
        defaults: { sale_type: 'bought_from_shop', sale_currency: saleCurrency, status: 'pending' },
        // Built by the same function the Sotuvlar modal uses — see `batchItemFromLine` for why
        // the price sent is the list price whenever a discount is present.
        items: filled.map((l) => batchItemFromLine(l, saleCurrency)),
      });
      const created = data.created || [];
      if (!created.length) { say('error', tr('pos.errCreate')); return; }
      setPaySale(buildCombinedSaleForGroup(created));
    } catch (err) {
      const d = err?.response?.data;
      say('error', d?.error || d?.detail || tr('pos.errCreate'));
    } finally {
      setBusy(false);
    }
  };

  /** Print the chek and clear the counter for the next customer. */
  const finishSale = async (saleId) => {
    try {
      const res = await api.get(`/sales/${saleId}/receipt/`);
      const html = buildReceiptHtml(res.data, {
        shopName: tr('receipt.shopName'), subtotal: tr('receipt.subtotal'),
        discount: tr('receipt.discount'), total: tr('receipt.total'),
        creditTitle: tr('receipt.creditTitle'), creditDue: tr('receipt.creditDue'),
        giveaway: tr('receipt.giveaway'), thanks: tr('receipt.thanks'),
      });
      if (html) printHtmlDocument(html);
    } catch {
      // The sale is already complete and the money is in the till; a chek that failed to print is
      // an annoyance, not a reason to alarm somebody mid-queue. It can be reprinted from Sotuvlar.
      say('error', tr('receipt.failed'));
    }
    setLines([emptyBatchLine()]);
    setCustomer('');
    setPaySale(null);
    loadShelf().catch(() => {});
    say('ok', tr('pos.done'));
  };

  const money = (v) => formatDisplayAmount(v, saleCurrency);
  // The currency named in the column headings and beside every price box, so a figure is never a
  // bare number: it matches the selector above, which is what the seller changed to get here.
  const unitName = saleCurrency;

  return (
    <div className="pos">
      <header className="pos__bar">
        <h1>{tr('pos.title')}</h1>
        <div
          className={`pos__feedback pos__feedback--${feedback?.kind || 'idle'}`}
          role="status"
          aria-live="polite"
        >
          {feedback?.text || ''}
        </div>
        <LanguageToggle />
        <button type="button" className="btn-edit" onClick={() => navigate('/sales')}>
          {tr('pos.exit')}
        </button>
      </header>

      <div className="pos__body">
        <section className="pos__basket">
          <div className="pos__tools">
            <label className="pos__tool pos__tool--currency">
              <span className="pos__tool-label">{tr('pos.currency')}</span>
              <select
                value={saleCurrency}
                onChange={(e) => flipCurrency(e.target.value)}
                className={`pos__currency pos__currency--${saleCurrency.toLowerCase()}`}
              >
                <option value="USD">{tr('pos.currencyUsd')}</option>
                <option value="UZS">{tr('pos.currencyUzs')}</option>
              </select>
            </label>
            <label className="pos__tool pos__tool--grow">
              <span className="pos__tool-label">{tr('pos.category')}</span>
              {/* The same control the new-sale form uses for this field: a select to look at, a
                  search box the moment it opens. With 150 categories, typing is the only way. */}
              <FormSearchableSelect
                value={category}
                onChange={setCategory}
                options={categories}
                emptyLabel={tr('pos.allCategories')}
                placeholder={tr('pos.allCategories')}
                aria-label={tr('pos.category')}
                triggerClassName="pos__control"
              />
            </label>
            <label className="pos__tool pos__tool--search">
              <span className="pos__tool-label">{tr('pos.addItem')}</span>
              <ProductSearchableSelect
                pickerItems={visibleItems}
                products={products}
                inventoryRows={inventory}
                value=""
                onChange={(layerId) => {
                  const item = pickerItems.find((i) => i.value === String(layerId));
                  if (!item) return;
                  setLines((prev) => applyScanToBatchLines(prev, item, {
                    inventory, products, saleCurrency: currencyForItem(item), cbuRate,
                  }).lines);
                }}
                placeholder={tr('pos.search')}
                aria-label={tr('pos.addItem')}
              />
            </label>
          </div>
          <p className="pos__hint">{tr('pos.scanHint')}</p>

          {filled.length === 0 ? (
            <div className="pos__empty">
              <div className="pos__empty-mark" aria-hidden="true">🛒</div>
              <p className="pos__empty-title">{tr('pos.empty')}</p>
              <p className="pos__empty-hint">{tr('pos.emptyHint')}</p>
            </div>
          ) : (
            <div className="pos__table">
              {/* Column headings, because a bare 109 beside a bare 0 tells the seller nothing about
                  which is the price, which is the discount, and whether either is per unit. */}
              <div className="pos__head" role="row">
                <span>{tr('pos.colItem')}</span>
                <span className="pos__head--mid">{tr('pos.colQty')}</span>
                <span className="pos__head--num">{tr('pos.colPrice', { currency: unitName })}</span>
                <span className="pos__head--num">{tr('pos.colDiscount', { currency: unitName })}</span>
                <span className="pos__head--pkg">{tr('pos.colPackage')}</span>
                <span className="pos__head--sum">{tr('pos.colLineTotal')}</span>
                <span />
              </div>
              <ul className="pos__lines">
                {filled.map((line) => {
                  const p = products.find((x) => String(x.id) === String(line.product));
                  const name = p ? `${p.brand} ${p.model}` : `#${line.layer}`;
                  const specs = p
                    ? [p.size && tr('pos.specSize', { value: p.size }), p.color].filter(Boolean)
                    : [];
                  const qty = parseInt(line.quantity, 10) || 0;
                  const unit = Number(line.selling_price) || 0;
                  const off = Number(line.discount_price) || 0;
                  const item = pickerItems.find((i) => i.value === String(line.layer));
                  const inStock = item ? Number(item.layer?.quantity) || 0 : 0;
                  const pkg = line.packageLines?.[0]?.package_type || '';
                  return (
                    <li className="pos__line" key={line.key}>
                      <div className="pos__line-item">
                        <div className="pos__line-name">{name}</div>
                        <div className="pos__line-sub">
                          {specs.map((s) => (
                            <span className="pos__chip" key={s}>{s}</span>
                          ))}
                          <span className="pos__line-stock">
                            {tr('pos.inStock', { qty: inStock })}
                          </span>
                        </div>
                      </div>

                      <div className="pos__line-qty">
                        <button
                          type="button"
                          onClick={() => bumpQty(line, -1)}
                          aria-label={tr('pos.qtyLess')}
                          title={tr('pos.qtyLess')}
                        >
                          −
                        </button>
                        <strong>{qty}</strong>
                        <button
                          type="button"
                          onClick={() => bumpQty(line, +1)}
                          aria-label={tr('pos.qtyMore')}
                          title={tr('pos.qtyMore')}
                          disabled={inStock > 0 && qty >= inStock}
                        >
                          +
                        </button>
                      </div>

                      {/* No currency badge inside the box: the column heading above names it, and
                          a badge would push the digits out of line with their own heading. */}
                      <input
                        className="pos__line-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.selling_price}
                        onChange={(e) => repriceLine(line.key, 'selling_price', e.target.value)}
                        aria-label={tr('pos.colPrice', { currency: unitName })}
                      />

                      <input
                        className="pos__line-price"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={line.discount_price || ''}
                        onChange={(e) => repriceLine(line.key, 'discount_price', e.target.value)}
                        aria-label={tr('pos.colDiscount', { currency: unitName })}
                      />

                      <select
                        className={`pos__line-pkg${pkg ? '' : ' pos__line-pkg--none'}`}
                        value={pkg}
                        onChange={(e) => setLine(line.key, {
                          packageLines: e.target.value
                            ? [{ package_type: e.target.value, quantity: qty || 1 }]
                            : [],
                        })}
                        aria-label={tr('pos.colPackage')}
                      >
                        <option value="">{tr('pos.noPackage')}</option>
                        {packages.map((pk) => (
                          <option key={pk.package_type} value={pk.package_type}>
                            {tr('pos.packageOption', { type: pk.package_type, qty: pk.quantity })}
                          </option>
                        ))}
                      </select>

                      <div className="pos__line-total">
                        <strong>{money(unit * qty)}</strong>
                        {/* What was let off, stated once per line. The discount box shows the
                            per-unit figure; on three pairs the two are not the same number. */}
                        {off > 0 && (
                          <span className="pos__line-off">
                            {tr('pos.lineSaved', { amount: money(off * qty) })}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="pos__line-drop"
                        onClick={() => dropLine(line.key)}
                        aria-label={tr('pos.remove')}
                        title={tr('pos.remove')}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <aside className="pos__pay">
          <label className="pos__customer">
            <span className="pos__tool-label">
              {tr('pos.customer')} <em className="pos__required">{tr('pos.required')}</em>
            </span>
            <div className="pos__customer-row">
              <CustomerSearchableSelect
                customers={customers}
                value={customer}
                onChange={setCustomer}
                placeholder={tr('pos.customerPick')}
                aria-label={tr('pos.customer')}
              />
              <button
                type="button"
                className="btn-edit"
                onClick={() => setShowAddCustomer(true)}
                title={tr('pos.addCustomer')}
              >
                +
              </button>
            </div>
          </label>

          <div className="pos__totals">
            <div><span>{tr('pos.items')}</span><strong>{filled.length}</strong></div>
            <div><span>{tr('pos.units')}</span><strong>{totals.quantity}</strong></div>
            {totals.discount > 0 && (
              <>
                <div>
                  <span>{tr('pos.subtotal')}</span>
                  <strong>{money(totals.amount + totals.discount)}</strong>
                </div>
                <div className="pos__saved">
                  <span>{tr('pos.discount')}</span>
                  <strong>−{money(totals.discount)}</strong>
                </div>
              </>
            )}
            <div className="pos__grand">
              <span>{tr('pos.total')}</span>
              <strong>{money(totals.amount)}</strong>
            </div>
          </div>

          <button
            type="button"
            className="pos__checkout"
            onClick={startPayment}
            disabled={busy || !filled.length || !customer || !canPay}
          >
            {busy ? tr('pos.checkoutBusy') : tr('pos.checkout')}
            {!busy && filled.length > 0 && (
              <span className="pos__checkout-sum">{money(totals.amount)}</span>
            )}
          </button>
          {/* Why the button is grey. Otherwise a disabled TO'LASH with a full basket is a puzzle. */}
          {canPay && !busy && (!filled.length || !customer) && (
            <p className="pos__hint pos__hint--block">
              {!filled.length ? tr('pos.needItems') : tr('pos.needCustomer')}
            </p>
          )}
          {!canPay && <p className="pos__hint">{tr('pos.noPayPermission')}</p>}
        </aside>
      </div>

      <CustomerQuickAddModal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onCreated={(created) => {
          setCustomers((prev) => [created, ...prev]);
          setCustomer(String(created.id));
          setShowAddCustomer(false);
        }}
        showNotification={(text, kind) => say(kind === 'error' ? 'error' : 'ok', text)}
      />

      {/* The existing payment window, unchanged. Every guard it carries — the overpayment check,
          the nasiya and discount classification, the change legs — comes with it. */}
      {paySale && (
        <SaleCompletePayForm
          sale={paySale}
          onClose={() => setPaySale(null)}
          onSuccess={() => finishSale(paySale.id)}
          showNotification={(text, kind) => say(kind === 'error' ? 'error' : 'ok', text)}
        />
      )}
    </div>
  );
}
