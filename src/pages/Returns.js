import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../utils/api';
import { cashBalanceTotalByCurrency, formatDisplayAmount, formatInsufficientLedgerMessage } from '../utils/currencyFormat';
import SortableTh from '../components/SortableTh';
import CustomerSearchableSelect from '../components/CustomerSearchableSelect';
import { useClientTableSort, compareForSort } from '../utils/tableSort';
import { usePermissions } from '../hooks/usePermissions';
import {
  computeReturnRefundDue,
  computeReturnRefundMeta,
  buildReturnRefundRequest,
  buildReturnCrossCurrencyConfirmMessage,
  buildReturnCombinedRefundConfirmMessage,
} from '../utils/returnRefundHelpers';
import './TablePage.css';

function returnProductPickerLabel(p) {
  if (!p) return '';
  return `${p.brand} ${p.model} - Size ${p.size} (${p.color})`;
}

function getSaleUnitPrice(sale) {
  if (!sale || sale.selling_price == null || sale.selling_price === '') return NaN;
  const unit = parseFloat(sale.selling_price);
  return Number.isFinite(unit) ? unit : NaN;
}

function getSaleCurrency(sale) {
  return sale?.sale_currency || 'USD';
}

function formatAutoSoldPrice(unitPrice, quantity, currency) {
  const qty = parseInt(quantity, 10) || 0;
  if (!Number.isFinite(unitPrice) || qty <= 0) return '';
  const total = unitPrice * qty;
  return currency === 'UZS' ? String(Math.round(total)) : total.toFixed(2);
}

function formatSoldPriceForApi(amount, currency) {
  const ccy = String(currency || 'USD').toUpperCase();
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  return ccy === 'UZS' ? String(Math.round(n)) : n.toFixed(2);
}

function extractReturnApiError(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  for (const key of ['sold_price', 'sold_price_currency', 'sale', 'quantity', 'product', 'notes']) {
    const val = data[key];
    if (Array.isArray(val) && val[0]) return String(val[0]);
    if (typeof val === 'string' && val.trim()) return val;
  }
  return null;
}

function computeReturnDue(returnItem) {
  const sale = returnItem?.sale_detail;
  const qty = parseInt(returnItem?.quantity, 10) || 0;
  if (!sale || qty <= 0) {
    return { amount: null, currency: 'USD', unitPrice: NaN };
  }
  const currency = getSaleCurrency(sale);
  const unitPrice = getSaleUnitPrice(sale);
  if (!Number.isFinite(unitPrice)) {
    return { amount: null, currency, unitPrice: NaN };
  }
  const raw = unitPrice * qty;
  const amount = currency === 'UZS' ? Math.round(raw) : parseFloat(raw.toFixed(2));
  return { amount, currency, unitPrice };
}

function computeFormReturnDue(sale, quantity) {
  if (!sale) return { amount: null, currency: 'USD', unitPrice: NaN };
  return computeReturnDue({ sale_detail: sale, quantity });
}

function refundAmountExceedsDue(refundAmount, refundCurrency, due) {
  if (due.amount == null || !Number.isFinite(due.amount)) return false;
  const refundCcy = String(refundCurrency || 'USD').toUpperCase();
  const dueCcy = String(due.currency || 'USD').toUpperCase();
  if (refundCcy !== dueCcy) return false;
  const refund = parseFloat(refundAmount);
  if (!Number.isFinite(refund)) return false;
  const tol = refundCcy === 'UZS' ? 0.5 : 0.01;
  return refund > due.amount + tol;
}

function formatRefundAmounts(uzs, usd) {
  const parts = [];
  if (uzs > 0) parts.push(formatDisplayAmount(uzs, 'UZS'));
  if (usd > 0) parts.push(formatDisplayAmount(usd, 'USD'));
  return parts.length ? parts.join(' + ') : '—';
}

/** @returns {false} if user cancels */
function confirmReturnRefund(returnItem, uzsEntered, usdEntered, meta) {
  const uzs = Number(uzsEntered) || 0;
  const usd = Number(usdEntered) || 0;
  const due = meta
    ? { amount: meta.due, currency: meta.sc, unitPrice: computeReturnRefundDue(returnItem).unitPrice }
    : computeReturnRefundDue(returnItem);
  const productLabel = returnItem?.product_detail
    ? `${returnItem.product_detail.brand} ${returnItem.product_detail.model}`
    : `Product #${returnItem?.product ?? '?'}`;
  const customerLine = returnItem?.customer_detail?.name
    ? `\nCustomer: ${returnItem.customer_detail.name}`
    : '';
  const dueLine =
    due.amount != null
      ? formatDisplayAmount(due.amount, due.currency)
      : '—';
  const unitDetail = Number.isFinite(due.unitPrice)
    ? `\n(${formatDisplayAmount(due.unitPrice, due.currency)} / unit × ${returnItem?.quantity ?? 0})`
    : '';

  const msg =
    `Mark Return #${returnItem?.id ?? '?'} as refunded?\n\n` +
    `${productLabel}\n` +
    `Qty: ${returnItem?.quantity ?? '—'}${customerLine}\n\n` +
    `Sold price: ${dueLine}${unitDetail}\n` +
    `Refunding: ${formatRefundAmounts(uzs, usd)}\n\n` +
    'Proceed with this refund?';

  return window.confirm(msg);
}

/** Pending refunds first; refunded rows sink to the bottom. */
function compareNotRefundedFirst(a, b) {
  const aDone = a.refund_status === 'refunded' ? 1 : 0;
  const bDone = b.refund_status === 'refunded' ? 1 : 0;
  return aDone - bDone;
}

const RETURNS_SORT_ACCESSORS = {
  id: (r) => Number(r.id) || 0,
  category: (r) => String(r.product_detail?.category ?? '').toLowerCase(),
  product: (r) =>
    r.product_detail
      ? `${r.product_detail.brand} ${r.product_detail.model}`.toLowerCase()
      : String(r.product ?? ''),
  brand: (r) => String(r.product_detail?.brand ?? '').toLowerCase(),
  model: (r) => String(r.product_detail?.model ?? '').toLowerCase(),
  size: (r) => String(r.product_detail?.size ?? '').toLowerCase(),
  color: (r) => String(r.product_detail?.color ?? '').toLowerCase(),
  sale: (r) => Number(r.sale) || 0,
  customer: (r) => String(r.customer_detail?.name ?? '').toLowerCase(),
  phone: (r) => String(r.customer_detail?.telephone ?? '').toLowerCase(),
  quantity: (r) => Number(r.quantity) || 0,
  reason: (r) => String(r.reason ?? '').toLowerCase(),
  refund_uzs: (r) =>
    (parseFloat(r.refund_uzs_cash) || 0) + (parseFloat(r.refund_uzs_card) || 0),
  refund_usd: (r) =>
    (parseFloat(r.refund_usd_cash) || 0) + (parseFloat(r.refund_usd_card) || 0),
  refund_status: (r) => String(r.refund_status ?? '').toLowerCase(),
  notes: (r) => String(r.notes ?? '').toLowerCase(),
  processed_by: (r) => String(r.processed_by_detail?.username ?? '').toLowerCase(),
  return_date: (r) => new Date(r.return_date).getTime() || 0,
};

const Returns = () => {
  const { hasPermission } = usePermissions();
  const canMarkRefunded = hasPermission('returns.mark_refunded');
  const canCreateReturn = hasPermission('returns.create');
  const [returns, setReturns] = useState([]);
  const [filteredReturns, setFilteredReturns] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ message: '', type: '', visible: false });

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type, visible: true });
    setTimeout(() => setNotification({ message: '', type: '', visible: false }), 4000);
  };
  const [showForm, setShowForm] = useState(false);
  const [formCategory, setFormCategory] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    reason: '',
    year: '',
    month: '',
  });
  const [formData, setFormData] = useState({
    product: '',
    sale: '',
    customer: '',
    quantity: '',
    sold_price: '',
    sold_price_currency: 'USD',
    reason: 'customer_request',
    notes: '',
  });
  const [refundFormData, setRefundFormData] = useState({
    returnId: null,
    uzs: '',
    usd: '',
  });
  const [showRefundForm, setShowRefundForm] = useState(false);
  /** When true, sale/qty changes do not overwrite the refund amount field. */
  const [refundAmountTouched, setRefundAmountTouched] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [exchangeRateError, setExchangeRateError] = useState(null);

  const productDropdownRef = useRef(null);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  useEffect(() => {
    if (!showForm) {
      setProductSearch('');
      setProductDropdownOpen(false);
      setRefundAmountTouched(false);
    }
  }, [showForm]);

  useEffect(() => {
    if (!productDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [productDropdownOpen]);

  useEffect(() => {
    fetchReturns();
    fetchProducts();
    fetchSales();
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showRefundForm) {
      setExchangeRate(null);
      setExchangeRateError(null);
      return;
    }
    let cancelled = false;
    api
      .get('/exchange-rate/')
      .then((res) => {
        if (!cancelled) {
          setExchangeRate(res.data);
          setExchangeRateError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExchangeRate(null);
          setExchangeRateError('Could not load CBU exchange rate.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showRefundForm]);

  const refundReturnItem = useMemo(
    () => (refundFormData.returnId ? returns.find((r) => r.id === refundFormData.returnId) : null),
    [returns, refundFormData.returnId],
  );

  const cbuRate = exchangeRate?.rate ?? null;
  const refundMeta = useMemo(
    () => computeReturnRefundMeta(refundReturnItem, refundFormData, cbuRate),
    [refundReturnItem, refundFormData, cbuRate],
  );

  const fetchReturns = async () => {
    try {
      const response = await api.get('/returns/');
      const returnsList = response.data.results || response.data;
      setReturns(returnsList);
      applyFilters(returnsList);
    } catch (error) {
      console.error('Error fetching returns:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (returnsList, field) => {
    const values = returnsList
      .map(returnItem => returnItem.product_detail?.[field])
      .filter(Boolean);
    return [...new Set(values)].sort();
  };

  const applyFilters = (returnsList) => {
    let filtered = returnsList;
    
    if (filters.category) {
      filtered = filtered.filter(returnItem =>
        returnItem.product_detail?.category === filters.category
      );
    }
    if (filters.brand) {
      filtered = filtered.filter(returnItem => 
        returnItem.product_detail?.brand === filters.brand
      );
    }
    if (filters.model) {
      filtered = filtered.filter(returnItem => 
        returnItem.product_detail?.model === filters.model
      );
    }
    if (filters.size) {
      filtered = filtered.filter(returnItem => 
        returnItem.product_detail?.size === filters.size
      );
    }
    if (filters.color) {
      filtered = filtered.filter(returnItem => 
        returnItem.product_detail?.color === filters.color
      );
    }
    if (filters.reason) {
      filtered = filtered.filter(returnItem => returnItem.reason === filters.reason);
    }
    if (filters.year) {
      filtered = filtered.filter(returnItem => {
        const returnYear = new Date(returnItem.return_date).getFullYear();
        return returnYear.toString() === filters.year;
      });
    }
    if (filters.month) {
      filtered = filtered.filter(returnItem => {
        const returnMonth = new Date(returnItem.return_date).getMonth() + 1;
        return returnMonth.toString() === filters.month;
      });
    }
    
    setFilteredReturns(filtered);
  };

  useEffect(() => {
    if (returns.length > 0) {
      applyFilters(returns);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const returnColumnTotals = useMemo(() => {
    let quantity = 0;
    let uzs = 0;
    let usd = 0;
    for (const r of filteredReturns) {
      quantity += parseInt(r.quantity, 10) || 0;
      uzs += (parseFloat(r.refund_uzs_cash) || 0) + (parseFloat(r.refund_uzs_card) || 0);
      usd += (parseFloat(r.refund_usd_cash) || 0) + (parseFloat(r.refund_usd_card) || 0);
    }
    return { quantity, uzs, usd };
  }, [filteredReturns]);

  /** Units already tied to return rows per sale (any refund status) — prevents over-returning the same sale line. */
  const qtyReturnedBySaleId = useMemo(() => {
    const m = new Map();
    for (const r of returns) {
      let sid = r.sale;
      if (sid == null || sid === '') continue;
      if (typeof sid === 'object' && sid !== null) sid = sid.id;
      sid = Number(sid);
      if (!Number.isFinite(sid)) continue;
      const q = parseInt(r.quantity, 10) || 0;
      m.set(sid, (m.get(sid) || 0) + q);
    }
    return m;
  }, [returns]);

  const getRemainingReturnQtyForSale = useCallback(
    (sale) => {
      if (!sale?.id) return 0;
      const used = qtyReturnedBySaleId.get(sale.id) || 0;
      return Math.max(0, (parseInt(sale.quantity, 10) || 0) - used);
    },
    [qtyReturnedBySaleId]
  );

  const selectedSaleForReturn = useMemo(() => {
    if (!formData.sale) return null;
    const id = parseInt(formData.sale, 10);
    if (!Number.isFinite(id)) return null;
    return sales.find((s) => s.id === id) || null;
  }, [formData.sale, sales]);

  const returnableSales = useMemo(
    () => sales.filter((s) => getRemainingReturnQtyForSale(s) > 0),
    [sales, getRemainingReturnQtyForSale],
  );

  const newReturnEligibleSales = useMemo(() => {
    const cid = formData.customer ? parseInt(formData.customer, 10) : null;
    const pid = formData.product ? parseInt(formData.product, 10) : null;
    return returnableSales.filter((s) => {
      if (cid != null && !Number.isNaN(cid) && s.customer !== cid) return false;
      if (pid != null && !Number.isNaN(pid) && s.product !== pid) return false;
      if (formCategory && s.product_detail?.category !== formCategory) return false;
      return true;
    });
  }, [returnableSales, formData.customer, formData.product, formCategory]);

  const newReturnFormCustomerIds = useMemo(() => {
    const pid = formData.product ? parseInt(formData.product, 10) : null;
    const ids = new Set();
    for (const s of returnableSales) {
      if (formCategory && s.product_detail?.category !== formCategory) continue;
      if (pid != null && !Number.isNaN(pid) && s.product !== pid) continue;
      if (s.customer) ids.add(s.customer);
    }
    return ids;
  }, [returnableSales, formCategory, formData.product]);

  const newReturnFormCustomers = useMemo(
    () => customers.filter((c) => newReturnFormCustomerIds.has(c.id)),
    [customers, newReturnFormCustomerIds],
  );

  const newReturnFormProducts = useMemo(() => {
    const cid = formData.customer ? parseInt(formData.customer, 10) : null;
    const productIds = new Set();
    for (const s of returnableSales) {
      if (cid != null && !Number.isNaN(cid) && s.customer !== cid) continue;
      if (formCategory && s.product_detail?.category !== formCategory) continue;
      if (s.product) productIds.add(s.product);
    }
    return products.filter((p) => productIds.has(p.id));
  }, [returnableSales, products, formData.customer, formCategory]);

  const newReturnFormCategories = useMemo(() => {
    const cid = formData.customer ? parseInt(formData.customer, 10) : null;
    const pid = formData.product ? parseInt(formData.product, 10) : null;
    const cats = new Set();
    for (const s of returnableSales) {
      if (cid != null && !Number.isNaN(cid) && s.customer !== cid) continue;
      if (pid != null && !Number.isNaN(pid) && s.product !== pid) continue;
      const cat = s.product_detail?.category;
      if (cat) cats.add(cat);
    }
    return [...cats].sort();
  }, [returnableSales, formData.customer, formData.product]);

  const pruneNewReturnForm = useCallback(
    (patch, categoryValue = formCategory) => {
      const merged = { ...formData, ...patch };
      const cid = merged.customer ? parseInt(merged.customer, 10) : null;
      const pid = merged.product ? parseInt(merged.product, 10) : null;
      const matches = returnableSales.filter((s) => {
        if (cid != null && !Number.isNaN(cid) && s.customer !== cid) return false;
        if (pid != null && !Number.isNaN(pid) && s.product !== pid) return false;
        if (categoryValue && s.product_detail?.category !== categoryValue) return false;
        return true;
      });
      let customer = merged.customer;
      let product = merged.product;
      let sale = merged.sale;
      if (customer && !matches.some((s) => s.customer === cid)) customer = '';
      if (product && !matches.some((s) => s.product === pid)) product = '';
      if (sale && !matches.some((s) => s.id === parseInt(sale, 10))) sale = '';
      const pricingCleared = sale
        ? {}
        : { sold_price: '', sold_price_currency: 'USD' };
      return { ...merged, customer, product, sale, ...pricingCleared };
    },
    [formData, formCategory, returnableSales],
  );

  useEffect(() => {
    if (!showForm) return;
    if (formCategory && !newReturnFormCategories.includes(formCategory)) {
      setFormCategory('');
    }
    const cid = formData.customer ? parseInt(formData.customer, 10) : null;
    if (formData.customer && (Number.isNaN(cid) || !newReturnFormCustomerIds.has(cid))) {
      setFormData((prev) => pruneNewReturnForm({ ...prev, customer: '', sale: '' }));
    }
    const pid = formData.product ? parseInt(formData.product, 10) : null;
    if (
      formData.product &&
      (Number.isNaN(pid) || !newReturnFormProducts.some((p) => p.id === pid))
    ) {
      setFormData((prev) => pruneNewReturnForm({ ...prev, product: '', sale: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showForm,
    formCategory,
    newReturnFormCategories,
    newReturnFormCustomerIds,
    newReturnFormProducts,
    formData.customer,
    formData.product,
  ]);

  const resolveSaleForPricing = useCallback(() => {
    if (selectedSaleForReturn) return selectedSaleForReturn;
    if (formData.product && newReturnEligibleSales.length === 1) {
      return newReturnEligibleSales[0];
    }
    return null;
  }, [selectedSaleForReturn, formData.product, newReturnEligibleSales]);

  const applySuggestedRefundAmount = useCallback((sale, quantity) => {
    if (!sale) return {};
    const currency = getSaleCurrency(sale);
    const unitPrice = getSaleUnitPrice(sale);
    const autoTotal = formatAutoSoldPrice(unitPrice, quantity, currency);
    if (!autoTotal) return { sold_price_currency: currency };
    return {
      sold_price: autoTotal,
      sold_price_currency: currency,
    };
  }, []);

  const mergeSuggestedRefund = useCallback(
    (patch, sale, quantity) => {
      if (refundAmountTouched) return patch;
      return { ...patch, ...applySuggestedRefundAmount(sale, quantity) };
    },
    [refundAmountTouched, applySuggestedRefundAmount],
  );

  const formReturnDue = useMemo(() => {
    const sale = resolveSaleForPricing();
    return computeFormReturnDue(sale, formData.quantity);
  }, [resolveSaleForPricing, formData.quantity]);

  const refundAmountOverDue = useMemo(
    () => refundAmountExceedsDue(formData.sold_price, formData.sold_price_currency, formReturnDue),
    [formData.sold_price, formData.sold_price_currency, formReturnDue],
  );

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      setProducts(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales/');
      setSales(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers/');
      setCustomers(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    if (!formData.sale) {
      showNotification('Please select a sale.', 'error');
      return;
    }
    if (formData.reason === 'other' && !String(formData.notes || '').trim()) {
      showNotification('Please enter notes when reason is Other.', 'error');
      return;
    }
    const qty = parseInt(formData.quantity, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      showNotification('Please enter a valid quantity (at least 1).', 'error');
      return;
    }
    const refundTotal = parseFloat(String(formData.sold_price ?? '').trim());
    if (!Number.isFinite(refundTotal) || refundTotal <= 0) {
      showNotification('Please enter a valid refund amount (greater than zero).', 'error');
      return;
    }
    const refundAmountApi = formatSoldPriceForApi(refundTotal, formData.sold_price_currency);
    if (!refundAmountApi) {
      showNotification('Please enter a valid refund amount.', 'error');
      return;
    }
    if (refundAmountOverDue) {
      showNotification(
        `Refund amount (${formatDisplayAmount(parseFloat(formData.sold_price), formData.sold_price_currency)}) cannot exceed the sale amount due (${formatDisplayAmount(formReturnDue.amount, formReturnDue.currency)}).`,
        'error',
      );
      return;
    }
    if (formData.sale) {
      const selectedSale = sales.find((s) => s.id === parseInt(formData.sale, 10));
      if (selectedSale) {
        const rem = getRemainingReturnQtyForSale(selectedSale);
        const q = qty;
        const used = qtyReturnedBySaleId.get(selectedSale.id) || 0;
        if (q > rem) {
          showNotification(
            `Return quantity (${q}) exceeds what can still be returned on this sale (${rem} unit(s) left; ${used} already on return records).`,
            'error'
          );
          return;
        }
      }
    }
    try {
      const payload = {
        product: parseInt(formData.product, 10),
        quantity: qty,
        reason: formData.reason,
        notes: String(formData.notes || '').trim(),
        sale: parseInt(formData.sale, 10),
        sold_price: refundAmountApi,
        sold_price_currency: formData.sold_price_currency,
      };
      if (formData.customer) {
        payload.customer = parseInt(formData.customer, 10);
      }
      if (Number.isNaN(payload.product) || Number.isNaN(payload.sale)) {
        showNotification('Please select a product and sale.', 'error');
        return;
      }
      await api.post('/returns/', payload);
      showNotification('Return created successfully!', 'success');
      setShowForm(false);
      setFormCategory('');
      setFormData({
        product: '',
        sale: '',
        customer: '',
        quantity: '',
        sold_price: '',
        sold_price_currency: 'USD',
        reason: 'customer_request',
        notes: '',
      });
      fetchReturns();
    } catch (error) {
      console.error('Error creating return:', error);
      const d = error.response?.data;
      const msg =
        extractReturnApiError(d) ||
        error.message ||
        'Error creating return';
      showNotification(typeof msg === 'string' ? msg : 'Error creating return', 'error');
    }
  };

  const handleMarkRefunded = (returnId) => {
    const returnItem = returns.find((r) => r.id === returnId);
    const due = computeReturnRefundDue(returnItem);
    setRefundFormData({
      returnId,
      uzs: due.currency === 'UZS' && due.amount != null ? String(due.amount) : '',
      usd: due.currency === 'USD' && due.amount != null ? String(due.amount) : '',
    });
    setShowRefundForm(true);
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    const returnItem = refundReturnItem;
    const uzs = parseFloat(refundFormData.uzs) || 0;
    const usd = parseFloat(refundFormData.usd) || 0;
    if (uzs + usd === 0) {
      showNotification('Please enter at least one refund amount.', 'error');
      return;
    }
    const meta = computeReturnRefundMeta(returnItem, refundFormData, cbuRate);
    if (meta.mixed) {
      showNotification(
        exchangeRateError || 'Exchange rate is still loading. Try again in a moment.',
        'error',
      );
      return;
    }
    if (meta.dueUnavailable) {
      showNotification('Refund due amount is not available for this return.', 'error');
      return;
    }
    const sc = meta.sc;
    const crossSingle =
      (sc === 'USD' && uzs > 0 && usd === 0) || (sc === 'UZS' && usd > 0 && uzs === 0);
    const isCombinedRefund = uzs > 0 && usd > 0;
    let acceptPartialRefund = false;

    if (isCombinedRefund && meta.splitCurrency) {
      if (meta.needs) {
        acceptPartialRefund = true;
      }
      if (
        !window.confirm(
          buildReturnCombinedRefundConfirmMessage({
            returnItem,
            meta,
            uzsAmount: uzs,
            usdAmount: usd,
            exchangeRate,
            cbuRate,
          }),
        )
      ) {
        return;
      }
    } else {
      if (crossSingle && cbuRate) {
        const otherCurrency = sc === 'USD' ? 'UZS' : 'USD';
        const otherAmount = sc === 'USD' ? uzs : usd;
        if (
          !window.confirm(
            buildReturnCrossCurrencyConfirmMessage({
              due: meta.due,
              sc,
              otherCurrency,
              otherAmount,
              paidInSaleCurrency: meta.paid,
              exchangeRate,
              cbuRate,
            }),
          )
        ) {
          return;
        }
      }
      if (meta.needs) {
        acceptPartialRefund = true;
        if (
          !window.confirm(
            buildReturnCombinedRefundConfirmMessage({
              returnItem,
              meta,
              uzsAmount: uzs,
              usdAmount: usd,
              exchangeRate,
              cbuRate,
            }),
          )
        ) {
          return;
        }
      } else if (meta.hasOverpayment && meta.due != null && meta.overpaymentAmount != null) {
        const dueLabel = formatDisplayAmount(meta.due, meta.sc);
        const paidLabel = formatDisplayAmount(meta.paid, meta.sc);
        const excessLabel = formatDisplayAmount(meta.overpaymentAmount, meta.sc);
        const msg = [
          'Refund entered is higher than the amount due.',
          `Due: ${dueLabel} · Entered: ${paidLabel} · Excess: ${excessLabel}.`,
          'Payable and profit/loss will use the settled refund amount.',
          'Continue?',
        ]
          .filter(Boolean)
          .join('\n\n');
        if (!window.confirm(msg)) return;
      }
    }
    try {
      const balanceResponse = await api.get('/cash-balance/');
      const balanceList = balanceResponse.data.results || balanceResponse.data;
      const balChecks = [
        { amount: uzs, currency: 'UZS' },
        { amount: usd, currency: 'USD' },
      ];
      for (const { amount, currency } of balChecks) {
        if (amount > 0) {
          const available = cashBalanceTotalByCurrency(balanceList, currency);
          if (available < amount) {
            showNotification(
              formatInsufficientLedgerMessage(currency, available, amount, { context: 'refund' }),
              'error',
            );
            return;
          }
        }
      }
      if (!isCombinedRefund && !meta.needs && !confirmReturnRefund(returnItem, uzs, usd, meta)) {
        return;
      }
      const requestData = buildReturnRefundRequest(refundFormData, exchangeRate, {
        acceptPartialRefund,
      });
      await api.post(`/returns/${refundFormData.returnId}/mark_refunded/`, requestData);
      setShowRefundForm(false);
      setRefundFormData({ returnId: null, uzs: '', usd: '' });
      showNotification('Return marked as refunded.', 'success');
      fetchReturns();
    } catch (error) {
      console.error('Error marking return as refunded:', error);
      showNotification(
        error.response?.data?.error || error.response?.data?.detail || 'Error marking return as refunded',
        'error',
      );
    }
  };

  const returnsSort = useClientTableSort(RETURNS_SORT_ACCESSORS);
  const displayReturns = useMemo(() => {
    const rows = filteredReturns;
    if (!rows?.length) return rows;
    if (returnsSort.sortCol && RETURNS_SORT_ACCESSORS[returnsSort.sortCol]) {
      const get = RETURNS_SORT_ACCESSORS[returnsSort.sortCol];
      const sign = returnsSort.sortDir === 'desc' ? -1 : 1;
      return [...rows].sort((a, b) => {
        const pending = compareNotRefundedFirst(a, b);
        if (pending !== 0) return pending;
        return compareForSort(get(a), get(b)) * sign;
      });
    }
    return [...rows].sort((a, b) => {
      const pending = compareNotRefundedFirst(a, b);
      if (pending !== 0) return pending;
      const ta = new Date(a.return_date).getTime() || 0;
      const tb = new Date(b.return_date).getTime() || 0;
      return tb - ta;
    });
  }, [filteredReturns, returnsSort]);

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      {notification.visible && (
        <div className={`notification ${notification.type}`} style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
          padding: '12px 20px', borderRadius: '6px', color: 'white', fontWeight: 500,
          backgroundColor: notification.type === 'success' ? '#4caf50' : '#f44336',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', maxWidth: '400px'
        }}>
          {notification.message}
        </div>
      )}
      <div className="page-header">
        <h1>Returns</h1>
        {canCreateReturn && (
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Return'}
        </button>
        )}
      </div>

      {showForm && canCreateReturn && (
        <div className="form-card">
          <h2>New Return</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {(() => {
                const searchLower = productSearch.toLowerCase();
                const filteredProductOptions = newReturnFormProducts.filter((p) => {
                  if (!productSearch) return true;
                  const haystack = `${p.id} ${p.brand ?? ''} ${p.model ?? ''} ${p.size ?? ''} ${p.color ?? ''}`.toLowerCase();
                  return haystack.includes(searchLower);
                });
                const selectedReturnProduct =
                  newReturnFormProducts.find((p) => p.id === parseInt(formData.product, 10)) || null;

                return (
                  <>
                  <div className="form-group">
                    <label>Customer (Optional)</label>
                    <CustomerSearchableSelect
                      customers={newReturnFormCustomers}
                      value={formData.customer}
                      allowEmpty
                      emptyLabel="All customers"
                      placeholder="All customers"
                      aria-label="Customer"
                      onChange={(customerId) => {
                        setProductSearch('');
                        setProductDropdownOpen(false);
                        setFormData((prev) =>
                          pruneNewReturnForm({
                            ...prev,
                            customer: customerId,
                            sale: '',
                            sold_price: '',
                            sold_price_currency: 'USD',
                          }),
                        );
                      }}
                    />
                    {(formCategory || formData.product) && (
                      <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                        Showing customers with returnable sales
                        {formCategory ? <> in <strong>{formCategory}</strong></> : null}
                        {formData.product
                          ? (() => {
                              const p = products.find((x) => x.id === parseInt(formData.product, 10));
                              return p ? (
                                <>
                                  {' '}
                                  for <strong>{p.brand} {p.model}</strong>
                                </>
                              ) : null;
                            })()
                          : null}
                        .
                      </small>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Category <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter)</span></label>
                    <select
                      value={formCategory}
                      onChange={(e) => {
                        const nextCat = e.target.value;
                        setProductSearch('');
                        setProductDropdownOpen(false);
                        setFormCategory(nextCat);
                        setFormData((prev) =>
                          pruneNewReturnForm(
                            {
                              ...prev,
                              product: '',
                              sale: '',
                              sold_price: '',
                              sold_price_currency: 'USD',
                            },
                            nextCat,
                          ),
                        );
                      }}
                    >
                      <option value="">All Categories</option>
                      {newReturnFormCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" ref={productDropdownRef} style={{ position: 'relative' }}>
                    <label>Product</label>
                    <>
                      <div
                        onClick={() => {
                          setProductDropdownOpen((o) => !o);
                          setProductSearch('');
                        }}
                        style={{
                          border: '1px solid #ddd',
                          borderRadius: '5px',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          background: 'white',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          minHeight: '40px',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{ color: selectedReturnProduct ? '#333' : '#999' }}>
                          {selectedReturnProduct
                            ? returnProductPickerLabel(selectedReturnProduct)
                            : 'Select a product'}
                        </span>
                        <span style={{ color: '#666', fontSize: '0.8em' }}>{productDropdownOpen ? '▲' : '▼'}</span>
                      </div>
                      {productDropdownOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '5px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 100,
                            maxHeight: '320px',
                            display: 'flex',
                            flexDirection: 'column',
                            marginTop: '4px',
                          }}
                        >
                          <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search product..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #ccc',
                                borderRadius: '5px',
                                fontSize: '14px',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {filteredProductOptions.length === 0 ? (
                              <div
                                style={{
                                  padding: '12px',
                                  color: '#999',
                                  textAlign: 'center',
                                  fontSize: '14px',
                                }}
                              >
                                No products found
                              </div>
                            ) : (
                              filteredProductOptions.map((product) => (
                                <div
                                  key={product.id}
                                  role="presentation"
                                  onClick={() => {
                                    const nextCategory = product.category || formCategory;
                                    if (product.category) setFormCategory(product.category);
                                    setFormData((prev) =>
                                      pruneNewReturnForm(
                                        {
                                          ...prev,
                                          product: String(product.id),
                                          sale: '',
                                          sold_price: '',
                                          sold_price_currency: 'USD',
                                        },
                                        nextCategory,
                                      ),
                                    );
                                    setProductDropdownOpen(false);
                                    setProductSearch('');
                                  }}
                                  style={{
                                    padding: '9px 12px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    borderBottom: '1px solid #f0f0f0',
                                    background:
                                      parseInt(formData.product, 10) === product.id ? '#e8f4fd' : 'white',
                                    fontWeight: parseInt(formData.product, 10) === product.id ? 600 : 400,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (parseInt(formData.product, 10) !== product.id)
                                      e.currentTarget.style.background = '#f5f5f5';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (parseInt(formData.product, 10) !== product.id)
                                      e.currentTarget.style.background = 'white';
                                  }}
                                >
                                  {returnProductPickerLabel(product)}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </>
                    {(formData.customer || formCategory) && (
                      <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                        {formData.customer ? (
                          <>
                            Products with returnable sales for{' '}
                            <strong>
                              {customers.find((c) => c.id === parseInt(formData.customer, 10))?.name}
                            </strong>
                          </>
                        ) : (
                          <>Products with returnable sales</>
                        )}
                        {formCategory ? (
                          <>
                            {' '}
                            in <strong>{formCategory}</strong>
                          </>
                        ) : null}
                        .
                      </small>
                    )}
                  </div>
                  </>
                );
              })()}
              <div className="form-group">
                <label>Sale <span style={{ color: '#e53e3e' }}>*</span></label>
                <select
                  value={formData.sale}
                  required
                  onChange={(e) => {
                    const saleId = e.target.value;
                    const sale = saleId
                      ? sales.find((s) => s.id === parseInt(saleId, 10))
                      : null;
                    const quantity = formData.quantity || '1';
                    setFormData((prev) =>
                      mergeSuggestedRefund(
                        { ...prev, sale: saleId, quantity },
                        sale,
                        quantity,
                      ),
                    );
                    setRefundAmountTouched(false);
                  }}
                >
                  <option value="">Select sale</option>
                  {newReturnEligibleSales.map((sale) => (
                    <option key={sale.id} value={sale.id}>
                      Sale #{sale.id} - {sale.product_detail?.brand} {sale.product_detail?.model}
                      {sale.customer_detail?.name ? ` (${sale.customer_detail.name})` : ''}
                    </option>
                  ))}
                </select>
                {(formData.customer || formData.product || formCategory) && (
                  <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                    Filtered by:{' '}
                    {formData.customer && (
                      <strong>{customers.find((c) => c.id === parseInt(formData.customer, 10))?.name}</strong>
                    )}
                    {formData.customer && (formCategory || formData.product) && ' · '}
                    {formCategory && <strong>{formCategory}</strong>}
                    {formCategory && formData.product && ' · '}
                    {formData.product && (
                      <strong>
                        {products.find((p) => p.id === parseInt(formData.product, 10))?.brand}{' '}
                        {products.find((p) => p.id === parseInt(formData.product, 10))?.model}
                      </strong>
                    )}
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={
                    formData.sale
                      ? (() => {
                          const s = sales.find((x) => x.id === parseInt(formData.sale, 10));
                          const rem = s ? getRemainingReturnQtyForSale(s) : 0;
                          return rem > 0 ? rem : undefined;
                        })()
                      : undefined
                  }
                  value={formData.quantity}
                  onChange={(e) => {
                    const quantity = e.target.value;
                    const sale = resolveSaleForPricing();
                    setFormData((prev) =>
                      mergeSuggestedRefund({ ...prev, quantity }, sale, quantity),
                    );
                  }}
                  required
                />
                {formData.sale && (() => {
                  const selectedSale = sales.find((s) => s.id === parseInt(formData.sale, 10));
                  if (!selectedSale) return null;
                  const remaining = getRemainingReturnQtyForSale(selectedSale);
                  const alreadyReturned = qtyReturnedBySaleId.get(selectedSale.id) || 0;
                  return (
                    <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                      Original sale qty: <strong>{selectedSale.quantity}</strong>
                      {' · '}Already on return records: <strong>{alreadyReturned}</strong>
                      {' · '}You can still return: <strong>{remaining}</strong>
                    </small>
                  );
                })()}
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                {formReturnDue.amount != null && !Number.isNaN(formReturnDue.amount) && (
                  <div
                    style={{
                      marginBottom: '10px',
                      padding: '10px 12px',
                      background: '#f0f4f8',
                      borderRadius: '6px',
                      fontSize: '0.9em',
                    }}
                  >
                    <strong>Sale amount due:</strong>{' '}
                    {formatDisplayAmount(formReturnDue.amount, formReturnDue.currency)}
                    {Number.isFinite(formReturnDue.unitPrice) && (
                      <span style={{ color: '#666', marginLeft: '8px' }}>
                        ({formatDisplayAmount(formReturnDue.unitPrice, formReturnDue.currency)} / unit)
                      </span>
                    )}
                  </div>
                )}
                <label>Refund amount <span style={{ color: '#e53e3e' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    step={formData.sold_price_currency === 'UZS' ? '1' : '0.01'}
                    min="0.01"
                    required
                    value={formData.sold_price}
                    onChange={(e) => {
                      setRefundAmountTouched(true);
                      setFormData({ ...formData, sold_price: e.target.value });
                    }}
                    placeholder={
                      formReturnDue.amount != null
                        ? `Up to ${formReturnDue.amount}`
                        : 'Enter refund to customer'
                    }
                    style={{ flex: '1 1 160px' }}
                  />
                  <select
                    value={formData.sold_price_currency}
                    onChange={(e) => {
                      setRefundAmountTouched(true);
                      setFormData({ ...formData, sold_price_currency: e.target.value });
                    }}
                    style={{ width: '96px', flexShrink: 0 }}
                  >
                    <option value="USD">USD</option>
                    <option value="UZS">UZS</option>
                  </select>
                  {formReturnDue.amount != null && (
                    <button
                      type="button"
                      className="btn-edit"
                      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                      onClick={() => {
                        const sale = resolveSaleForPricing();
                        const pricing = applySuggestedRefundAmount(sale, formData.quantity);
                        setRefundAmountTouched(false);
                        setFormData((prev) => ({ ...prev, ...pricing }));
                      }}
                    >
                      Use full sale amount
                    </button>
                  )}
                </div>
                <small style={{ color: '#666', marginTop: '6px', display: 'block' }}>
                  Amount owed to the customer for this return. Payables and profit/loss use this value when
                  the return is created (can be less than the sale amount due).
                </small>
                {(formReturnDue.amount == null || Number.isNaN(formReturnDue.amount)) && (
                  <small style={{ color: '#888', marginTop: '4px', display: 'block' }}>
                    Select a sale and quantity to see the sale amount due.
                  </small>
                )}
                {refundAmountOverDue && formReturnDue.amount != null && (
                  <small style={{ color: '#e65100', marginTop: '6px', display: 'block', fontWeight: 500 }}>
                    Refund amount cannot exceed sale amount due (
                    {formatDisplayAmount(formReturnDue.amount, formReturnDue.currency)}).
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Reason</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  required
                >
                  <option value="defective">Defective</option>
                  <option value="wrong_size">Wrong Size</option>
                  <option value="wrong_item">Wrong Item</option>
                  <option value="customer_request">Customer Request</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes{formData.reason === 'other' ? ' *' : ''}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  required={formData.reason === 'other'}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Return
              </button>
            </div>
          </form>
        </div>
      )}

      {showRefundForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Mark Return #{refundFormData.returnId} as Refunded</h2>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            Enter the UZS and/or USD refund amount. Combined refunds use the CBU rate (one confirmation).
            You may refund less than the amount due; payable and profit/loss will match the cash you pay.
          </p>
          {exchangeRate?.label && (
            <p style={{ color: '#4a5568', marginBottom: '12px', fontSize: '0.85em' }}>
              {exchangeRate.label}
            </p>
          )}
          {exchangeRateError && (
            <p style={{ color: '#b45309', marginBottom: '12px', fontSize: '0.85em' }}>{exchangeRateError}</p>
          )}
          {refundMeta.due != null && !refundMeta.dueUnavailable && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                background: '#f8f9fa',
                borderRadius: 6,
                fontSize: '0.9em',
                color: '#444',
              }}
            >
              <div>
                <strong>Refund due:</strong> {formatDisplayAmount(refundMeta.due, refundMeta.sc)}
              </div>
              {refundMeta.paid != null && (parseFloat(refundFormData.uzs) || parseFloat(refundFormData.usd)) ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Entered (in {refundMeta.sc}):</strong>{' '}
                  {formatDisplayAmount(refundMeta.paid, refundMeta.sc)}
                  {refundMeta.needs && (
                    <span style={{ color: '#c62828', marginLeft: 8 }}>
                      — below due by {formatDisplayAmount(refundMeta.short, refundMeta.sc)}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <form onSubmit={handleRefundSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>UZS</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={refundFormData.uzs}
                  onChange={(e) => setRefundFormData({ ...refundFormData, uzs: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={refundFormData.usd}
                  onChange={(e) => setRefundFormData({ ...refundFormData, usd: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Mark as Refunded
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowRefundForm(false);
                  setRefundFormData({ returnId: null, uzs: '', usd: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showForm && !showRefundForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title">Filters</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              {[...new Set(returns.map(r => r.product_detail?.category).filter(Boolean))].sort().map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Brand</label>
            <select
              value={filters.brand}
              onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
            >
              <option value="">All Brands</option>
              {getUniqueValues(returns, 'brand').map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Model</label>
            <select
              value={filters.model}
              onChange={(e) => setFilters({ ...filters, model: e.target.value })}
            >
              <option value="">All Models</option>
              {getUniqueValues(returns, 'model').map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Size</label>
            <select
              value={filters.size}
              onChange={(e) => setFilters({ ...filters, size: e.target.value })}
            >
              <option value="">All Sizes</option>
              {getUniqueValues(returns, 'size').map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Color</label>
            <select
              value={filters.color}
              onChange={(e) => setFilters({ ...filters, color: e.target.value })}
            >
              <option value="">All Colors</option>
              {getUniqueValues(returns, 'color').map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Reason</label>
            <select
              value={filters.reason}
              onChange={(e) => setFilters({ ...filters, reason: e.target.value })}
            >
              <option value="">All Reasons</option>
              <option value="defective">Defective</option>
              <option value="wrong_size">Wrong Size</option>
              <option value="wrong_item">Wrong Item</option>
              <option value="customer_request">Customer Request</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Year</label>
            <select
              value={filters.year}
              onChange={(e) => setFilters({ ...filters, year: e.target.value })}
            >
              <option value="">All Years</option>
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <option key={year} value={year.toString()}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="filter-field">
            <label>Month</label>
            <select
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            >
              <option value="">All Months</option>
              <option value="1">January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </div>
          <div className="filter-toolbar__actions">
            <button
              type="button"
              className="btn-edit"
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', reason: '', year: '', month: '' })}
            >
              Clear all
            </button>
          </div>
        </div>
        </div>
      )}

      <div className="table-card">
        <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh columnId="id" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                ID
              </SortableTh>
              <th>Actions</th>
              <SortableTh columnId="category" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Category
              </SortableTh>
              <SortableTh columnId="brand" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Brand
              </SortableTh>
              <SortableTh columnId="model" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Model
              </SortableTh>
              <SortableTh columnId="size" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Size
              </SortableTh>
              <SortableTh columnId="color" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Color
              </SortableTh>
              <SortableTh columnId="sale" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Sale
              </SortableTh>
              <SortableTh columnId="customer" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Customer
              </SortableTh>
              <SortableTh columnId="phone" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Phone
              </SortableTh>
              <SortableTh columnId="quantity" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Quantity
              </SortableTh>
              <SortableTh columnId="reason" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Reason
              </SortableTh>
              <SortableTh columnId="refund_uzs" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Refund UZS
              </SortableTh>
              <SortableTh columnId="refund_usd" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Refund USD
              </SortableTh>
              <SortableTh columnId="refund_status" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Refund Status
              </SortableTh>
              <SortableTh columnId="notes" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Notes
              </SortableTh>
              <SortableTh columnId="processed_by" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Processed By
              </SortableTh>
              <SortableTh columnId="return_date" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Date
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {filteredReturns.length === 0 ? (
              <tr>
                <td colSpan="18" style={{ textAlign: 'center' }}>
                  No returns found
                </td>
              </tr>
            ) : (
              displayReturns.map((returnItem) => (
                <tr key={returnItem.id}>
                  <td>#{returnItem.id}</td>
                  <td>
                    {returnItem.refund_status === 'not_refunded' && canMarkRefunded && (
                      <button
                        className="btn-status"
                        onClick={() => handleMarkRefunded(returnItem.id)}
                      >
                        Mark as Refunded
                      </button>
                    )}
                  </td>
                  <td>{returnItem.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{returnItem.product_detail?.brand || '-'}</td>
                  <td>{returnItem.product_detail?.model || '-'}</td>
                  <td><strong>{returnItem.product_detail?.size || '-'}</strong></td>
                  <td><strong>{returnItem.product_detail?.color || '-'}</strong></td>
                  <td>
                    {returnItem.sale ? `Sale #${returnItem.sale}` : '-'}
                  </td>
                  <td>{returnItem.customer_detail?.name || <span style={{ color: '#bbb' }}>—</span>}</td>
                  <td>{returnItem.customer_detail?.telephone || <span style={{ color: '#bbb' }}>—</span>}</td>
                  <td>{returnItem.quantity}</td>
                  <td>{returnItem.reason.replace('_', ' ')}</td>
                  <td>
                    {(() => { const v = (parseFloat(returnItem.refund_uzs_cash) || 0) + (parseFloat(returnItem.refund_uzs_card) || 0); return v > 0 ? <span style={{ color: '#4caf50' }}>{v.toLocaleString()} UZS</span> : <span style={{ color: '#bbb' }}>—</span>; })()}
                  </td>
                  <td>
                    {(() => { const v = (parseFloat(returnItem.refund_usd_cash) || 0) + (parseFloat(returnItem.refund_usd_card) || 0); return v > 0 ? <span style={{ color: '#4caf50' }}>${v.toFixed(2)}</span> : <span style={{ color: '#bbb' }}>—</span>; })()}
                  </td>
                  <td>
                    <span className={`status-badge ${returnItem.refund_status === 'refunded' ? 'completed' : 'pending'}`}>
                      {returnItem.refund_status === 'refunded' ? 'Refunded' : 'Pending'}
                    </span>
                  </td>
                  <td>{returnItem.notes || <span style={{ color: '#bbb' }}>—</span>}</td>
                  <td>{returnItem.processed_by_detail?.username || '-'}</td>
                  <td>{new Date(returnItem.return_date).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="10" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td style={{ fontWeight: 600 }}>{returnColumnTotals.quantity.toLocaleString()}</td>
              <td>—</td>
              <td style={{ fontWeight: 600 }}>
                {returnColumnTotals.uzs > 0 ? `${returnColumnTotals.uzs.toLocaleString()} UZS` : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {returnColumnTotals.usd > 0 ? `$${returnColumnTotals.usd.toFixed(2)}` : '—'}
              </td>
              <td colSpan="4">—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Returns;

