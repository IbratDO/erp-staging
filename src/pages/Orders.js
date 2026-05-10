import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import { formatDisplayAmount } from '../utils/currencyFormat';
import { uniqueSupplierCountriesFromOrdersAndProducts } from '../utils/supplierCountries';
import { prefillPayOrderFromSupplier } from '../utils/orderPayPrefill';
import './TablePage.css';

function numOrZero(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return n > 0 && !Number.isNaN(n) ? n : 0;
}

/** Selling price per unit (USD only). */
function plannedSellingSummary(order) {
  const qi = Math.max(parseInt(order.ordered_quantity, 10) || 1, 1);
  const usdTotal = numOrZero(order.selling_usd_cash) + numOrZero(order.selling_usd_card);
  if (usdTotal > 0) return `$${(usdTotal / qi).toFixed(2)}/u`;
  const pu = parseFloat(order.selling_price);
  if (order.selling_price != null && order.selling_price !== '' && !Number.isNaN(pu) && pu > 0) {
    return `$${pu.toFixed(2)}/u`;
  }
  return '';
}

function plannedSupplierPerUnit(order) {
  const qi = parseInt(order.ordered_quantity, 10) || 1;
  const uzs = numOrZero(order.supplier_cost_uzs_cash) + numOrZero(order.supplier_cost_uzs_card);
  const usdTot = parseFloat(order.cost_total) || 0;
  const usdPu = parseFloat(order.cost_per_unit) || 0;
  if (usdTot > 0 && uzs <= 0 && !Number.isNaN(usdPu)) return `$${usdPu.toFixed(2)}`;
  if (uzs > 0 && usdTot <= 0) {
    const per = uzs / qi;
    return `${per.toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS/u`;
  }
  return '—';
}

function plannedSupplierTotal(order) {
  const usdTot = parseFloat(order.cost_total) || 0;
  if (usdTot > 0) return `$${usdTot.toFixed(2)}`;
  return '';
}

/**
 * Planned supplier payment legs at order creation (UZS buckets + USD buckets or legacy cost_total).
 */
function plannedSupplierPaymentTotals(order) {
  if (!order) return { uzs: 0, usd: 0 };
  const usdBuckets =
    numOrZero(order.supplier_cost_usd_cash) + numOrZero(order.supplier_cost_usd_card);
  const fromCostTotal = parseFloat(order.cost_total) || 0;
  const usd = usdBuckets > 0 ? usdBuckets : fromCostTotal;
  return { uzs: 0, usd };
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
 * Returns false if user cancels confirmation (zero-payment, mismatch vs planned cargo, etc.).
 */
function confirmCargoPaymentIfNeeded(order, uzsCash, uzsCard, usdCash, usdCard) {
  const { uzs: expZ, usd: expD } = plannedCargoPaymentTotals(order);
  const inZ = (uzsCash || 0) + (uzsCard || 0);
  const inD = (usdCash || 0) + (usdCard || 0);

  if (inZ + inD === 0) {
    const hadPlannedCargo = expZ + expD > 0;
    const msg = hadPlannedCargo
      ? 'This order shows cargo amounts on record:\n' +
        `UZS: ${formatDisplayAmount(expZ, 'UZS')}; USD: ${formatDisplayAmount(expD, 'USD')}\n\n` +
        'You submitted 0 everywhere — cargo will be recorded as FREE and those cargo amounts cleared.\n\nProceed?'
      : `Record cargo as paid with no freight charge (all amounts zero)?`;

    return window.confirm(msg);
  }

  if (payTotalsMatchPlanned(expZ, expD, uzsCash, uzsCard, usdCash, usdCard)) {
    return true;
  }

  const msg =
    'The cargo payment totals you entered differ from the cargo amount on this order.\n\n' +
    `On order — UZS: ${formatDisplayAmount(expZ, 'UZS')}; USD: ${formatDisplayAmount(expD, 'USD')}\n` +
    `Entered — UZS: ${formatDisplayAmount(inZ, 'UZS')}; USD: ${formatDisplayAmount(inD, 'USD')}\n\n` +
    'Proceed anyway with this cargo payment?';

  return window.confirm(msg);
}

/**
 * Returns false if user cancels confirmation when totals differ from planned supplier.
 */
function confirmOrderPayTotalsIfMismatch(order, uzsCash, uzsCard, usdCash, usdCard) {
  const { uzs: expZ, usd: expD } = plannedSupplierPaymentTotals(order);
  if (payTotalsMatchPlanned(expZ, expD, uzsCash, uzsCard, usdCash, usdCard)) {
    return true;
  }

  const inZ = (uzsCash || 0) + (uzsCard || 0);
  const inD = (usdCash || 0) + (usdCard || 0);

  const msg =
    "The payment totals you entered differ from this order's planned supplier cost (from when the order was created).\n\n" +
    `Planned — UZS: ${formatDisplayAmount(expZ, 'UZS')}; USD: ${formatDisplayAmount(expD, 'USD')}\n` +
    `Entered — UZS: ${formatDisplayAmount(inZ, 'UZS')}; USD: ${formatDisplayAmount(inD, 'USD')}\n\n` +
    'Proceed anyway with this payment?';

  return window.confirm(msg);
}

function productOrderPickerLabel(p) {
  if (!p) return '';
  const bits = [p.brand, p.model, p.size ? `size ${p.size}` : null, p.color].filter(Boolean);
  return bits.join(' · ');
}
function orderHasCargoCost(o) {
  if (!o) return false;
  const u = parseFloat(o.cargo_cost_uzs) || 0;
  const d = parseFloat(o.cargo_cost_usd) || 0;
  return u > 0 || d > 0;
}

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [balances, setBalances] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    order_type: '',
    status: '',
    year: '',
    month: '',
  });
  const [formData, setFormData] = useState({
    order_type: 'stock',
    product: '',
    supplier_country: '',
    eshop: '',
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
    uzs_cash: '',
    uzs_card: '',
    usd_cash: '',
    usd_card: '',
    is_pay_order: false,
    is_received_and_pay: false,
    status_notes: '',
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  const [cargoFormData, setCargoFormData] = useState({
    orderId: null,
    uzs_cash: '',
    uzs_card: '',
    usd_cash: '',
    usd_card: '',
  });
  const [showCargoForm, setShowCargoForm] = useState(false);
  
  const [showMoveToInventoryForm, setShowMoveToInventoryForm] = useState(false);
  const [isNewEshop, setIsNewEshop] = useState(false);
  const [isNewCountry, setIsNewCountry] = useState(false);
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
    return_payment_type: 'cash',
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

  // Helper: get current balance for a given currency + payment type
  const getAvailableBalance = (currency, paymentType) => {
    const balanceTypeMap = {
      'USD-cash': 'usd_cash',
      'UZS-cash': 'uzs_cash',
      'USD-card': 'usd_card',
      'UZS-card': 'uzs_card',
    };
    const balanceType = balanceTypeMap[`${currency}-${paymentType}`];
    const found = balances.find(b => b.balance_type === balanceType);
    return found ? parseFloat(found.balance) : 0;
  };
  
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

  const applyFilters = (ordersList) => {
    let filtered = ordersList;
    
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
    try {
      const qty = parseInt(formData.ordered_quantity, 10) || 0;
      if (!formData.product || qty < 1) {
        showNotification('Please select a product and enter a valid quantity.', 'error');
        return;
      }
      if (!formData.supplier_country.trim()) {
        showNotification('Please select or enter a Supplier Country.', 'error');
        return;
      }

      const usdS = numOrZero(formData.selling_usd_per_unit);
      if (!(usdS > 0)) {
        showNotification('Enter a selling price per unit in USD.', 'error');
        return;
      }

      const usdSup = numOrZero(formData.cost_usd_per_unit);

      if (formData.order_is_paid && !(usdSup > 0)) {
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
        const required = usdSup;
        const available = getAvailableBalance('USD', formData.order_payment_type);
        if (available < required) {
          showNotification(
            `Insufficient balance. Available: ${available.toFixed(2)} USD (${formData.order_payment_type}), required: ${required.toFixed(2)} USD cost.`,
            'error',
          );
          return;
        }
      }

      const toNum = (v) => parseFloat(v) || 0;
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
        eshop: formData.eshop || '',
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
        advance_payment_amount: toNum(formData.advance_payment_amount),
        advance_payment_currency: formData.advance_payment_currency,
        advance_payment_type: formData.advance_payment_type,
        status: formData.status,
      };

      await api.post('/orders/', orderData);
      setShowForm(false);
      setIsNewEshop(false);
      setIsNewCountry(false);
      setFormCategory('');
      setProductSearch('');
      setProductDropdownOpen(false);
      setFormData({
        order_type: 'stock',
        product: '',
        supplier_country: '',
        eshop: '',
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
    const pref = prefillPayOrderFromSupplier(order);
    setPaymentFormData({
      orderId: orderId,
      uzs_cash: pref.uzs_cash,
      uzs_card: pref.uzs_card,
      usd_cash: pref.usd_cash,
      usd_card: pref.usd_card,
      is_pay_order: true,
      is_received_and_pay: false,
      status_notes: '',
    });
    setShowPaymentForm(true);
    setTimeout(() => paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handlePayCargo = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    // Pre-fill the field that matches the order's cargo cost currency
    const costUzs = order?.cargo_cost_uzs > 0 ? order.cargo_cost_uzs : '';
    const costUsd = order?.cargo_cost_usd > 0 ? order.cargo_cost_usd : '';
    setCargoFormData({
      orderId: orderId,
      uzs_cash: costUzs && order?.cargo_payment_currency !== 'USD' ? costUzs : '',
      uzs_card: '',
      usd_cash: costUsd && order?.cargo_payment_currency === 'USD' ? costUsd : '',
      usd_card: '',
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
        const uzs_cash = parseFloat(paymentFormData.uzs_cash) || 0;
        const uzs_card = parseFloat(paymentFormData.uzs_card) || 0;
        const usd_cash = parseFloat(paymentFormData.usd_cash) || 0;
        const usd_card = parseFloat(paymentFormData.usd_card) || 0;
        if (uzs_cash + uzs_card + usd_cash + usd_card === 0) {
          showNotification('Please enter at least one payment amount.', 'error');
          return;
        }
        const checks = [
          { amount: uzs_cash, currency: 'UZS', type: 'cash' },
          { amount: uzs_card, currency: 'UZS', type: 'card' },
          { amount: usd_cash, currency: 'USD', type: 'cash' },
          { amount: usd_card, currency: 'USD', type: 'card' },
        ];
        for (const { amount, currency, type } of checks) {
          if (amount > 0) {
            const available = getAvailableBalance(currency, type);
            if (available < amount) {
              showNotification(`Insufficient ${currency} ${type} balance. Available: ${available.toFixed(2)} ${currency}, Required: ${amount.toFixed(2)} ${currency}.`, 'error');
              return;
            }
          }
        }
        const orderForPay = orders.find((o) => o.id === paymentFormData.orderId);
        if (
          orderForPay &&
          !confirmOrderPayTotalsIfMismatch(orderForPay, uzs_cash, uzs_card, usd_cash, usd_card)
        ) {
          return;
        }
        await api.post(`/orders/${paymentFormData.orderId}/pay_order/`, { uzs_cash, uzs_card, usd_cash, usd_card });
        setShowPaymentForm(false);
        setPaymentFormData({
          orderId: null,
          uzs_cash: '',
          uzs_card: '',
          usd_cash: '',
          usd_card: '',
          is_pay_order: false,
          is_received_and_pay: false,
          status_notes: '',
        });
        fetchOrders();
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
        const uzs_cash = parseFloat(paymentFormData.uzs_cash) || 0;
        const uzs_card = parseFloat(paymentFormData.uzs_card) || 0;
        const usd_cash = parseFloat(paymentFormData.usd_cash) || 0;
        const usd_card = parseFloat(paymentFormData.usd_card) || 0;
        if (uzs_cash + uzs_card + usd_cash + usd_card === 0) {
          showNotification('Please enter at least one payment amount.', 'error');
          return;
        }
        const balChecks = [
          { amount: uzs_cash, currency: 'UZS', type: 'cash' },
          { amount: uzs_card, currency: 'UZS', type: 'card' },
          { amount: usd_cash, currency: 'USD', type: 'cash' },
          { amount: usd_card, currency: 'USD', type: 'card' },
        ];
        for (const { amount, currency, type } of balChecks) {
          if (amount > 0) {
            const available = getAvailableBalance(currency, type);
            if (available < amount) {
              showNotification(`Insufficient ${currency} ${type} balance. Available: ${available.toFixed(2)} ${currency}, Required: ${amount.toFixed(2)} ${currency}.`, 'error');
              return;
            }
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
        updatePayload.uzs_cash = parseFloat(paymentFormData.uzs_cash) || 0;
        updatePayload.uzs_card = parseFloat(paymentFormData.uzs_card) || 0;
        updatePayload.usd_cash = parseFloat(paymentFormData.usd_cash) || 0;
        updatePayload.usd_card = parseFloat(paymentFormData.usd_card) || 0;
        updatePayload.order_is_paid = true;
      }
      
      // Update order status
      await api.post(`/orders/${paymentFormData.orderId}/update_status/`, updatePayload);
      
      // Refresh orders to get updated status
      await fetchOrders();
      
      setShowPaymentForm(false);
      setPaymentFormData({
        orderId: null,
        uzs_cash: '',
        uzs_card: '',
        usd_cash: '',
        usd_card: '',
        order_payment_amount: '',
        order_payment_currency: 'USD',
        order_payment_type: 'card',
        is_pay_order: false,
        is_received_and_pay: false,
        status_notes: '',
      });
      showNotification('Payment processed successfully!', 'success');
    } catch (error) {
      console.error('Error updating order payment:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error updating order payment', 'error');
    }
  };

  const handleCargoPaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const uzs_cash = parseFloat(cargoFormData.uzs_cash) || 0;
      const uzs_card = parseFloat(cargoFormData.uzs_card) || 0;
      const usd_cash = parseFloat(cargoFormData.usd_cash) || 0;
      const usd_card = parseFloat(cargoFormData.usd_card) || 0;

      // Client-side balance checks (all zeros = free cargo; no balance check)
      const checks = [
        { amount: uzs_cash, currency: 'UZS', type: 'cash' },
        { amount: uzs_card, currency: 'UZS', type: 'card' },
        { amount: usd_cash, currency: 'USD', type: 'cash' },
        { amount: usd_card, currency: 'USD', type: 'card' },
      ];
      for (const { amount, currency, type } of checks) {
        if (amount > 0) {
          const available = getAvailableBalance(currency, type);
          if (available < amount) {
            showNotification(
              `Insufficient ${currency} ${type} balance. Available: ${available.toFixed(2)} ${currency}, Required: ${amount.toFixed(2)} ${currency}. Please top up your balance first.`,
              'error'
            );
            return;
          }
        }
      }

      const cargoOrder = orders.find((o) => o.id === cargoFormData.orderId);
      if (!confirmCargoPaymentIfNeeded(cargoOrder, uzs_cash, uzs_card, usd_cash, usd_card)) {
        return;
      }

      const res = await api.post(`/orders/${cargoFormData.orderId}/pay_cargo/`, {
        uzs_cash, uzs_card, usd_cash, usd_card,
      });
      setShowCargoForm(false);
      setCargoFormData({ orderId: null, uzs_cash: '', uzs_card: '', usd_cash: '', usd_card: '' });
      await fetchOrders();
      showNotification(res.data?.message || 'Cargo payment processed successfully.', 'success');
    } catch (error) {
      console.error('Error paying cargo:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error paying cargo', 'error');
    }
  };

  const handleSellProduct = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    
    if (orderHasCargoCost(order) && !order?.cargo_is_paid) {
      showNotification('Cannot sell product: Cargo payment must be completed first. Please pay for the cargo before selling the product.', 'error');
      return;
    }
    
    try {
      const response = await api.post(`/orders/${orderId}/sell_product/`);
      showNotification(response.data.message || 'Sale created successfully! Please check the Sales tab to complete the payment.', 'success');
      await fetchOrders();
    } catch (error) {
      console.error('Error selling product:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error selling product', 'error');
    }
  };

  const handleMoveToInventoryFromOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);

    // Check if order payment has not been made
    if (!order?.order_is_paid) {
      showNotification('Cannot move to inventory: Order payment must be completed first. Please pay for the order before moving to inventory.', 'error');
      return;
    }

    if (orderHasCargoCost(order) && !order?.cargo_is_paid) {
      showNotification('Cannot move to inventory: Cargo payment must be completed first. Please pay for the cargo before moving to inventory.', 'error');
      return;
    }
    
    if (order && order.advance_payment_amount && order.advance_payment_amount > 0) {
      // Show form to ask about advance payment return
      setMoveToInventoryData({
        orderId: orderId,
        return_advance: false,
        return_payment_type: 'cash',
      });
      setShowMoveToInventoryForm(true);
      setTimeout(() => moveToInventoryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } else {
      // No advance payment, just move to inventory
      await moveToInventoryFromOrder(orderId, false, null);
    }
  };

  const moveToInventoryFromOrder = async (orderId, returnAdvance, returnPaymentType) => {
    try {
      const payload = {
        return_advance: returnAdvance,
      };
      if (returnAdvance && returnPaymentType) {
        payload.return_payment_type = returnPaymentType;
      }
      
      await api.post(`/orders/${orderId}/move_to_inventory_from_order/`, payload);
      setShowMoveToInventoryForm(false);
      setMoveToInventoryData({
        orderId: null,
        return_advance: false,
        return_payment_type: 'cash',
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
    await moveToInventoryFromOrder(
      moveToInventoryData.orderId,
      moveToInventoryData.return_advance,
      moveToInventoryData.return_advance ? moveToInventoryData.return_payment_type : null
    );
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
            Fill in any combination of payment methods. Leave a field empty or 0 if not used.
          </p>
          <form onSubmit={handlePaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>UZS — Cash</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={paymentFormData.uzs_cash}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs_cash: e.target.value })} />
              </div>
              <div className="form-group">
                <label>UZS — Card</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={paymentFormData.uzs_card}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, uzs_card: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD — Cash</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={paymentFormData.usd_cash}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, usd_cash: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD — Card</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={paymentFormData.usd_card}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, usd_card: e.target.value })} />
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
                  setPaymentFormData({
                    orderId: null,
                    uzs_cash: '',
                    uzs_card: '',
                    usd_cash: '',
                    usd_card: '',
                    is_pay_order: false,
                    is_received_and_pay: false,
                    status_notes: '',
                  });
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
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={moveToInventoryData.return_advance}
                    onChange={(e) => setMoveToInventoryData({ ...moveToInventoryData, return_advance: e.target.checked })}
                  />
                  {' '}Return advance payment to customer
                </label>
              </div>
              {moveToInventoryData.return_advance && (
                <div className="form-group">
                  <label>Return Payment Type</label>
                  <select
                    value={moveToInventoryData.return_payment_type}
                    onChange={(e) => setMoveToInventoryData({ ...moveToInventoryData, return_payment_type: e.target.value })}
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              )}
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
                    return_payment_type: 'cash',
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
            Fill in any combination of payment methods. Leave a field empty or 0 if not used. If cargo was{' '}
            <strong>free</strong>, enter <strong>0</strong> in all four fields and submit — that records cargo as paid with no charge.
          </p>
          <form onSubmit={handleCargoPaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>UZS — Cash</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={cargoFormData.uzs_cash}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, uzs_cash: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>UZS — Card</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={cargoFormData.uzs_card}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, uzs_card: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>USD — Cash</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={cargoFormData.usd_cash}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, usd_cash: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>USD — Card</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={cargoFormData.usd_card}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, usd_card: e.target.value })}
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
                  setCargoFormData({ orderId: null, uzs_cash: '', uzs_card: '', usd_cash: '', usd_card: '' });
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
            <div className="form-grid">
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
                <label>Category <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter products)</span></label>
                <select
                  value={formCategory}
                  onChange={(e) => { setFormCategory(e.target.value); setProductSearch(''); setProductDropdownOpen(false); setFormData({ ...formData, product: '', supplier_country: '', selling_usd_per_unit: '', selling_uzs_per_unit: '', cost_usd_per_unit: '', cost_uzs_per_unit: '' }); }}
                >
                  <option value="">All Categories</option>
                  {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" ref={productDropdownRef} style={{ position: 'relative' }}>
                <label>Product</label>
                {(() => {
                  const selectedProduct = products.find(p => p.id === parseInt(formData.product));
                  const filteredByCategory = products.filter(p => !formCategory || p.category === formCategory);
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
                <label>eShop</label>
                {!isNewEshop ? (
                  <select
                    value={formData.eshop}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewEshop(true);
                        setFormData({ ...formData, eshop: '' });
                      } else {
                        setFormData({ ...formData, eshop: e.target.value });
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
                        .filter(e => e && !['zalando','best_secret','adidas','unidays','nike','asos','other'].includes(e))
                    )].sort().map(eshop => (
                      <option key={eshop} value={eshop}>{eshop}</option>
                    ))}
                    <option value="other">Other</option>
                    <option value="__new__">+ Add new eShop...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter new eShop name"
                      value={formData.eshop}
                      onChange={(e) => setFormData({ ...formData, eshop: e.target.value })}
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
              <div className="form-group">
                <label>Ordered Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.ordered_quantity}
                  onChange={(e) => setFormData({ ...formData, ordered_quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  {/* Selling price per unit */}
                  <div style={{ flex: 1 }}>
                    <label style={{ marginBottom: '6px', display: 'block' }}>
                      Selling price per unit (USD) <span style={{ color: '#e53e3e', fontWeight: 400 }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="USD / unit"
                      value={formData.selling_usd_per_unit}
                      onChange={(e) => setFormData({ ...formData, selling_usd_per_unit: e.target.value })}
                      style={{ width: '100%' }}
                    />
                    {numOrZero(formData.selling_usd_per_unit) > 0 && parseInt(formData.ordered_quantity, 10) > 0 && (
                      <div style={{ fontSize: '11px', color: '#718096', marginTop: '3px' }}>
                        = ${(parseFloat(formData.selling_usd_per_unit) * parseInt(formData.ordered_quantity, 10)).toFixed(2)} total
                      </div>
                    )}
                  </div>
                  {/* Cost per unit */}
                  <div style={{ flex: 1 }}>
                    <label style={{ marginBottom: '6px', display: 'block' }}>
                      Cost per unit (USD){' '}
                      <span style={{ color: '#999', fontWeight: 400, fontSize: '11px' }}>optional</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="USD / unit"
                      value={formData.cost_usd_per_unit}
                      onChange={(e) => setFormData({ ...formData, cost_usd_per_unit: e.target.value })}
                      style={{ width: '100%' }}
                    />
                    {numOrZero(formData.cost_usd_per_unit) > 0 && parseInt(formData.ordered_quantity, 10) > 0 && (
                      <div style={{ fontSize: '11px', color: '#718096', marginTop: '3px' }}>
                        = ${(parseFloat(formData.cost_usd_per_unit) * parseInt(formData.ordered_quantity, 10)).toFixed(2)} total
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.order_is_paid}
                    onChange={(e) => setFormData({ ...formData, order_is_paid: e.target.checked })}
                  />
                  {' '}Order payment is already made <span style={{ color: '#666', fontWeight: 400 }}>(USD only)</span>
                </label>
              </div>
              {formData.order_is_paid && (
                <>
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
                  <div className="form-group">
                    <label>Payment Type</label>
                    <select
                      value={formData.order_payment_type}
                      onChange={(e) => setFormData({ ...formData, order_payment_type: e.target.value })}
                      required
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </>
              )}
              {/* Customer and advance payment fields for on-demand orders */}
              {formData.order_type === 'on_demand' && (
                <>
                  <div className="form-group">
                    <label>Customer *</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <select
                        value={formData.customer}
                        onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                        style={{ flex: 1 }}
                        required
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
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        + New
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Advance Payment Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.advance_payment_amount}
                      onChange={(e) => setFormData({ ...formData, advance_payment_amount: e.target.value })}
                      placeholder="Enter advance payment if customer paid"
                    />
                  </div>
                  {formData.advance_payment_amount && parseFloat(formData.advance_payment_amount) > 0 && (
                    <>
                      <div className="form-group">
                        <label>Advance Payment Currency</label>
                        <select
                          value={formData.advance_payment_currency}
                          onChange={(e) => setFormData({ ...formData, advance_payment_currency: e.target.value })}
                        >
                          <option value="USD">USD</option>
                          <option value="UZS">UZS</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Advance Payment Type</label>
                        <select
                          value={formData.advance_payment_type}
                          onChange={(e) => setFormData({ ...formData, advance_payment_type: e.target.value })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
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
                  setFormCategory('');
                  setProductSearch('');
                  setProductDropdownOpen(false);
                  setFormData({
                    order_type: 'stock',
                    product: '',
                    supplier_country: '',
                    eshop: '',
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
                <label>Telephone</label>
                <input
                  type="text"
                  value={newCustomerData.telephone}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, telephone: e.target.value })}
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
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
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
              <option value="received">Received</option>
              <option value="in_inventory">In Inventory</option>
              <option value="cancelled">Cancelled</option>
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
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', order_type: '', status: '', year: '', month: '' })}
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
              <th>ID</th>
              <th>Actions</th>
              <th>Category</th>
              <th>Name</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Supplier Country</th>
              <th>Order Type</th>
              <th>Customer</th>
              <th>Qty</th>
              <th>Selling price/unit</th>
              <th>Cost Per Unit</th>
              <th>Total Cost</th>
              <th>Order UZS Cash</th>
              <th>Order UZS Card</th>
              <th>Order USD Cash</th>
              <th>Order USD Card</th>
              <th>Cargo UZS Cash</th>
              <th>Cargo UZS Card</th>
              <th>Cargo USD Cash</th>
              <th>Cargo USD Card</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="26" style={{ textAlign: 'center' }}>
                  No orders found
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const plannedSellingLabel = plannedSellingSummary(order);
                const plannedSupplierTotalLabel = plannedSupplierTotal(order);
                return (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>
                    {/* Show status update buttons based on current status */}
                    {order.status === 'ordered' && (
                      <button
                        className="btn-status"
                        onClick={() => handleStatusUpdate(order.id, 'received')}
                        style={{ marginRight: '5px' }}
                      >
                        Mark as Received
                      </button>
                    )}
                    {order.status === 'received' && order.order_type === 'stock' && (
                      <button
                        className="btn-status"
                        onClick={() => {
                          if (!order.order_is_paid) {
                            showNotification('Cannot move to inventory: Order payment must be completed first. Please pay for the order before moving to inventory.', 'error');
                            return;
                          }
                          if (orderHasCargoCost(order) && !order.cargo_is_paid) {
                            showNotification('Cannot move to inventory: Cargo payment must be completed first. Please pay for the cargo before moving to inventory.', 'error');
                            return;
                          }
                          handleStatusUpdate(order.id, 'in_inventory');
                        }}
                        style={{ marginRight: '5px' }}
                      >
                        Move to Inventory
                      </button>
                    )}
                    {/* Show payment buttons if payments haven't been made, regardless of status */}
                    {!order.order_is_paid && (
                      <button
                        className="btn-status"
                        onClick={() => handlePayOrder(order.id)}
                        style={{ marginRight: '5px' }}
                      >
                        Pay for the Order
                      </button>
                    )}
                    {!order.cargo_is_paid && (
                      <button
                        className="btn-status"
                        onClick={() => handlePayCargo(order.id)}
                        style={{ marginRight: '5px' }}
                      >
                        Pay for the Cargo
                      </button>
                    )}
                    {/* On-demand order specific buttons when received */}
                    {order.order_type === 'on_demand' && order.status === 'received' && !order.has_sale && (
                      <>
                        <button
                          className="btn-status"
                          onClick={() => handleSellProduct(order.id)}
                          style={{ marginRight: '5px', backgroundColor: '#4caf50', color: 'white' }}
                        >
                          Sell the Product
                        </button>
                        <button
                          className="btn-status"
                          onClick={() => handleMoveToInventoryFromOrder(order.id)}
                          style={{ backgroundColor: '#2196f3', color: 'white' }}
                        >
                          Move to Inventory
                        </button>
                      </>
                    )}
                  </td>
                  <td>{order.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{order.product_detail?.name || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{order.product_detail?.brand || '-'}</td>
                  <td>{order.product_detail?.model || '-'}</td>
                  <td><strong>{order.product_detail?.size || '-'}</strong></td>
                  <td><strong>{order.product_detail?.color || '-'}</strong></td>
                  <td>{order.supplier_country || <span style={{ color: '#999' }}>—</span>}</td>
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
                    {parseFloat(order.order_payment_uzs_cash) > 0
                      ? <span style={{ color: order.order_is_paid ? '#4caf50' : 'inherit' }}>{parseFloat(order.order_payment_uzs_cash).toLocaleString()} UZS</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.order_payment_uzs_card) > 0
                      ? <span style={{ color: order.order_is_paid ? '#4caf50' : 'inherit' }}>{parseFloat(order.order_payment_uzs_card).toLocaleString()} UZS</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.order_payment_usd_cash) > 0
                      ? <span style={{ color: order.order_is_paid ? '#4caf50' : 'inherit' }}>${parseFloat(order.order_payment_usd_cash).toFixed(2)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.order_payment_usd_card) > 0
                      ? <span style={{ color: order.order_is_paid ? '#4caf50' : 'inherit' }}>${parseFloat(order.order_payment_usd_card).toFixed(2)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.cargo_payment_uzs_cash) > 0
                      ? <span style={{ color: order.cargo_is_paid ? '#4caf50' : 'inherit' }}>{parseFloat(order.cargo_payment_uzs_cash).toLocaleString()} UZS</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.cargo_payment_uzs_card) > 0
                      ? <span style={{ color: order.cargo_is_paid ? '#4caf50' : 'inherit' }}>{parseFloat(order.cargo_payment_uzs_card).toLocaleString()} UZS</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.cargo_payment_usd_cash) > 0
                      ? <span style={{ color: order.cargo_is_paid ? '#4caf50' : 'inherit' }}>${parseFloat(order.cargo_payment_usd_cash).toFixed(2)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(order.cargo_payment_usd_card) > 0
                      ? <span style={{ color: order.cargo_is_paid ? '#4caf50' : 'inherit' }}>${parseFloat(order.cargo_payment_usd_card).toFixed(2)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    <span className={`status-badge ${order.status}`}>
                      {order.status.replace('_', ' ')}
                    </span>
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
              <td colSpan="11" style={{ textAlign: 'right' }}>
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
              <td>
                {orderColumnTotals.orderUzsCash > 0
                  ? `${orderColumnTotals.orderUzsCash.toLocaleString()} UZS`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.orderUzsCard > 0
                  ? `${orderColumnTotals.orderUzsCard.toLocaleString()} UZS`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.orderUsdCash > 0
                  ? `$${orderColumnTotals.orderUsdCash.toFixed(2)}`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.orderUsdCard > 0
                  ? `$${orderColumnTotals.orderUsdCard.toFixed(2)}`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.cargoUzsCash > 0
                  ? `${orderColumnTotals.cargoUzsCash.toLocaleString()} UZS`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.cargoUzsCard > 0
                  ? `${orderColumnTotals.cargoUzsCard.toLocaleString()} UZS`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.cargoUsdCash > 0
                  ? `$${orderColumnTotals.cargoUsdCash.toFixed(2)}`
                  : '—'}
              </td>
              <td>
                {orderColumnTotals.cargoUsdCard > 0
                  ? `$${orderColumnTotals.cargoUsdCard.toFixed(2)}`
                  : '—'}
              </td>
              <td colSpan="3">—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Orders;
