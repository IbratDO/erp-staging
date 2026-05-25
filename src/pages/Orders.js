import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import { formatDisplayAmount, cashBalanceTotalByCurrency, formatInsufficientLedgerMessage } from '../utils/currencyFormat';
import { uniqueSupplierCountriesFromOrdersAndProducts } from '../utils/supplierCountries';
import { uniqueSupplierCargosFromOrders } from '../utils/supplierCargo';
import { prefillPayOrderSimpleTotals } from '../utils/orderPayPrefill';
import {
  numOrZero,
  plannedSellingSummary,
  plannedSupplierPerUnit,
  plannedSupplierTotal,
  plannedSupplierPaymentTotals,
} from '../utils/orderPlannedPricing';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { usePermissions } from '../hooks/usePermissions';
import CustomerSearchableSelect from '../components/CustomerSearchableSelect';
import { useClientTableSort, compareForSort } from '../utils/tableSort';

const PRODUCT_CATEGORY_TYPES = [
  { value: 'sports', label: 'Sports' },
  { value: 'casual', label: 'Casual' },
];

const categoryTypeLabel = (value) =>
  PRODUCT_CATEGORY_TYPES.find((t) => t.value === value)?.label ?? '';

const ORDER_STATUS_LABELS = {
  ordered: 'Ordered',
  order_paid: 'Order paid',
  received: 'Received',
  in_inventory: 'In Inventory',
  sold: 'Sold',
  cancelled: 'Cancelled',
};

function formatOrderStatus(status) {
  return ORDER_STATUS_LABELS[status] || String(status ?? '').replace(/_/g, ' ');
}

function showMarkAsReceivedAction(order) {
  return (
    (order.status === 'ordered' || order.status === 'order_paid') &&
    !order.has_ever_been_received
  );
}

function orderReadyForInventoryActions(order) {
  return (
    (order.status === 'received' || order.status === 'order_paid') &&
    order.order_is_paid &&
    order.cargo_is_paid
  );
}

/** Active orders first; finished in-inventory rows sink to the bottom. */
function compareNonInventoryFirst(a, b) {
  const aDone = a.status === 'in_inventory' ? 1 : 0;
  const bDone = b.status === 'in_inventory' ? 1 : 0;
  return aDone - bDone;
}

function payTotalsMatchPlanned(expUzs, expUsd, uzsCash, uzsCard, usdCash, usdCard) {
  const inUzs = (uzsCash || 0) + (uzsCard || 0);
  const inUsd = (usdCash || 0) + (usdCard || 0);
  const tolUzs = 0.501;
  const tolUsd = 0.015;
  return (
    Math.abs(expUzs - inUzs) <= tolUzs && Math.abs(expUsd - inUsd) <= tolUsd
  );
}

/** Planned cargo amounts on the order (before this payment). */
function plannedCargoPaymentTotals(order) {
  if (!order) return { uzs: 0, usd: 0 };
  const uzs = numOrZero(order.cargo_cost_uzs);
  const usd = numOrZero(order.cargo_cost_usd);
  return { uzs, usd };
}

/**
 * Cargo pay form: single UZS field + single USD field (Option A rolls into *_cash buckets).
 * @returns {false} if user cancels.
 */
function confirmCargoPaymentIfNeeded(order, uzsEntered, usdEntered) {
  const uz = Number(uzsEntered) || 0;
  const us = Number(usdEntered) || 0;
  const { uzs: expZ, usd: expD } = plannedCargoPaymentTotals(order);

  if (payTotalsMatchPlanned(expZ, expD, uz, 0, us, 0)) {
    return true;
  }

  if (uz + us === 0) {
    const hadPlannedCargo = expZ + expD > 0;
    const msg = hadPlannedCargo
      ? 'This order shows cargo amounts on record:\n' +
        `UZS: ${formatDisplayAmount(expZ, 'UZS')}; USD: ${formatDisplayAmount(expD, 'USD')}\n\n` +
        'You submitted 0 everywhere — cargo will be recorded as FREE and those cargo amounts cleared.\n\nProceed?'
      : `Record cargo as paid with no freight charge (all amounts zero)?`;

    return window.confirm(msg);
  }

  const msg =
    'The cargo payment totals you entered differ from the cargo amount on this order.\n\n' +
    `On order — UZS: ${formatDisplayAmount(expZ, 'UZS')}; USD: ${formatDisplayAmount(expD, 'USD')}\n` +
    `Entered — UZS: ${formatDisplayAmount(uz, 'UZS')}; USD: ${formatDisplayAmount(us, 'USD')}\n\n` +
    'Proceed anyway with this cargo payment?';

  return window.confirm(msg);
}

/**
 * “Pay for the order” / supplier cost: compares form UZS + USD totals to planned supplier legs.
 * @returns {false} if user cancels.
 */
function confirmOrderPayTotalsIfMismatch(order, uzsEntered, usdEntered) {
  const uz = Number(uzsEntered) || 0;
  const us = Number(usdEntered) || 0;
  const { uzs: expZ, usd: expD } = plannedSupplierPaymentTotals(order);
  if (payTotalsMatchPlanned(expZ, expD, uz, 0, us, 0)) {
    return true;
  }

  const msg =
    "The payment totals you entered differ from this order's planned supplier cost (from when the order was created).\n\n" +
    `Planned — UZS: ${formatDisplayAmount(expZ, 'UZS')}; USD: ${formatDisplayAmount(expD, 'USD')}\n` +
    `Entered — UZS: ${formatDisplayAmount(uz, 'UZS')}; USD: ${formatDisplayAmount(us, 'USD')}\n\n` +
    'Proceed anyway with this payment?';

  return window.confirm(msg);
}

function formatOrderPaymentAmounts(uzs, usd) {
  if (uzs <= 0 && usd <= 0) return '$0.00';
  const parts = [];
  if (uzs > 0) parts.push(formatDisplayAmount(uzs, 'UZS'));
  if (usd > 0) parts.push(formatDisplayAmount(usd, 'USD'));
  return parts.length ? parts.join(' + ') : '$0.00';
}

function formatOrderDueAmount(order) {
  const { uzs, usd } = plannedSupplierPaymentTotals(order);
  if (uzs <= 0 && usd <= 0) {
    return '— (no planned supplier cost recorded)';
  }
  return formatOrderPaymentAmounts(uzs, usd);
}

function orderDueUnitDetail(order) {
  const qi = parseInt(order?.ordered_quantity, 10) || 0;
  if (qi <= 0) return '';
  const { uzs, usd } = plannedSupplierPaymentTotals(order);
  if (uzs > 0) {
    return `\n(${formatDisplayAmount(uzs / qi, 'UZS')} / unit × ${qi})`;
  }
  if (usd > 0) {
    const pu = parseFloat(order.cost_per_unit);
    if (Number.isFinite(pu) && pu > 0) {
      return `\n(${formatDisplayAmount(pu, 'USD')} / unit × ${qi})`;
    }
  }
  return '';
}

/** Client eShop orders: always confirm before paying (due vs entered). @returns {false} if user cancels. */
function confirmClientOrderPay(order, uzsEntered, usdEntered) {
  const uz = Number(uzsEntered) || 0;
  const us = Number(usdEntered) || 0;
  const productLabel = order?.product_detail
    ? productOrderPickerLabel(order.product_detail)
    : `Product #${order?.product ?? '?'}`;
  const customerLine = order?.customer_detail?.name
    ? `\nCustomer: ${order.customer_detail.name}`
    : '';
  const notesRaw = String(order?.client_eshop_notes || '').trim();
  const notesLine = notesRaw
    ? `\nClient notes: ${notesRaw.length > 120 ? `${notesRaw.slice(0, 120)}…` : notesRaw}`
    : '';

  const msg =
    `Pay for Order #${order?.id ?? '?'}?\n\n` +
    `${productLabel}\n` +
    `Qty: ${order?.ordered_quantity ?? '—'} · eShop: Client${customerLine}${notesLine}\n\n` +
    `Due amount: ${formatOrderDueAmount(order)}${orderDueUnitDetail(order)}\n` +
    `Paying: ${formatOrderPaymentAmounts(uz, us)}\n\n` +
    'Proceed with this payment?';

  return window.confirm(msg);
}

function productOrderPickerLabel(p) {
  if (!p) return '';
  const bits = [p.brand, p.model, p.size ? `size ${p.size}` : null, p.color].filter(Boolean);
  return bits.join(' · ');
}

const BUILTIN_ESHOP_SLUGS = new Set([
  'zalando',
  'best_secret',
  'adidas',
  'unidays',
  'nike',
  'asos',
  'other',
  'client',
]);

function isClientEshopSlug(eshop) {
  return String(eshop || '').trim().toLowerCase() === 'client';
}

/** Built-in slug → table / display label */
const KNOWN_ESHOP_LABELS = {
  zalando: 'Zalando',
  best_secret: 'Best Secret',
  adidas: 'Adidas',
  unidays: 'UniDays',
  nike: 'Nike',
  asos: 'ASOS',
  other: 'Other',
  client: 'Client',
};

function formatEshopDisplay(eshop) {
  const raw = String(eshop ?? '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  return KNOWN_ESHOP_LABELS[key] ?? raw;
}

function orderSellingUsdPerUnitForSort(order) {
  const qi = parseInt(order.ordered_quantity, 10) || 0;
  const ud = numOrZero(order.selling_usd_cash) + numOrZero(order.selling_usd_card);
  if (qi > 0 && ud > 0) return ud / qi;
  const legacyPu = parseFloat(order.selling_price);
  const hasLegacy =
    order.selling_price != null &&
    order.selling_price !== '' &&
    !Number.isNaN(legacyPu) &&
    legacyPu > 0;
  return hasLegacy ? legacyPu : 0;
}

function orderCostPerUnitForSort(order) {
  const qi = parseInt(order.ordered_quantity, 10) || 1;
  const uzs = numOrZero(order.supplier_cost_uzs_cash) + numOrZero(order.supplier_cost_uzs_card);
  const usdTot = parseFloat(order.cost_total) || 0;
  const usdPu = parseFloat(order.cost_per_unit) || 0;
  if (usdTot > 0 && uzs <= 0 && !Number.isNaN(usdPu)) return usdPu;
  if (uzs > 0 && usdTot <= 0) return uzs / qi;
  return 0;
}

/** Main orders grid — must match `<SortableTh columnId>` values. Actions excluded. */
const ORDER_SORT_ACCESSORS = {
  id: (o) => Number(o.id) || 0,
  status: (o) => String(o.status ?? '').toLowerCase(),
  category_type: (o) => String(o.product_detail?.category_type ?? '').toLowerCase(),
  category: (o) => String(o.product_detail?.category ?? '').toLowerCase(),
  brand: (o) => String(o.product_detail?.brand ?? '').toLowerCase(),
  model: (o) => String(o.product_detail?.model ?? '').toLowerCase(),
  size: (o) => String(o.product_detail?.size ?? '').toLowerCase(),
  color: (o) => String(o.product_detail?.color ?? '').toLowerCase(),
  supplier_country: (o) => String(o.supplier_country ?? '').toLowerCase(),
  supplier_cargo: (o) => String(o.supplier_cargo ?? '').toLowerCase(),
  eshop: (o) => String(o.eshop ?? '').toLowerCase(),
  order_type: (o) => String(o.order_type ?? '').toLowerCase(),
  customer: (o) => String(o.customer_detail?.name ?? '').toLowerCase(),
  qty: (o) => parseInt(o.ordered_quantity, 10) || 0,
  selling_price_unit: (o) => orderSellingUsdPerUnitForSort(o),
  cost_per_unit: (o) => orderCostPerUnitForSort(o),
  total_cost: (o) => parseFloat(o.cost_total) || 0,
  order_uzs: (o) =>
    (parseFloat(o.order_payment_uzs_cash) || 0) + (parseFloat(o.order_payment_uzs_card) || 0),
  order_usd: (o) =>
    (parseFloat(o.order_payment_usd_cash) || 0) + (parseFloat(o.order_payment_usd_card) || 0),
  cargo_uzs: (o) =>
    (parseFloat(o.cargo_payment_uzs_cash) || 0) + (parseFloat(o.cargo_payment_uzs_card) || 0),
  cargo_usd: (o) =>
    (parseFloat(o.cargo_payment_usd_cash) || 0) + (parseFloat(o.cargo_payment_usd_card) || 0),
  created_by: (o) => String(o.created_by_detail?.username ?? '').toLowerCase(),
  order_date: (o) => new Date(o.order_date || o.created_at).getTime() || 0,
};
const Orders = () => {
  const { hasPermission } = usePermissions();
  const canPayOrder = hasPermission('orders.pay_order');
  const canPayCargo = hasPermission('orders.pay_cargo');
  const canMoveInventory = hasPermission('orders.move_to_inventory');
  const canSellProduct = hasPermission('orders.sell_product');
  const canUpdateStatus = hasPermission('orders.update_status');
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [balances, setBalances] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
    category_type: '',
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    order_type: '',
    status: '',
    customer: '',
    year: '',
    month: '',
  });
  const [formData, setFormData] = useState({
    order_type: 'stock',
    product: '',
    supplier_country: '',
    supplier_cargo: '',
    eshop: '',
    client_eshop_notes: '',
    ordered_quantity: '',
    selling_usd_per_unit: '',
    cost_usd_per_unit: '',
    order_is_paid: false,
    order_payment_currency: 'USD',
    order_payment_type: 'card',
    customer: '',
    advance_payment_amount: '',
    advance_payment_currency: 'USD',
    advance_payment_type: 'cash',
    status: 'ordered',
  });

  const [paymentFormData, setPaymentFormData] = useState({
    orderId: null,
    uzs: '',
    usd: '',
    is_pay_order: false,
    is_received_and_pay: false,
    status_notes: '',
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  const [cargoFormData, setCargoFormData] = useState({
    orderId: null,
    uzs: '',
    usd: '',
  });
  const [showCargoForm, setShowCargoForm] = useState(false);
  
  const [showMoveToInventoryForm, setShowMoveToInventoryForm] = useState(false);
  const [isNewEshop, setIsNewEshop] = useState(false);
  const [isNewCountry, setIsNewCountry] = useState(false);
  const [isNewCargo, setIsNewCargo] = useState(false);
  const [formCategoryType, setFormCategoryType] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef(null);
  const paymentFormRef = useRef(null);
  const cargoFormRef = useRef(null);
  const moveToInventoryFormRef = useRef(null);
  const [moveToInventoryData, setMoveToInventoryData] = useState({
    orderId: null,
    return_advance: false,
    /** Which cash ledger leg to debit when refunding advance (UZS vs USD buckets). */
    return_payment_currency: 'USD',
    /** Editable refund amount when returning advance (defaults to booked advance when opening modal). */
    return_advance_amount: '',
  });
  
  const [customers, setCustomers] = useState([]);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    telephone: '+998',
    instagram: '',
    region: 'tashkent_city',
    notes: '',
  });
  
  // Notification state
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success', // 'success', 'error', 'info'
  });
  
  // Show notification helper
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 5000);
  };
  
  const regionChoices = [
    { value: 'andijan', label: 'Andijan' },
    { value: 'bukhara', label: 'Bukhara' },
    { value: 'fergana', label: 'Fergana' },
    { value: 'jizzakh', label: 'Jizzakh' },
    { value: 'kashkadarya', label: 'Kashkadarya' },
    { value: 'khorezm', label: 'Khorezm' },
    { value: 'namangan', label: 'Namangan' },
    { value: 'navoi', label: 'Navoi' },
    { value: 'samarkand', label: 'Samarkand' },
    { value: 'surkhandarya', label: 'Surkhandarya' },
    { value: 'syrdarya', label: 'Syrdarya' },
    { value: 'tashkent_region', label: 'Tashkent region' },
    { value: 'karakalpakstan', label: 'Karakalpakstan' },
    { value: 'tashkent_city', label: 'Tashkent city' },
  ];

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchCustomers();
    fetchBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchBalances = async () => {
    try {
      const response = await api.get('/cash-balance/');
      setBalances(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  const getAvailableBalance = (currency) => cashBalanceTotalByCurrency(balances, currency);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers/');
      setCustomers(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };
  
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerData.telephone.trim()) {
      showNotification('Telephone is required.', 'error');
      return;
    }
    try {
      const response = await api.post('/customers/', { ...newCustomerData });
      await fetchCustomers();
      setFormData({ ...formData, customer: response.data.id });
      setShowCustomerForm(false);
      setNewCustomerData({ name: '', telephone: '', instagram: '', region: '', notes: '' });
    } catch (error) {
      console.error('Error creating customer:', error);
      showNotification(error.response?.data?.error || 'Error creating customer', 'error');
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders/');
      const ordersList = response.data.results || response.data;
      setOrders(ordersList);
      applyFilters(ordersList);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (ordersList, field) => {
    const values = ordersList
      .map(order => order.product_detail?.[field])
      .filter(Boolean);
    return [...new Set(values)].sort();
  };

  const customerFilterOptions = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      if (c?.id != null) map.set(c.id, c);
    }
    for (const o of orders) {
      const d = o.customer_detail;
      if (d?.id != null && !map.has(d.id)) map.set(d.id, d);
    }
    return [...map.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    );
  }, [customers, orders]);

  const applyFilters = (ordersList) => {
    let filtered = ordersList;
    
    if (filters.category_type) {
      filtered = filtered.filter(
        (order) => order.product_detail?.category_type === filters.category_type,
      );
    }
    if (filters.category) {
      filtered = filtered.filter(order =>
        order.product_detail?.category === filters.category
      );
    }
    if (filters.brand) {
      filtered = filtered.filter(order => 
        order.product_detail?.brand === filters.brand
      );
    }
    if (filters.model) {
      filtered = filtered.filter(order => 
        order.product_detail?.model === filters.model
      );
    }
    if (filters.size) {
      filtered = filtered.filter(order => 
        order.product_detail?.size === filters.size
      );
    }
    if (filters.color) {
      filtered = filtered.filter(order => 
        order.product_detail?.color === filters.color
      );
    }
    if (filters.order_type) {
      filtered = filtered.filter(order => order.order_type === filters.order_type);
    }
    if (filters.status) {
      filtered = filtered.filter(order => order.status === filters.status);
    }
    if (filters.customer) {
      if (filters.customer === '__none__') {
        filtered = filtered.filter((order) => !order.customer && !order.customer_detail?.id);
      } else {
        const customerId = parseInt(filters.customer, 10);
        filtered = filtered.filter(
          (order) =>
            order.customer === customerId ||
            order.customer_detail?.id === customerId,
        );
      }
    }
    if (filters.year) {
      filtered = filtered.filter(order => {
        const orderYear = new Date(order.order_date || order.created_at).getFullYear();
        return orderYear.toString() === filters.year;
      });
    }
    if (filters.month) {
      filtered = filtered.filter(order => {
        const orderMonth = new Date(order.order_date || order.created_at).getMonth() + 1;
        return orderMonth.toString() === filters.month;
      });
    }
    
    setFilteredOrders(filtered);
  };

  useEffect(() => {
    if (orders.length > 0) {
      applyFilters(orders);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const orderSort = useClientTableSort(ORDER_SORT_ACCESSORS);

  const sortedFilteredOrders = useMemo(() => {
    const rows = filteredOrders;
    if (!rows?.length) return rows;
    if (orderSort.sortCol && ORDER_SORT_ACCESSORS[orderSort.sortCol]) {
      const get = ORDER_SORT_ACCESSORS[orderSort.sortCol];
      const sign = orderSort.sortDir === 'desc' ? -1 : 1;
      return [...rows].sort((a, b) => {
        const inv = compareNonInventoryFirst(a, b);
        if (inv !== 0) return inv;
        return compareForSort(get(a), get(b)) * sign;
      });
    }
    return [...rows].sort((a, b) => {
      const inv = compareNonInventoryFirst(a, b);
      if (inv !== 0) return inv;
      const ta = new Date(a.order_date || a.created_at).getTime() || 0;
      const tb = new Date(b.order_date || b.created_at).getTime() || 0;
      return tb - ta;
    });
  }, [filteredOrders, orderSort]);

  const orderColumnTotals = useMemo(() => {
    const list = filteredOrders;
    if (!list.length) {
      return {
        quantity: 0,
        costTotal: 0,
        avgCostPerUnit: 0,
        avgSellingPerUnitOrdered: 0,
        orderUzsCash: 0,
        orderUzsCard: 0,
        orderUsdCash: 0,
        orderUsdCard: 0,
        cargoUzsCash: 0,
        cargoUzsCard: 0,
        cargoUsdCash: 0,
        cargoUsdCard: 0,
        orderUzs: 0,
        orderUsd: 0,
        cargoUzs: 0,
        cargoUsd: 0,
      };
    }
    let quantity = 0;
    let costTotal = 0;
    let orderUzsCash = 0;
    let orderUzsCard = 0;
    let orderUsdCash = 0;
    let orderUsdCard = 0;
    let cargoUzsCash = 0;
    let cargoUzsCard = 0;
    let cargoUsdCash = 0;
    let cargoUsdCard = 0;
    let qtyUsdSelling = 0;
    let sumUsdPlannedSelling = 0;
    for (const o of list) {
      const qi = parseInt(o.ordered_quantity, 10) || 0;
      quantity += qi;
      costTotal += parseFloat(o.cost_total) || 0;
      const ud = numOrZero(o.selling_usd_cash) + numOrZero(o.selling_usd_card);
      const legacyPu = parseFloat(o.selling_price);
      const hasLegacy = o.selling_price != null && o.selling_price !== '' && !Number.isNaN(legacyPu) && legacyPu > 0;
      if (qi > 0 && ud > 0) {
        sumUsdPlannedSelling += ud;
        qtyUsdSelling += qi;
      } else if (qi > 0 && hasLegacy) {
        sumUsdPlannedSelling += legacyPu * qi;
        qtyUsdSelling += qi;
      }
      orderUzsCash += parseFloat(o.order_payment_uzs_cash) || 0;
      orderUzsCard += parseFloat(o.order_payment_uzs_card) || 0;
      orderUsdCash += parseFloat(o.order_payment_usd_cash) || 0;
      orderUsdCard += parseFloat(o.order_payment_usd_card) || 0;
      cargoUzsCash += parseFloat(o.cargo_payment_uzs_cash) || 0;
      cargoUzsCard += parseFloat(o.cargo_payment_uzs_card) || 0;
      cargoUsdCash += parseFloat(o.cargo_payment_usd_cash) || 0;
      cargoUsdCard += parseFloat(o.cargo_payment_usd_card) || 0;
    }
    return {
      quantity,
      costTotal,
      avgCostPerUnit: quantity > 0 ? costTotal / quantity : 0,
      avgSellingPerUnitOrdered:
        qtyUsdSelling > 0 && sumUsdPlannedSelling > 0 ? sumUsdPlannedSelling / qtyUsdSelling : 0,
      orderUzsCash,
      orderUzsCard,
      orderUsdCash,
      orderUsdCard,
      cargoUzsCash,
      cargoUzsCard,
      cargoUsdCash,
      cargoUsdCard,
      orderUzs: orderUzsCash + orderUzsCard,
      orderUsd: orderUsdCash + orderUsdCard,
      cargoUzs: cargoUzsCash + cargoUzsCard,
      cargoUsd: cargoUsdCash + cargoUsdCard,
    };
  }, [filteredOrders]);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      setProducts(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    try {
      const qty = parseInt(formData.ordered_quantity, 10) || 0;
      if (!formData.product || qty < 1) {
        showNotification('Please select a product and enter a valid quantity.', 'error');
        return;
      }
      if (!String(formCategory || '').trim()) {
        showNotification('Please select a category.', 'error');
        return;
      }
      if (!String(formData.eshop || '').trim()) {
        showNotification('Please select or enter an eShop.', 'error');
        return;
      }
      if (!formData.supplier_country.trim()) {
        showNotification('Please select or enter a Supplier Country.', 'error');
        return;
      }

      if (isClientEshopSlug(formData.eshop) && !String(formData.client_eshop_notes || '').trim()) {
        showNotification('Enter notes — required when eShop is Client.', 'error');
        return;
      }

      if (formData.order_type === 'on_demand') {
        const cId = parseInt(formData.customer, 10);
        if (!formData.customer || Number.isNaN(cId)) {
          showNotification('Select a customer for on-demand orders.', 'error');
          return;
        }
      }

      const usdS = numOrZero(formData.selling_usd_per_unit);
      if (!(usdS > 0)) {
        showNotification('Enter a selling price per unit in USD.', 'error');
        return;
      }

      const usdSup = numOrZero(formData.cost_usd_per_unit);

      if (formData.order_is_paid && !(usdSup > 0) && !isClientEshopSlug(formData.eshop)) {
        showNotification(
          'To mark the order as already paid, enter a USD cost per unit, or leave unpaid and record cost later.',
          'error',
        );
        return;
      }

      if (formData.order_is_paid) {
        if (formData.order_payment_currency !== 'USD') {
          showNotification(
            'Recording “already paid” from this form is USD-only. Leave the order unpaid and split UZS/USD in “Pay for the Order”.',
            'error',
          );
          return;
        }
        const required = usdSup * qty;
        const available = getAvailableBalance('USD');
        if (available < required) {
          showNotification(
            formatInsufficientLedgerMessage('USD', available, required, {
              context: 'order_paid_on_create',
            }),
            'error',
          );
          return;
        }
      }

      const toNum = (v) => parseFloat(v) || 0;
      const advanceAmt = toNum(formData.advance_payment_amount);
      const advanceCcy = formData.advance_payment_currency === 'UZS' ? 'UZS' : 'USD';

      if (formData.order_type === 'on_demand' && advanceAmt > 0) {
        if (advanceCcy === 'USD') {
          const usdSellingTotal = usdS * qty;
          if (advanceAmt > usdSellingTotal + 0.01) {
            showNotification(
              `Advance cannot exceed planned USD selling total (${formatDisplayAmount(usdSellingTotal, 'USD')}).`,
              'error',
            );
            return;
          }
        } else {
          const usdSellingTotal = usdS * qty;
          const ok = window.confirm(
            `Record UZS advance payment?\n\n` +
              `Amount: ${formatDisplayAmount(advanceAmt, 'UZS')}\n` +
              `Planned selling (USD): ${formatDisplayAmount(usdSellingTotal, 'USD')}\n\n` +
              `UZS advance will be credited to UZS cash. Planned selling is still recorded in USD only.`,
          );
          if (!ok) return;
        }
      }

      const customerRaw = formData.customer;
      const customerParsed = parseInt(customerRaw, 10);
      const customer =
        customerRaw === '' || customerRaw == null || Number.isNaN(customerParsed)
          ? null
          : customerParsed;
      const orderData = {
        order_type: formData.order_type,
        product: parseInt(formData.product, 10),
        supplier_country: formData.supplier_country || null,
        supplier_cargo: formData.supplier_cargo?.trim() || null,
        eshop: formData.eshop || '',
        client_eshop_notes: String(formData.client_eshop_notes || '').trim(),
        ordered_quantity: qty,
        selling_uzs_cash: 0,
        selling_uzs_card: 0,
        selling_usd_cash: toNum(formData.selling_usd_per_unit) * qty,
        selling_usd_card: 0,
        supplier_cost_uzs_cash: 0,
        supplier_cost_uzs_card: 0,
        supplier_cost_usd_cash: toNum(formData.cost_usd_per_unit) * qty,
        supplier_cost_usd_card: 0,
        order_is_paid: formData.order_is_paid,
        order_payment_currency: formData.order_payment_currency,
        order_payment_type: formData.order_payment_type,
        customer,
        advance_payment_amount: advanceAmt,
        advance_payment_currency: advanceCcy,
        advance_payment_type: formData.advance_payment_type,
        status: formData.status,
      };

      await api.post('/orders/', orderData);
      setShowForm(false);
      setIsNewEshop(false);
      setIsNewCountry(false);
      setIsNewCargo(false);
      setFormCategoryType('');
      setFormCategory('');
      setProductSearch('');
      setProductDropdownOpen(false);
      setFormData({
        order_type: 'stock',
        product: '',
        supplier_country: '',
        supplier_cargo: '',
        eshop: '',
        client_eshop_notes: '',
        ordered_quantity: '',
        selling_usd_per_unit: '',
        cost_usd_per_unit: '',
        order_is_paid: false,
        order_payment_currency: 'USD',
        customer: '',
        advance_payment_amount: '',
        advance_payment_currency: 'USD',
        status: 'ordered',
      });
      fetchOrders();
      showNotification('Order created successfully!', 'success');
    } catch (error) {
      console.error('Error creating order:', error);
      const d = error.response?.data;
      const advErr = d?.advance_payment_amount;
      const advMsg = Array.isArray(advErr) ? advErr[0] : typeof advErr === 'string' ? advErr : null;
      showNotification(
        advMsg || d?.error || d?.detail || (typeof d === 'string' ? d : null) || 'Error creating order',
        'error'
      );
    }
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await api.post(`/orders/${orderId}/update_status/`, {
        status: newStatus,
        notes: '',
      });
      await fetchOrders();
      showNotification('Order status updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating status:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error updating status', 'error');
    }
  };

  const handlePayOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    const pref = prefillPayOrderSimpleTotals(order);
    setPaymentFormData({
      orderId: orderId,
      uzs: pref.uzs,
      usd: pref.usd,
      is_pay_order: true,
      is_received_and_pay: false,
      status_notes: '',
    });
    setShowPaymentForm(true);
    setTimeout(() => paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handlePayCargo = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    const costUzs = order?.cargo_cost_uzs > 0 ? order.cargo_cost_uzs : '';
    const costUsd = order?.cargo_cost_usd > 0 ? order.cargo_cost_usd : '';
    setCargoFormData({
      orderId: orderId,
      uzs: costUzs && order?.cargo_payment_currency !== 'USD' ? String(costUzs) : '',
      usd: costUsd && order?.cargo_payment_currency === 'USD' ? String(costUsd) : '',
    });
    setShowCargoForm(true);
    setTimeout(() => cargoFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentFormData.is_pay_order && !String(paymentFormData.status_notes || '').trim()) {
      showNotification('Please enter notes for this order update.', 'error');
      return;
    }
    try {
      // Check if this is for paying order separately
      if (paymentFormData.is_pay_order) {
        const uzs = parseFloat(paymentFormData.uzs) || 0;
        const usd = parseFloat(paymentFormData.usd) || 0;
        const orderForPay = orders.find((o) => o.id === paymentFormData.orderId);
        const isClientPay = orderForPay && isClientEshopSlug(orderForPay.eshop);
        if (uzs + usd === 0 && !isClientPay) {
          showNotification('Please enter at least one payment amount.', 'error');
          return;
        }
        if (uzs > 0) {
          const available = getAvailableBalance('UZS');
          if (available < uzs) {
            showNotification(formatInsufficientLedgerMessage('UZS', available, uzs), 'error');
            return;
          }
        }
        if (usd > 0) {
          const available = getAvailableBalance('USD');
          if (available < usd) {
            showNotification(formatInsufficientLedgerMessage('USD', available, usd), 'error');
            return;
          }
        }
        if (orderForPay) {
          const confirmed = isClientPay
            ? confirmClientOrderPay(orderForPay, uzs, usd)
            : confirmOrderPayTotalsIfMismatch(orderForPay, uzs, usd);
          if (!confirmed) {
            return;
          }
        }
        const paidOrderId = paymentFormData.orderId;
        const res = await api.post(`/orders/${paidOrderId}/pay_order/`, { uzs, usd });
        const paidStatus = res.data?.status || 'order_paid';
        setOrders((prev) => {
          const next = prev.map((o) =>
            o.id === paidOrderId
              ? {
                  ...o,
                  status: paidStatus,
                  order_is_paid: true,
                  has_ever_been_received:
                    o.has_ever_been_received || o.status === 'received',
                }
              : o,
          );
          applyFilters(next);
          return next;
        });
        setShowPaymentForm(false);
        setPaymentFormData({ orderId: null, uzs: '', usd: '', is_pay_order: false, is_received_and_pay: false, status_notes: '' });
        await fetchOrders();
        showNotification('Order payment completed successfully!', 'success');
        return;
      }
      
      // Otherwise, handle status update with payment (for "Move to Inventory & Pay")
      const order = orders.find(o => o.id === paymentFormData.orderId);
      const targetStatus = paymentFormData.is_received_and_pay ? 'received' : 'in_inventory';
      
      // Check if order is already paid - if so, don't send payment info again
      const isAlreadyPaid = order?.order_is_paid;

      // Check balances before submitting (only if not already paid)
      if (!isAlreadyPaid) {
        const uzs = parseFloat(paymentFormData.uzs) || 0;
        const usd = parseFloat(paymentFormData.usd) || 0;
        if (uzs + usd === 0) {
          showNotification('Please enter at least one payment amount.', 'error');
          return;
        }
        if (uzs > 0) {
          const available = getAvailableBalance('UZS');
          if (available < uzs) {
            showNotification(formatInsufficientLedgerMessage('UZS', available, uzs), 'error');
            return;
          }
        }
        if (usd > 0) {
          const available = getAvailableBalance('USD');
          if (available < usd) {
            showNotification(formatInsufficientLedgerMessage('USD', available, usd), 'error');
            return;
          }
        }
      }

      // Build update payload
      const updatePayload = {
        status: targetStatus,
        notes: String(paymentFormData.status_notes).trim(),
      };

      // Only send payment info if order is not already paid
      if (!isAlreadyPaid) {
        updatePayload.uzs = parseFloat(paymentFormData.uzs) || 0;
        updatePayload.usd = parseFloat(paymentFormData.usd) || 0;
        updatePayload.order_is_paid = true;
      }

      // Update order status
      await api.post(`/orders/${paymentFormData.orderId}/update_status/`, updatePayload);

      // Refresh orders to get updated status
      await fetchOrders();

      setShowPaymentForm(false);
      setPaymentFormData({ orderId: null, uzs: '', usd: '', is_pay_order: false, is_received_and_pay: false, status_notes: '' });
      showNotification('Payment processed successfully!', 'success');
    } catch (error) {
      console.error('Error updating order payment:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error updating order payment', 'error');
    }
  };

  const handleCargoPaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const uzs = parseFloat(cargoFormData.uzs) || 0;
      const usd = parseFloat(cargoFormData.usd) || 0;

      if (uzs > 0) {
        const available = getAvailableBalance('UZS');
        if (available < uzs) {
          showNotification(
            formatInsufficientLedgerMessage('UZS', available, uzs, { topUpSuffix: true }),
            'error',
          );
          return;
        }
      }
      if (usd > 0) {
        const available = getAvailableBalance('USD');
        if (available < usd) {
          showNotification(
            formatInsufficientLedgerMessage('USD', available, usd, { topUpSuffix: true }),
            'error',
          );
          return;
        }
      }

      const cargoOrder = orders.find((o) => o.id === cargoFormData.orderId);
      if (!confirmCargoPaymentIfNeeded(cargoOrder, uzs, usd)) {
        return;
      }

      const res = await api.post(`/orders/${cargoFormData.orderId}/pay_cargo/`, { uzs, usd });
      setShowCargoForm(false);
      setCargoFormData({ orderId: null, uzs: '', usd: '' });
      await fetchOrders();
      showNotification(res.data?.message || 'Cargo payment processed successfully.', 'success');
    } catch (error) {
      console.error('Error paying cargo:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error paying cargo', 'error');
    }
  };

  /**
   * Creates pending sale from on-demand order (table “Sell the Product” button only).
   * @returns {Promise<boolean>}
   */
  const sellProductFromOrder = async (orderId, { confirm: showConfirm = true } = {}) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return false;

    if (!order.order_is_paid) {
      showNotification(
        'Pay for the supplier order first (Pay for the Order) before selling this on‑demand product.',
        'error',
      );
      return false;
    }
    if (!order.cargo_is_paid) {
      showNotification(
        'Pay for the cargo first (use zero totals in that form if there is no freight). You cannot sell this on‑demand item until cargo is marked paid.',
        'error',
      );
      return false;
    }

    if (showConfirm) {
      const ok = window.confirm(
        `Sell the product from order #${orderId}?\n` +
          `A pending sale will be created — complete it in Sales.`,
      );
      if (!ok) return false;
    }

    try {
      const response = await api.post(`/orders/${orderId}/sell_product/`);
      showNotification(
        response.data.message || 'Sale created! Open the Sales tab to complete payment.',
        'success',
      );
      await fetchOrders();
      return true;
    } catch (error) {
      console.error('Error selling product:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error selling product', 'error');
      return false;
    }
  };

  const handleSellProduct = async (orderId) => {
    await sellProductFromOrder(orderId, { confirm: true });
  };

  const handleMoveToInventoryFromOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);

    if (!order?.order_is_paid) {
      showNotification('Order payment must be completed before moving to inventory.', 'error');
      return;
    }

    if (!order?.cargo_is_paid) {
      showNotification(
        'Cargo must be marked paid before moving to inventory (use Pay for the Cargo; zero totals if there is no freight).',
        'error',
      );
      return;
    }
    
    if (order && order.advance_payment_amount && order.advance_payment_amount > 0) {
      const advCur = order.advance_payment_currency
        ? String(order.advance_payment_currency).toUpperCase()
        : 'USD';
      setMoveToInventoryData({
        orderId: orderId,
        return_advance: true,
        return_payment_currency: advCur === 'UZS' ? 'UZS' : 'USD',
        return_advance_amount:
          order.advance_payment_amount != null && order.advance_payment_amount !== ''
            ? String(Number(order.advance_payment_amount))
            : '',
      });
      setShowMoveToInventoryForm(true);
      setTimeout(() => moveToInventoryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } else {
      // No advance payment, just move to inventory
      await moveToInventoryFromOrder(orderId, { return_advance: false });
    }
  };

  const moveToInventoryFromOrder = async (orderId, options = {}) => {
    const returnAdvance = !!options.return_advance;
    try {
      const payload = { return_advance: returnAdvance };
      if (returnAdvance) {
        const ccy = String(options.return_payment_currency || 'USD').toUpperCase();
        payload.return_payment_currency = ccy === 'UZS' ? 'UZS' : 'USD';
        if (options.return_advance_amount != null && Number.isFinite(options.return_advance_amount)) {
          payload.return_advance_amount = options.return_advance_amount;
        }
      }
      await api.post(`/orders/${orderId}/move_to_inventory_from_order/`, payload);
      setShowMoveToInventoryForm(false);
      setMoveToInventoryData({
        orderId: null,
        return_advance: false,
        return_payment_currency: 'USD',
        return_advance_amount: '',
      });
      await fetchOrders();
      showNotification('Order moved to inventory successfully!', 'success');
    } catch (error) {
      console.error('Error moving to inventory:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error moving to inventory', 'error');
    }
  };

  const handleMoveToInventorySubmit = async (e) => {
    e.preventDefault();

    const invOrder = orders.find((o) => o.id === moveToInventoryData.orderId);
    if (invOrder && invOrder.advance_payment_amount > 0) {
      const booked = parseFloat(invOrder.advance_payment_amount) || 0;
      const amt = parseFloat(String(moveToInventoryData.return_advance_amount ?? '').trim()) || 0;
      if (!(amt > 0)) {
        showNotification('Enter how much advance to return (greater than zero).', 'error');
        return;
      }
      const ccy = moveToInventoryData.return_payment_currency === 'UZS' ? 'UZS' : 'USD';
      const bookedCur = invOrder.advance_payment_currency
        ? String(invOrder.advance_payment_currency).toUpperCase()
        : 'USD';
      if (ccy === bookedCur && amt > booked) {
        showNotification(`Return amount cannot exceed the recorded advance (${booked}).`, 'error');
        return;
      }
      const available = getAvailableBalance(ccy);
      if (amt > available) {
        showNotification(formatInsufficientLedgerMessage(ccy, available, amt), 'error');
        return;
      }
      const bookedAdvLabel = formatDisplayAmount(
        booked,
        invOrder.advance_payment_currency ? String(invOrder.advance_payment_currency).toUpperCase() : 'USD',
      );
      const payingLabel = formatDisplayAmount(amt, ccy);
      const ok = window.confirm(
        `Return advance?\n\n` +
          `Order #${invOrder.id}\n` +
          `Recorded advance: ${bookedAdvLabel}\n` +
          `Paying amount: ${payingLabel}`,
      );
      if (!ok) return;
    }
    await moveToInventoryFromOrder(moveToInventoryData.orderId, {
      return_advance: true,
      return_payment_currency: moveToInventoryData.return_payment_currency,
      return_advance_amount:
        parseFloat(String(moveToInventoryData.return_advance_amount ?? '').trim()) || undefined,
    });
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Orders</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Order'}
        </button>
      </div>

      {/* Notification */}
      {notification.show && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: 9999,
            padding: '15px 25px',
            borderRadius: '8px',
            backgroundColor: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          <span style={{ fontSize: '20px' }}>
            {notification.type === 'success' ? '✓' : notification.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification({ show: false, message: '', type: 'success' })}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1',
            }}
          >
            ×
          </button>
        </div>
      )}

      {showPaymentForm && (
        <div className="form-card" style={{ marginBottom: '20px' }} ref={paymentFormRef}>
          <h2>
            {paymentFormData.is_pay_order ? 'Pay for the Order' : paymentFormData.is_received_and_pay ? 'Mark Order as Received and Pay' : 'Move Order to Inventory & Pay'}
          </h2>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            Enter the UZS and/or USD amount. Leave a field empty or 0 if not used.
          </p>
          <form onSubmit={handlePaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>UZS</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={paymentFormData.uzs}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={paymentFormData.usd}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, usd: e.target.value })} />
              </div>
              {!paymentFormData.is_pay_order && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes *</label>
                  <textarea
                    rows={3}
                    value={paymentFormData.status_notes}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, status_notes: e.target.value })}
                    required
                  />
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {paymentFormData.is_pay_order ? 'Pay for the Order' : paymentFormData.is_received_and_pay ? 'Mark as Received and Pay' : 'Confirm & Move to Inventory'}
              </button>
              <button type="button" className="btn-edit"
                onClick={() => {
                  setShowPaymentForm(false);
                  setPaymentFormData({ orderId: null, uzs: '', usd: '', is_pay_order: false, is_received_and_pay: false, status_notes: '' });
                }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showMoveToInventoryForm && (
        <div className="form-card" style={{ marginBottom: '20px' }} ref={moveToInventoryFormRef}>
          <h2>Move to Inventory - Order #{moveToInventoryData.orderId}</h2>
          <form onSubmit={handleMoveToInventorySubmit}>
            <div className="form-grid">
              {(() => {
                const invOrder = orders.find((o) => o.id === moveToInventoryData.orderId);
                if (invOrder && invOrder.advance_payment_amount > 0) {
                  return (
                    <>
                      <p style={{ gridColumn: '1 / -1', color: '#555', margin: 0, fontSize: '0.92em' }}>
                        Return advance payment to customer — recorded advance:{' '}
                        <strong>
                          {formatDisplayAmount(
                            invOrder.advance_payment_amount,
                            invOrder.advance_payment_currency || 'USD',
                          )}
                        </strong>
                      </p>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            flexWrap: 'wrap',
                            gap: '14px',
                            alignItems: 'flex-end',
                          }}
                        >
                          <div className="form-group" style={{ marginBottom: 0, width: '11rem', maxWidth: '100%' }}>
                            <label htmlFor="move-inv-return-amt">Amount</label>
                            <input
                              id="move-inv-return-amt"
                              type="number"
                              step="0.01"
                              min="0"
                              style={{ width: '100%', boxSizing: 'border-box', display: 'block', marginTop: '4px' }}
                              value={moveToInventoryData.return_advance_amount}
                              onChange={(e) =>
                                setMoveToInventoryData({ ...moveToInventoryData, return_advance_amount: e.target.value })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0, minWidth: '7rem', width: '7.5rem' }}>
                            <label htmlFor="move-inv-return-ccy">Currency</label>
                            <select
                              id="move-inv-return-ccy"
                              value={moveToInventoryData.return_payment_currency}
                              onChange={(e) =>
                                setMoveToInventoryData({
                                  ...moveToInventoryData,
                                  return_payment_currency: e.target.value === 'UZS' ? 'UZS' : 'USD',
                                })
                              }
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                boxSizing: 'border-box',
                                marginTop: '4px',
                              }}
                            >
                              <option value="USD">USD</option>
                              <option value="UZS">UZS</option>
                            </select>
                          </div>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: '0.82em', color: '#666' }}>
                          ≤ advance above · deducted from chosen cash · no FX
                        </p>
                      </div>
                    </>
                  );
                }
                return null;
              })()}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Move to Inventory
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowMoveToInventoryForm(false);
                  setMoveToInventoryData({
                    orderId: null,
                    return_advance: false,
                    return_payment_currency: 'USD',
                    return_advance_amount: '',
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showCargoForm && (
        <div className="form-card" style={{ marginBottom: '20px' }} ref={cargoFormRef}>
          <h2>Pay for Cargo - Order #{cargoFormData.orderId}</h2>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            Enter the UZS and/or USD amount. If cargo was <strong>free</strong>, enter <strong>0</strong> in both fields and submit.
          </p>
          <form onSubmit={handleCargoPaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>UZS</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={cargoFormData.uzs}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, uzs: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>USD</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={cargoFormData.usd}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, usd: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Pay for the Cargo
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowCargoForm(false);
                  setCargoFormData({ orderId: null, uzs: '', usd: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="form-card">
          <h2>New Order</h2>
          <form onSubmit={handleSubmit}>
            <div className="orders-new-order-form">
              <div className="orders-new-order-row orders-new-order-row--6">
              <div className="form-group">
                <label>Order Type</label>
                <select
                  value={formData.order_type}
                  onChange={(e) => setFormData({ ...formData, order_type: e.target.value })}
                  required
                >
                  <option value="stock">Stock-Based</option>
                  <option value="on_demand">On-Demand</option>
                </select>
              </div>
              <div className="form-group">
                <label>Category type <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter products)</span></label>
                <select
                  value={formCategoryType}
                  onChange={(e) => {
                    setFormCategoryType(e.target.value);
                    setFormCategory('');
                    setProductSearch('');
                    setProductDropdownOpen(false);
                    setFormData({
                      ...formData,
                      product: '',
                      supplier_country: '',
                      selling_usd_per_unit: '',
                      selling_uzs_per_unit: '',
                      cost_usd_per_unit: '',
                      cost_uzs_per_unit: '',
                    });
                  }}
                >
                  <option value="">— None —</option>
                  {PRODUCT_CATEGORY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Category <span style={{ color: '#e53e3e' }}>*</span> <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter products)</span></label>
                <select
                  value={formCategory}
                  onChange={(e) => { setFormCategory(e.target.value); setProductSearch(''); setProductDropdownOpen(false); setFormData({ ...formData, product: '', supplier_country: '', selling_usd_per_unit: '', selling_uzs_per_unit: '', cost_usd_per_unit: '', cost_uzs_per_unit: '' }); }}
                  required
                >
                  <option value="">Select category</option>
                  {[...new Set(
                    products
                      .filter((p) => !formCategoryType || p.category_type === formCategoryType)
                      .map((p) => p.category)
                      .filter(Boolean),
                  )].sort().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" ref={productDropdownRef} style={{ position: 'relative' }}>
                <label>Product</label>
                {(() => {
                  const selectedProduct = products.find(p => p.id === parseInt(formData.product));
                  const filteredByCategory = products.filter(
                    (p) =>
                      (!formCategoryType || p.category_type === formCategoryType) &&
                      (!formCategory || p.category === formCategory),
                  );
                  const searchLower = productSearch.toLowerCase();
                  const filteredProducts = filteredByCategory.filter(p =>
                    !productSearch ||
                    `${p.id} ${p.brand} ${p.model} ${p.size} ${p.color}`.toLowerCase().includes(searchLower)
                  );
                  return (
                    <>
                      <div
                        onClick={() => { setProductDropdownOpen(o => !o); setProductSearch(''); }}
                        style={{
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: 'white',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          minHeight: '38px',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{ color: selectedProduct ? '#333' : '#999' }}>
                          {selectedProduct
                            ? productOrderPickerLabel(selectedProduct)
                            : 'Select a product'}
                        </span>
                        <span style={{ color: '#666', fontSize: '0.8em' }}>{productDropdownOpen ? '▲' : '▼'}</span>
                      </div>
                      {productDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: 'white',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 100,
                          maxHeight: '280px',
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
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
                                padding: '6px 10px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                fontSize: '14px',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {filteredProducts.length === 0 ? (
                              <div style={{ padding: '12px', color: '#999', textAlign: 'center', fontSize: '14px' }}>No products found</div>
                            ) : (
                              filteredProducts.map(product => (
                                <div
                                  key={product.id}
                                  onClick={() => {
                                    setIsNewCountry(false);
      setIsNewCargo(false);
                                    const psp = parseFloat(product.selling_price);
                                    const sellingUsd = psp > 0 && !Number.isNaN(psp) ? psp.toFixed(2) : '';
                                    setFormData({
                                      ...formData,
                                      product: String(product.id),
                                      supplier_country: product.supplier_country || '',
                                      selling_usd_per_unit: sellingUsd,
                                      cost_usd_per_unit: '',
                                    });
                                    setProductDropdownOpen(false);
                                    setProductSearch('');
                                  }}
                                  style={{
                                    padding: '9px 12px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    borderBottom: '1px solid #f0f0f0',
                                    background: formData.product === String(product.id) ? '#e8f4fd' : 'white',
                                    fontWeight: formData.product === String(product.id) ? 600 : 400,
                                  }}
                                  onMouseEnter={(e) => { if (formData.product !== String(product.id)) e.currentTarget.style.background = '#f5f5f5'; }}
                                  onMouseLeave={(e) => { if (formData.product !== String(product.id)) e.currentTarget.style.background = 'white'; }}
                                >
                                  {productOrderPickerLabel(product)}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="form-group">
                <label>Supplier Country <span style={{ color: '#e53e3e' }}>*</span></label>
                {!isNewCountry ? (
                  <select
                    value={formData.supplier_country}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewCountry(true);
                        setFormData({ ...formData, supplier_country: '' });
                      } else {
                        setFormData({ ...formData, supplier_country: e.target.value });
                      }
                    }}
                    required
                  >
                    <option value="">Select a country</option>
                    {uniqueSupplierCountriesFromOrdersAndProducts(orders, products).map((country) => (
                      <option key={country} value={country}>
                        {country.charAt(0).toUpperCase() + country.slice(1)}
                      </option>
                    ))}
                    <option value="__new__">+ Add new country...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter country name"
                      value={formData.supplier_country}
                      onChange={(e) => setFormData({ ...formData, supplier_country: e.target.value })}
                      required
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewCountry(false);
      setIsNewCargo(false);
                        setFormData({ ...formData, supplier_country: '' });
                      }}
                      style={{
                        padding: '0 10px',
                        background: '#eee',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ← Back
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Supplier cargo <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(optional)</span></label>
                {!isNewCargo ? (
                  <select
                    value={formData.supplier_cargo}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewCargo(true);
                        setFormData({ ...formData, supplier_cargo: '' });
                      } else {
                        setFormData({ ...formData, supplier_cargo: e.target.value });
                      }
                    }}
                  >
                    <option value="">— None —</option>
                    {uniqueSupplierCargosFromOrders(orders).map((cargo) => (
                      <option key={cargo} value={cargo}>
                        {cargo.charAt(0).toUpperCase() + cargo.slice(1)}
                      </option>
                    ))}
                    <option value="__new__">+ Add new supplier cargo...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter supplier cargo name"
                      value={formData.supplier_cargo}
                      onChange={(e) => setFormData({ ...formData, supplier_cargo: e.target.value })}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewCargo(false);
                        setFormData({ ...formData, supplier_cargo: '' });
                      }}
                      style={{
                        padding: '0 10px',
                        background: '#eee',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ← Back
                    </button>
                  </div>
                )}
              </div>
              </div>

              <div className="orders-new-order-row orders-new-order-row--eshop-prices">
              <div className="form-group">
                <label>eShop <span style={{ color: '#e53e3e' }}>*</span></label>
                {!isNewEshop ? (
                  <select
                    value={formData.eshop}
                    required
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewEshop(true);
                        setFormData({ ...formData, eshop: '' });
                      } else {
                        const v = e.target.value;
                        setFormData({
                          ...formData,
                          eshop: v,
                          ...(!isClientEshopSlug(v) ? { client_eshop_notes: '' } : {}),
                        });
                      }
                    }}
                  >
                    <option value="">Select eShop</option>
                    {/* Built-in options */}
                    <option value="zalando">Zalando</option>
                    <option value="best_secret">Best Secret</option>
                    <option value="adidas">Adidas</option>
                    <option value="unidays">UniDays</option>
                    <option value="nike">Nike</option>
                    <option value="asos">ASOS</option>
                    {/* Custom eshops added by users (from existing orders) */}
                    {[...new Set(
                      orders
                        .map(o => o.eshop)
                        .filter((e) => e && !BUILTIN_ESHOP_SLUGS.has(String(e).toLowerCase()))
                    )].sort().map(eshop => (
                      <option key={eshop} value={eshop}>{eshop}</option>
                    ))}
                    <option value="client">Client</option>
                    <option value="other">Other</option>
                    <option value="__new__">+ Add new eShop...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter new eShop name"
                      value={formData.eshop}
                      required
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData({
                          ...formData,
                          eshop: v,
                          ...(!isClientEshopSlug(v) ? { client_eshop_notes: '' } : {}),
                        });
                      }}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewEshop(false);
                        setFormData({ ...formData, eshop: '' });
                      }}
                      style={{
                        padding: '0 10px',
                        background: '#eee',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ← Back
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group orders-new-order-field--qty">
                <label>Ordered Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.ordered_quantity}
                  onChange={(e) => setFormData({ ...formData, ordered_quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  Selling price per unit (USD){' '}
                  <span style={{ color: '#e53e3e', fontWeight: 400 }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="USD / unit"
                  value={formData.selling_usd_per_unit}
                  onChange={(e) => setFormData({ ...formData, selling_usd_per_unit: e.target.value })}
                />
                {numOrZero(formData.selling_usd_per_unit) > 0 && parseInt(formData.ordered_quantity, 10) > 0 && (
                  <span className="orders-field-hint">
                    = ${(parseFloat(formData.selling_usd_per_unit) * parseInt(formData.ordered_quantity, 10)).toFixed(2)} line total
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Cost per unit (USD)</label>
                {!isClientEshopSlug(formData.eshop) && (
                  <span className="orders-field-hint">
                    {formData.order_type === 'on_demand'
                      ? 'Leave blank if supplier cost is not confirmed yet; you can record it when paying the order.'
                      : 'Optional until you have the supplier invoice; leave blank and pay later from the list.'}
                  </span>
                )}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="USD / unit"
                  value={formData.cost_usd_per_unit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      cost_usd_per_unit: v,
                      ...(numOrZero(v) <= 0 && prev.order_is_paid ? { order_is_paid: false } : {}),
                    }));
                  }}
                />
                {numOrZero(formData.cost_usd_per_unit) > 0 && parseInt(formData.ordered_quantity, 10) > 0 && (
                  <span className="orders-field-hint">
                    = ${(parseFloat(formData.cost_usd_per_unit) * parseInt(formData.ordered_quantity, 10)).toFixed(2)} line total
                  </span>
                )}
              </div>
              </div>

              {isClientEshopSlug(formData.eshop) && (
                <div className="orders-new-order-row orders-new-order-row--notes">
                  <div className="form-group">
                    <label>
                      Notes <span style={{ color: '#e53e3e' }}>*</span>
                    </label>
                    <textarea
                      className="orders-client-notes-field"
                      value={formData.client_eshop_notes}
                      onChange={(e) =>
                        setFormData({ ...formData, client_eshop_notes: e.target.value })
                      }
                      required
                      rows={2}
                      placeholder="Who / reference / sourcing (required when eShop is Client)"
                    />
                  </div>
                </div>
              )}

              <div className="orders-new-order-row orders-new-order-row--payment-flags">
              <div className="form-group orders-new-order-checkbox-row">
                <label
                  title={
                    isClientEshopSlug(formData.eshop)
                      ? 'Enter a USD cost per unit to mark paid at creation, or leave blank and pay later.'
                      : numOrZero(formData.cost_usd_per_unit)
                        ? undefined
                        : 'Enter a USD cost per unit above, or leave this unchecked and use Pay for the Order after you know the price.'
                  }
                >
                  <input
                    type="checkbox"
                    checked={formData.order_is_paid}
                    disabled={!numOrZero(formData.cost_usd_per_unit)}
                    onChange={(e) => setFormData({ ...formData, order_is_paid: e.target.checked })}
                  />
                  Order payment is already made <span style={{ color: '#666', fontWeight: 400 }}>(USD only)</span>
                </label>
              </div>
              {formData.order_is_paid && (
                <div className="form-group">
                  <label>Payment Currency</label>
                  <select
                    value={formData.order_payment_currency}
                    onChange={(e) => setFormData({ ...formData, order_payment_currency: e.target.value })}
                    required
                  >
                    <option value="USD">USD</option>
                  </select>
                </div>
              )}
              </div>

              {formData.order_type === 'on_demand' && (
              <div className="orders-new-order-row orders-new-order-row--on-demand">
                  <div className="form-group">
                    <label>Customer *</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                      <select
                        value={formData.customer}
                        onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                        style={{ flex: 1, minWidth: 0 }}
                        required={formData.order_type === 'on_demand'}
                      >
                        <option value="">Select or add customer</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} {customer.telephone ? `(${customer.telephone})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-edit"
                        onClick={() => setShowCustomerForm(true)}
                        style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}
                      >
                        + New
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Advance payment amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.advance_payment_amount}
                      onChange={(e) => setFormData({ ...formData, advance_payment_amount: e.target.value })}
                      placeholder="0 if none"
                    />
                  </div>
                  <div className="form-group">
                    <label>Advance currency</label>
                    <select
                      value={formData.advance_payment_currency}
                      onChange={(e) => setFormData({ ...formData, advance_payment_currency: e.target.value })}
                    >
                      <option value="USD">USD</option>
                      <option value="UZS">UZS</option>
                    </select>
                  </div>
              </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Order
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowForm(false);
                  setIsNewEshop(false);
                  setIsNewCountry(false);
      setIsNewCargo(false);
                  setFormCategoryType('');
      setFormCategory('');
                  setProductSearch('');
                  setProductDropdownOpen(false);
                  setFormData({
                    order_type: 'stock',
                    product: '',
                    supplier_country: '',
                    supplier_cargo: '',
                    eshop: '',
                    client_eshop_notes: '',
                    ordered_quantity: '',
                    selling_usd_per_unit: '',
                    cost_usd_per_unit: '',
                    order_is_paid: false,
                    order_payment_currency: 'USD',
                    customer: '',
                    advance_payment_amount: '',
                    advance_payment_currency: 'USD',
                    status: 'ordered',
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showCustomerForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Add New Customer</h2>
          <form onSubmit={handleCreateCustomer}>
            <div className="form-grid">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newCustomerData.name}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Telephone *</label>
                <input
                  type="text"
                  value={newCustomerData.telephone}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, telephone: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Instagram</label>
                <input
                  type="text"
                  value={newCustomerData.instagram}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, instagram: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Region</label>
                <select
                  value={newCustomerData.region}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, region: e.target.value })}
                >
                  {regionChoices.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Add Customer
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowCustomerForm(false);
                  setNewCustomerData({ name: '', telephone: '+998', instagram: '', region: 'tashkent_city', notes: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showForm && !showPaymentForm && !showCargoForm && !showMoveToInventoryForm && !showCustomerForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title">Filters</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>Category type</label>
            <select
              value={filters.category_type}
              onChange={(e) => setFilters({ ...filters, category_type: e.target.value })}
            >
              <option value="">All types</option>
              {PRODUCT_CATEGORY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              {[...new Set(
                products
                  .filter((p) => !filters.category_type || p.category_type === filters.category_type)
                  .map((p) => p.category)
                  .filter(Boolean),
              )]
                .sort()
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
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
              {getUniqueValues(orders, 'brand').map((brand) => (
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
              {getUniqueValues(orders, 'model').map((model) => (
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
              {getUniqueValues(orders, 'size').map((size) => (
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
              {getUniqueValues(orders, 'color').map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Order Type</label>
            <select
              value={filters.order_type}
              onChange={(e) => setFilters({ ...filters, order_type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="stock">Stock-Based</option>
              <option value="on_demand">On-Demand</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="ordered">Ordered</option>
              <option value="order_paid">Order paid</option>
              <option value="received">Received</option>
              <option value="in_inventory">In Inventory</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Customer</label>
            <CustomerSearchableSelect
              variant="filter"
              customers={customerFilterOptions}
              value={filters.customer}
              allowEmpty
              emptyLabel="All Customers"
              placeholder="All Customers"
              extraOptions={[{ value: '__none__', label: 'No customer' }]}
              aria-label="Filter by customer"
              onChange={(customerId) => setFilters({ ...filters, customer: customerId })}
            />
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
              onClick={() =>
                setFilters({
                  category_type: '',
                  category: '',
                  brand: '',
                  model: '',
                  size: '',
                  color: '',
                  order_type: '',
                  status: '',
                  customer: '',
                  year: '',
                  month: '',
                })
              }
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
              <SortableTh columnId="id" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>ID</SortableTh>
              <th>Actions</th>
              <SortableTh columnId="status" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Status</SortableTh>
              <SortableTh columnId="category_type" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Category type</SortableTh>
              <SortableTh columnId="category" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Category</SortableTh>
              <SortableTh columnId="brand" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Brand</SortableTh>
              <SortableTh columnId="model" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Model</SortableTh>
              <SortableTh columnId="size" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Size</SortableTh>
              <SortableTh columnId="color" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Color</SortableTh>
              <SortableTh columnId="supplier_country" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Supplier Country</SortableTh>
              <SortableTh columnId="supplier_cargo" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Supplier Cargo</SortableTh>
              <SortableTh columnId="eshop" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>eShop</SortableTh>
              <SortableTh columnId="order_type" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Order Type</SortableTh>
              <SortableTh columnId="customer" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Customer</SortableTh>
              <SortableTh columnId="qty" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Qty</SortableTh>
              <SortableTh columnId="selling_price_unit" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Selling price/unit</SortableTh>
              <SortableTh columnId="cost_per_unit" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Cost Per Unit</SortableTh>
              <SortableTh columnId="total_cost" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Total Cost</SortableTh>
              <SortableTh columnId="order_uzs" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Order UZS</SortableTh>
              <SortableTh columnId="order_usd" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Order USD</SortableTh>
              <SortableTh columnId="cargo_uzs" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Cargo UZS</SortableTh>
              <SortableTh columnId="cargo_usd" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Cargo USD</SortableTh>
              <SortableTh columnId="created_by" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Created By</SortableTh>
              <SortableTh columnId="order_date" sortCol={orderSort.sortCol} sortDir={orderSort.sortDir} onSort={orderSort.onHeaderClick}>Date</SortableTh>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="24" style={{ textAlign: 'center' }}>
                  No orders found
                </td>
              </tr>
            ) : (
              sortedFilteredOrders.map((order) => {
                const plannedSellingLabel = plannedSellingSummary(order);
                const plannedSupplierTotalLabel = plannedSupplierTotal(order);
                const eshopLabel = formatEshopDisplay(order.eshop);
                return (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>
                    {/* Show status update buttons based on current status */}
                    {showMarkAsReceivedAction(order) && canUpdateStatus && (
                      <button
                        className="btn-status"
                        onClick={() => handleStatusUpdate(order.id, 'received')}
                        style={{ marginRight: '5px' }}
                      >
                        Mark as Received
                      </button>
                    )}
                    {!order.order_is_paid && canPayOrder && (
                      <button
                        className="btn-status"
                        onClick={() => handlePayOrder(order.id)}
                        style={{ marginRight: '5px' }}
                      >
                        Pay for the Order
                      </button>
                    )}
                    {!order.cargo_is_paid && canPayCargo && (
                      <button
                        className="btn-status"
                        onClick={() => handlePayCargo(order.id)}
                        style={{ marginRight: '5px' }}
                      >
                        Pay for the Cargo
                      </button>
                    )}
                    {orderReadyForInventoryActions(order) && order.order_type === 'stock' && canMoveInventory && (
                      <button
                        className="btn-status"
                        onClick={() => handleStatusUpdate(order.id, 'in_inventory')}
                        style={{ marginRight: '5px' }}
                      >
                        Move to Inventory
                      </button>
                    )}
                    {order.order_type === 'on_demand' &&
                      orderReadyForInventoryActions(order) &&
                      !order.has_sale && (
                      <>
                        {canSellProduct && (
                        <button
                          className="btn-status"
                          onClick={() => handleSellProduct(order.id)}
                          style={{ marginRight: '5px', backgroundColor: '#4caf50', color: 'white' }}
                        >
                          Sell the Product
                        </button>
                        )}
                        {canMoveInventory && (
                        <button
                          className="btn-status"
                          onClick={() => handleMoveToInventoryFromOrder(order.id)}
                          style={{ backgroundColor: '#2196f3', color: 'white' }}
                        >
                          Move to Inventory
                        </button>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${order.status}`}>
                      {formatOrderStatus(order.status)}
                    </span>
                  </td>
                  <td>
                    {categoryTypeLabel(order.product_detail?.category_type) || (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td>{order.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{order.product_detail?.brand || '-'}</td>
                  <td>{order.product_detail?.model || '-'}</td>
                  <td><strong>{order.product_detail?.size || '-'}</strong></td>
                  <td><strong>{order.product_detail?.color || '-'}</strong></td>
                  <td>{order.supplier_country || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{order.supplier_cargo || <span style={{ color: '#999' }}>—</span>}</td>
                  <td title={order.client_eshop_notes ? String(order.client_eshop_notes) : eshopLabel || ''}>
                    {eshopLabel ? (
                      <span>{eshopLabel}</span>
                    ) : (
                      <span style={{ color: '#bbb' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${order.order_type === 'stock' ? 'confirmed' : 'pending'}`}>
                      {order.order_type === 'stock' ? 'Stock' : 'On-Demand'}
                    </span>
                  </td>
                  <td>
                    {order.order_type === 'on_demand' ? (
                      order.customer_detail ? (
                        <div>
                          <strong>{order.customer_detail.name}</strong>
                          {order.customer_detail.telephone && (
                            <div style={{ fontSize: '0.82em', color: '#666' }}>{order.customer_detail.telephone}</div>
                          )}
                          {order.advance_payment_amount > 0 && (
                            <div style={{ fontSize: '0.82em', color: '#4caf50' }}>
                              Advance:{' '}
                              {formatDisplayAmount(
                                order.advance_payment_amount,
                                order.advance_payment_currency || 'USD',
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#f44336', fontSize: '0.85em' }}>No customer</span>
                      )
                    ) : (
                      <span style={{ color: '#aaa' }}>—</span>
                    )}
                  </td>
                  <td>{order.ordered_quantity}</td>
                  <td title={plannedSellingLabel || ''}>
                    {plannedSellingLabel ? (
                      <span>{plannedSellingLabel}</span>
                    ) : (
                      <span style={{ color: '#bbb' }}>—</span>
                    )}
                  </td>
                  <td>{plannedSupplierPerUnit(order)}</td>
                  <td title={plannedSupplierTotalLabel || ''}>
                    {plannedSupplierTotalLabel ? (
                      <span>{plannedSupplierTotalLabel}</span>
                    ) : (
                      <span style={{ color: '#bbb' }}>—</span>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const v = (parseFloat(order.order_payment_uzs_cash) || 0) + (parseFloat(order.order_payment_uzs_card) || 0);
                      return v > 0 ? <span style={{ color: order.order_is_paid ? '#4caf50' : 'inherit' }}>{v.toLocaleString()} UZS</span> : <span style={{ color: '#bbb' }}>—</span>;
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const v = (parseFloat(order.order_payment_usd_cash) || 0) + (parseFloat(order.order_payment_usd_card) || 0);
                      return v > 0 ? <span style={{ color: order.order_is_paid ? '#4caf50' : 'inherit' }}>${v.toFixed(2)}</span> : <span style={{ color: '#bbb' }}>—</span>;
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const v = (parseFloat(order.cargo_payment_uzs_cash) || 0) + (parseFloat(order.cargo_payment_uzs_card) || 0);
                      return v > 0 ? <span style={{ color: order.cargo_is_paid ? '#4caf50' : 'inherit' }}>{v.toLocaleString()} UZS</span> : <span style={{ color: '#bbb' }}>—</span>;
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const v = (parseFloat(order.cargo_payment_usd_cash) || 0) + (parseFloat(order.cargo_payment_usd_card) || 0);
                      return v > 0 ? <span style={{ color: order.cargo_is_paid ? '#4caf50' : 'inherit' }}>${v.toFixed(2)}</span> : <span style={{ color: '#bbb' }}>—</span>;
                    })()}
                  </td>
                  <td>{order.created_by_detail?.username || '-'}</td>
                  <td>{new Date(order.order_date || order.created_at).toLocaleString()}</td>
                </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="12" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td style={{ fontWeight: 600 }}>{orderColumnTotals.quantity.toLocaleString()}</td>
              <td
                style={{ fontWeight: 600 }}
                title="Weighted average planned USD-only line totals per unit ordered (UZS-only lines excluded; no FX)"
              >
                {orderColumnTotals.avgSellingPerUnitOrdered > 0
                  ? `$${orderColumnTotals.avgSellingPerUnitOrdered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {orderColumnTotals.quantity > 0
                  ? `$${orderColumnTotals.avgCostPerUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                ${orderColumnTotals.costTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td style={{ fontWeight: 600 }}>
                {orderColumnTotals.orderUzs > 0 ? `${orderColumnTotals.orderUzs.toLocaleString()} UZS` : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {orderColumnTotals.orderUsd > 0 ? `$${orderColumnTotals.orderUsd.toFixed(2)}` : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {orderColumnTotals.cargoUzs > 0 ? `${orderColumnTotals.cargoUzs.toLocaleString()} UZS` : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {orderColumnTotals.cargoUsd > 0 ? `$${orderColumnTotals.cargoUsd.toFixed(2)}` : '—'}
              </td>
              <td colSpan="2">—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Orders;
