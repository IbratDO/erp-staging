import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { productSalePickerLabel } from '../utils/productCost';
import { formatDisplayAmount, formatPlainAmount } from '../utils/currencyFormat';
import SaleCompletePayForm from '../components/SaleCompletePayForm';
import './TablePage.css';

// ----- PackageLinesSelector: compact multi-package row editor -----
function PackageLinesSelector({ lines, onChange, packages: pkgList }) {
  const addLine = () =>
    onChange([...lines, { key: `${Date.now()}-${Math.random()}`, package_type: '', quantity: 1 }]);
  const removeLine = (key) => onChange(lines.filter((l) => l.key !== key));
  const updateLine = (key, field, value) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const fieldH = { padding: '10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '14px', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {lines.map((line, idx) => {
        const pkg = pkgList.find((p) => p.package_type === line.package_type);
        const isLow = pkg && pkg.quantity < line.quantity;
        const isLast = idx === lines.length - 1;
        return (
          <div key={line.key} style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
            {/* Type */}
            <select
              value={line.package_type}
              onChange={(e) => updateLine(line.key, 'package_type', e.target.value)}
              style={{ ...fieldH, flex: '1 1 0', minWidth: 0, background: 'white',
                       borderColor: isLow ? '#fc8181' : '#ddd' }}
            >
              <option value="">— type —</option>
              {pkgList.map((p) => (
                <option key={p.id} value={p.package_type}>
                  {p.package_type} ({p.quantity})
                </option>
              ))}
            </select>

            {/* Qty */}
            <input
              type="number"
              min="1"
              value={line.quantity}
              onChange={(e) => updateLine(line.key, 'quantity', parseInt(e.target.value, 10) || 1)}
              style={{ ...fieldH, width: '62px', textAlign: 'center', flexShrink: 0,
                       borderColor: isLow ? '#fc8181' : '#ddd' }}
            />

            {/* "+ Add type" on last row, remove button on extra rows */}
            {isLast ? (
              <button type="button" onClick={addLine}
                style={{ ...fieldH, border: '1px dashed #90cdf4', background: 'none',
                         color: '#3182ce', cursor: 'pointer', whiteSpace: 'nowrap',
                         flexShrink: 0, transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ebf8ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                + Add type
              </button>
            ) : (
              <button type="button" onClick={() => removeLine(line.key)}
                title="Remove"
                style={{ ...fieldH, border: '1px solid #fed7d7', background: '#fff5f5',
                         color: '#e53e3e', cursor: 'pointer', flexShrink: 0,
                         transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fed7d7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff5f5'; }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_PKG_LINES = () => [{ key: `${Date.now()}`, package_type: '', quantity: 1 }];

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Multi-package lines for the new-sale form
  const [formPackageLines, setFormPackageLines] = useState(EMPTY_PKG_LINES());
  const [showForm, setShowForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchFormCategory, setBatchFormCategory] = useState('');
  const [batchCustomer, setBatchCustomer] = useState('');
  const [batchDefaults, setBatchDefaults] = useState({
    sale_type: 'bought_from_shop',
    sale_currency: 'USD',
  });
  const [batchLines, setBatchLines] = useState([]);
  const [formCategory, setFormCategory] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    status: '',
    year: '',
    month: '',
  });
  const [formData, setFormData] = useState({
    product: '',
    quantity: '',
    selling_price: '',
    sale_currency: 'USD',
    sale_type: 'bought_from_shop',
    customer: '',
    status: 'pending',
    deposit_received: false,
    deposit_amount: '',
    deposit_currency: 'USD',
    deposit_payment_type: 'cash',
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

  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success', // 'success', 'error', 'info'
  });
  
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 5000);
  };

  useEffect(() => {
    fetchSales();
    fetchProducts();
    fetchInventory();
    fetchCustomers();
    fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const fetchPackages = async () => {
    try {
      const response = await api.get('/packages/');
      setPackages(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching packages:', error);
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
  
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!String(newCustomerData.notes || '').trim()) {
      showNotification('Please enter customer notes.', 'error');
      return;
    }
    try {
      const response = await api.post('/customers/', { ...newCustomerData, notes: String(newCustomerData.notes).trim() });
      await fetchCustomers();
      if (showBatchForm) {
        setBatchCustomer(String(response.data.id));
      } else {
        setFormData({ ...formData, customer: response.data.id });
      }
      setShowCustomerForm(false);
      setNewCustomerData({ name: '', telephone: '', instagram: '', notes: '' });
      showNotification('Customer created successfully!', 'success');
    } catch (error) {
      console.error('Error creating customer:', error);
      showNotification(error.response?.data?.error || 'Error creating customer', 'error');
    }
  };

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales/');
      const salesList = response.data.results || response.data;
      setSales(salesList);
      applyFilters(salesList);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (salesList, field) => {
    const values = salesList
      .map(sale => sale.product_detail?.[field])
      .filter(Boolean);
    return [...new Set(values)].sort();
  };

  const applyFilters = (salesList) => {
    let filtered = salesList;
    
    if (filters.category) {
      filtered = filtered.filter(sale =>
        sale.product_detail?.category === filters.category
      );
    }
    if (filters.brand) {
      filtered = filtered.filter(sale => 
        sale.product_detail?.brand === filters.brand
      );
    }
    if (filters.model) {
      filtered = filtered.filter(sale => 
        sale.product_detail?.model === filters.model
      );
    }
    if (filters.size) {
      filtered = filtered.filter(sale => 
        sale.product_detail?.size === filters.size
      );
    }
    if (filters.color) {
      filtered = filtered.filter(sale => 
        sale.product_detail?.color === filters.color
      );
    }
    if (filters.status) {
      filtered = filtered.filter(sale => sale.status === filters.status);
    }
    if (filters.year) {
      filtered = filtered.filter(sale => {
        const saleYear = new Date(sale.sale_date).getFullYear();
        return saleYear.toString() === filters.year;
      });
    }
    if (filters.month) {
      filtered = filtered.filter(sale => {
        const saleMonth = new Date(sale.sale_date).getMonth() + 1; // getMonth() returns 0-11
        return saleMonth.toString() === filters.month;
      });
    }
    
    setFilteredSales(filtered);
  };

  useEffect(() => {
    if (sales.length > 0) {
      applyFilters(sales);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const salesColumnTotals = useMemo(() => {
    const list = filteredSales;
    if (!list.length) {
      return {
        quantity: 0,
        totalAmount: 0,
        totalAmountCurrency: null,
        uzsCash: 0,
        uzsCard: 0,
        usdCash: 0,
        usdCard: 0,
      };
    }
    let quantity = 0;
    let totalAmount = 0;
    let uzsCash = 0;
    let uzsCard = 0;
    let usdCash = 0;
    let usdCard = 0;
    const saleCurrencies = new Set();
    for (const s of list) {
      quantity += parseInt(s.quantity, 10) || 0;
      totalAmount += parseFloat(s.total_amount) || 0;
      saleCurrencies.add(s.sale_currency || 'USD');
      uzsCash += parseFloat(s.payment_uzs_cash) || 0;
      uzsCard += parseFloat(s.payment_uzs_card) || 0;
      usdCash += parseFloat(s.payment_usd_cash) || 0;
      usdCard += parseFloat(s.payment_usd_card) || 0;
    }
    const totalAmountCurrency =
      saleCurrencies.size === 1 ? [...saleCurrencies][0] : null;
    return {
      quantity,
      totalAmount,
      totalAmountCurrency,
      uzsCash,
      uzsCard,
      usdCash,
      usdCard,
    };
  }, [filteredSales]);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      setProducts(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory/');
      setInventory(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer) {
      showNotification('Please select a customer before creating a sale.', 'error');
      return;
    }
    try {
      const itemQty = parseInt(formData.quantity, 10) || 1;
      // Check inventory availability for the selected product
      const selectedProduct = products.find(p => p.id === parseInt(formData.product));
      if (selectedProduct) {
        // Find inventory items for this product with status 'in_inventory'
        const inventoryItems = inventory.filter(
          item => item.product === parseInt(formData.product) && item.status === 'in_inventory'
        );
        const totalAvailable = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        
        if (totalAvailable < itemQty) {
          showNotification(`Insufficient inventory! Available: ${totalAvailable}, Requested: ${formData.quantity}. This product is sold out or has insufficient stock.`, 'error');
          return;
        }
      }
      
      // Validate multi-package lines
      const activeLines = formPackageLines.filter((l) => l.package_type && l.quantity > 0);
      for (const line of activeLines) {
        const pkg = packages.find((p) => p.package_type === line.package_type);
        if (!pkg) {
          showNotification(`Package type "${line.package_type}" does not exist.`, 'error');
          return;
        }
        const totalNeeded = activeLines
          .filter((l) => l.package_type === line.package_type)
          .reduce((s, l) => s + l.quantity, 0);
        if (pkg.quantity < totalNeeded) {
          showNotification(`Insufficient stock for package "${line.package_type}": need ${totalNeeded}, have ${pkg.quantity}.`, 'error');
          return;
        }
      }

      const salePayload = {
        ...formData,
        product: parseInt(formData.product, 10),
        quantity: itemQty,
        customer: parseInt(formData.customer, 10),
        package_type: null,
        package_quantity: null,
        ...(activeLines.length > 0 ? { package_lines: activeLines.map(({ package_type, quantity }) => ({ package_type, quantity })) } : {}),
      };
      await api.post('/sales/', salePayload);
      setShowForm(false);
      setFormCategory('');
      setFormPackageLines(EMPTY_PKG_LINES());
      setFormData({
        product: '',
        quantity: '',
        selling_price: '',
        sale_currency: 'USD',
        sale_type: 'bought_from_shop',
        customer: '',
        status: 'pending',
        deposit_received: false,
        deposit_amount: '',
        deposit_currency: 'USD',
        deposit_payment_type: 'cash',
      });
      fetchSales();
      fetchInventory(); // Refresh inventory after sale
      showNotification('Sale created successfully!', 'success');
    } catch (error) {
      console.error('Error creating sale:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error creating sale', 'error');
    }
  };

  const updateBatchLine = (key, field, value) => {
    setBatchLines((lines) =>
      lines.map((l) => {
        if (l.key !== key) return l;
        if (field === 'product') {
          const p = value && products.find((x) => x.id === parseInt(value, 10));
          const next = { ...l, product: value };
          if (p && p.selling_price != null) {
            next.selling_price = String(p.selling_price);
          }
          if (!value) {
            next.selling_price = '';
            next.packageLines = EMPTY_PKG_LINES();
          }
          return next;
        }
        return { ...l, [field]: value };
      })
    );
  };

  const addBatchLine = () => {
    setBatchLines((lines) => [
      ...lines,
      {
        key: `${Date.now()}-${Math.random()}`,
        product: '',
        quantity: '1',
        selling_price: '',
        packageLines: EMPTY_PKG_LINES(),
      },
    ]);
  };

  const removeBatchLine = (key) => {
    setBatchLines((lines) => (lines.length <= 1 ? lines : lines.filter((l) => l.key !== key)));
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (!batchCustomer) {
      showNotification('Please select a customer before creating sales.', 'error');
      return;
    }
    const withProduct = batchLines.filter((l) => l.product);
    if (withProduct.length === 0) {
      showNotification('Add at least one line with a product selected.', 'error');
      return;
    }
    for (const l of withProduct) {
      if (l.selling_price === '' || l.selling_price == null) {
        showNotification('Set a selling price for every line (pick a product to prefill it).', 'error');
        return;
      }
    }
    // Aggregate package need across all lines for stock check
    const needPkg = new Map();
    const items = withProduct.map((l) => {
      const itemQty = parseInt(String(l.quantity), 10) || 1;
      const activeLines = (l.packageLines || []).filter((pl) => pl.package_type && pl.quantity > 0);
      const row = {
        product: parseInt(l.product, 10),
        quantity: itemQty,
        selling_price: l.selling_price,
        package_type: null,
        package_quantity: null,
      };
      if (activeLines.length > 0) {
        row.package_lines = activeLines.map(({ package_type, quantity }) => ({ package_type, quantity }));
        for (const pl of activeLines) {
          needPkg.set(pl.package_type, (needPkg.get(pl.package_type) || 0) + pl.quantity);
        }
      }
      return row;
    });
    const needByProduct = new Map();
    for (const l of withProduct) {
      const pid = parseInt(l.product, 10);
      const q = parseInt(l.quantity, 10) || 0;
      needByProduct.set(pid, (needByProduct.get(pid) || 0) + q);
    }
    for (const [pid, need] of needByProduct) {
      const invItems = inventory.filter(
        (x) => x.product === pid && x.status === 'in_inventory'
      );
      const available = invItems.reduce((s, it) => s + (it.quantity || 0), 0);
      if (available < need) {
        showNotification(
          `Insufficient inventory for product #${pid}: need ${need}, have ${available}.`,
          'error'
        );
        return;
      }
    }
    for (const [pt, n] of needPkg) {
      const pkg = packages.find((p) => p.package_type === pt);
      if (!pkg) {
        showNotification(`Package type "${pt}" is not in inventory.`, 'error');
        return;
      }
      if (pkg.quantity < n) {
        showNotification(
          `Insufficient package "${pt}": need ${n}, have ${pkg.quantity}.`,
          'error'
        );
        return;
      }
    }
    try {
      const { data } = await api.post('/sales/batch_create/', {
        customer: parseInt(batchCustomer, 10),
        defaults: {
          sale_type: batchDefaults.sale_type,
          sale_currency: batchDefaults.sale_currency,
          status: 'pending',
        },
        items,
      });
      showNotification(data.message || `Created ${data.count} sale(s).`, 'success');
      setShowBatchForm(false);
      setBatchFormCategory('');
      setBatchCustomer('');
      setBatchLines([]);
      fetchSales();
      fetchInventory();
      fetchPackages();
    } catch (error) {
      console.error('Error batch-creating sales:', error);
      const d = error.response?.data;
      if (d?.item_errors) {
        showNotification(
          d.error || 'One or more lines failed validation.',
          'error'
        );
        console.warn('batch_create item_errors', d.item_errors);
      } else {
        showNotification(
          d?.error || d?.detail || 'Error creating batch sales',
          'error'
        );
      }
    }
  };

  const [dispatchFormData, setDispatchFormData] = useState({
    saleId: null,
    delivery_cost: '',
    tracking_number: '',
    dispatch_type: 'dostavshik',
    dispatcher: '',
    is_paid: false,
    currency: 'UZS',
    payment_type: 'cash',
    dispatch_notes: '',
  });
  const [dispatchersList, setDispatchersList] = useState([]);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  
  const [showSellReservedForm, setShowSellReservedForm] = useState(false);
  const [sellReservedData, setSellReservedData] = useState({
    saleId: null,
    uzs_cash: '',
    uzs_card: '',
    usd_cash: '',
    usd_card: '',
  });
  
  /** When set, shows shared Complete & Pay form (same flow as Dispatchers tab). */
  const [completePaySale, setCompletePaySale] = useState(null);
  
  const [showCompleteFromOrderForm, setShowCompleteFromOrderForm] = useState(false);
  const [completeFromOrderPackageLines, setCompleteFromOrderPackageLines] = useState(EMPTY_PKG_LINES());
  const [completeFromOrderData, setCompleteFromOrderData] = useState({
    saleId: null,
    customer: '',
    selling_price: '',
    sale_type: 'bought_from_shop',
    now_uzs_cash: '',
    now_uzs_card: '',
    now_usd_cash: '',
    now_usd_card: '',
    deposit_received: false,
    deposit_amount: '',
    deposit_currency: 'USD',
    deposit_payment_type: 'cash',
  });

  const handleStatusUpdate = async (saleId, newStatus) => {
    try {
      if (newStatus === 'dispatched') {
        // Show dispatch form to enter delivery cost
        setDispatchFormData({
          saleId: saleId,
          delivery_cost: '',
          tracking_number: '',
          dispatch_type: 'dostavshik',
          dispatcher: '',
          is_paid: false,
          currency: 'UZS',
          payment_type: 'cash',
          dispatch_notes: '',
        });
        setShowDispatchForm(true);
      } else if (newStatus === 'completed') {
        const sale = sales.find(s => s.id === saleId);
        if (!sale) {
          console.warn('Sale not found when trying to complete:', saleId);
          return;
        }
        setCompletePaySale(sale);
      } else {
        await api.post(`/sales/${saleId}/update_status/`, { status: newStatus, notes: '' });
        fetchSales();
        showNotification(`Sale status updated to ${newStatus}`, 'success');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      // Only show an error notification when we actually called the backend
      if (newStatus !== 'completed') {
        showNotification('Error updating status', 'error');
      }
    }
  };

  useEffect(() => {
    if (!showDispatchForm) return;
    (async () => {
      try {
        const res = await api.get('/dispatchers/', { params: { is_active: true } });
        setDispatchersList(res.data.results || res.data);
      } catch (err) {
        console.error('Error loading dispatchers:', err);
        setDispatchersList([]);
      }
    })();
  }, [showDispatchForm]);

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!String(dispatchFormData.dispatch_notes || '').trim()) {
      showNotification('Please enter notes for the status change and dispatch.', 'error');
      return;
    }
    const dn = String(dispatchFormData.dispatch_notes).trim();
    try {
      if (dispatchFormData.dispatch_type === 'dostavshik') {
        if (!dispatchFormData.dispatcher) {
          showNotification('Select a dispatcher for Dostavshik delivery.', 'error');
          return;
        }
        if (dispatchersList.length === 0) {
          showNotification('No active dispatchers. Add one under Dispatchers.', 'error');
          return;
        }
      }

      // First update sale status to dispatched
      await api.post(`/sales/${dispatchFormData.saleId}/update_status/`, { status: 'dispatched', notes: dn });
      
      // Then create dispatch with delivery cost
      const sale = sales.find(s => s.id === dispatchFormData.saleId);
      if (sale) {
        const dispatchData = {
          sale: dispatchFormData.saleId,
          dispatch_type: dispatchFormData.dispatch_type,
          is_paid: dispatchFormData.is_paid,
          delivery_cost: dispatchFormData.currency === 'USD' ? dispatchFormData.delivery_cost : 0,
          delivery_cost_uzs: dispatchFormData.currency === 'UZS' ? dispatchFormData.delivery_cost : 0,
          tracking_number: dispatchFormData.tracking_number || '',
          status: 'dispatched',
          logistics_notes: dn,
        };
        if (dispatchFormData.dispatch_type === 'dostavshik' && dispatchFormData.dispatcher) {
          dispatchData.dispatcher = parseInt(dispatchFormData.dispatcher, 10);
        }
        
        // Map payment_type and currency to delivery_payment_cash or delivery_payment_card
        if (dispatchFormData.currency === 'UZS') {
          if (dispatchFormData.payment_type === 'cash') {
            dispatchData.delivery_payment_cash = dispatchFormData.delivery_cost;
            dispatchData.delivery_payment_card = 0;
          } else {
            dispatchData.delivery_payment_card = dispatchFormData.delivery_cost;
            dispatchData.delivery_payment_cash = 0;
          }
        } else {
          // For USD, we'll store in delivery_cost and let backend handle it
          dispatchData.delivery_payment_cash = 0;
          dispatchData.delivery_payment_card = 0;
        }
        
        await api.post('/dispatches/', dispatchData);
      }
      
      setShowDispatchForm(false);
      setDispatchFormData({
        saleId: null,
        delivery_cost: '',
        tracking_number: '',
        dispatch_type: 'dostavshik',
        dispatcher: '',
        is_paid: false,
        currency: 'UZS',
        payment_type: 'cash',
        dispatch_notes: '',
      });
      fetchSales();
      showNotification('Dispatch created successfully!', 'success');
    } catch (error) {
      console.error('Error creating dispatch:', error);
      showNotification('Error creating dispatch', 'error');
    }
  };

  const handleCompleteFromOrder = async (saleId) => {
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      const totalAmount = parseFloat(sale.selling_price) * sale.quantity;
      const advancePayment = sale.advance_payment_received || 0;
      const nowPaidAmount = totalAmount - advancePayment;
      setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
      setCompleteFromOrderData({
        saleId: saleId,
        customer: sale.customer || sale.order_detail?.customer || '',
        selling_price: sale.selling_price || '',
        sale_type: 'bought_from_shop',
        now_uzs_cash: '',
        now_uzs_card: '',
        now_usd_cash: nowPaidAmount > 0 ? nowPaidAmount.toFixed(2) : '0',
        now_usd_card: '',
        deposit_received: false,
        deposit_amount: '',
        deposit_currency: 'USD',
        deposit_payment_type: 'cash',
      });
      setShowCompleteFromOrderForm(true);
    }
  };

  const handleCompleteFromOrderSubmit = async (e) => {
    e.preventDefault();
    try {
      const sellingPrice = parseFloat(completeFromOrderData.selling_price);
      
      if (!sellingPrice || sellingPrice <= 0) {
        showNotification('Selling price is required and must be greater than 0', 'error');
        return;
      }
      
      // Validate multi-package lines for complete-from-order
      const cfoActiveLines = completeFromOrderPackageLines.filter((l) => l.package_type && l.quantity > 0);
      for (const line of cfoActiveLines) {
        const pkg = packages.find((p) => p.package_type === line.package_type);
        if (!pkg) {
          showNotification(`Package type "${line.package_type}" does not exist.`, 'error');
          return;
        }
        const totalNeeded = cfoActiveLines
          .filter((l) => l.package_type === line.package_type)
          .reduce((s, l) => s + l.quantity, 0);
        if (pkg.quantity < totalNeeded) {
          showNotification(`Insufficient stock for package "${line.package_type}": need ${totalNeeded}, have ${pkg.quantity}.`, 'error');
          return;
        }
      }

      const requestData = {
        customer: completeFromOrderData.customer,
        selling_price: sellingPrice,
        sale_type: completeFromOrderData.sale_type,
        package_type: null,
        package_quantity: null,
        uzs_cash: parseFloat(completeFromOrderData.now_uzs_cash) || 0,
        uzs_card: parseFloat(completeFromOrderData.now_uzs_card) || 0,
        usd_cash: parseFloat(completeFromOrderData.now_usd_cash) || 0,
        usd_card: parseFloat(completeFromOrderData.now_usd_card) || 0,
        ...(cfoActiveLines.length > 0 ? {
          package_lines: cfoActiveLines.map(({ package_type, quantity }) => ({ package_type, quantity })),
        } : {}),
      };
      
      // Add deposit fields if reserved sale
      if (completeFromOrderData.sale_type === 'reserved') {
        requestData.deposit_received = completeFromOrderData.deposit_received;
        if (completeFromOrderData.deposit_received && completeFromOrderData.deposit_amount) {
          requestData.deposit_amount = parseFloat(completeFromOrderData.deposit_amount);
          requestData.deposit_currency = completeFromOrderData.deposit_currency;
          requestData.deposit_payment_type = completeFromOrderData.deposit_payment_type;
        }
      }
      
      await api.post(`/sales/${completeFromOrderData.saleId}/complete_from_order/`, requestData);
      
      // If delivery sale, show dispatch form instead of closing
      if (completeFromOrderData.sale_type === 'delivery') {
        setShowCompleteFromOrderForm(false);
        setDispatchFormData({
          saleId: completeFromOrderData.saleId,
          delivery_cost: '',
          tracking_number: '',
          dispatch_type: 'dostavshik',
          dispatcher: '',
          is_paid: false,
          currency: 'UZS',
          payment_type: 'cash',
          dispatch_notes: '',
        });
        setShowDispatchForm(true);
        setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
        setCompleteFromOrderData({
          saleId: null,
          customer: '',
          selling_price: '',
          sale_type: 'bought_from_shop',
          now_uzs_cash: '',
          now_uzs_card: '',
          now_usd_cash: '',
          now_usd_card: '',
          deposit_received: false,
          deposit_amount: '',
          deposit_currency: 'USD',
          deposit_payment_type: 'cash',
        });
        fetchSales();
        showNotification('Sale completed! Please enter dispatch information.', 'success');
      } else {
        setShowCompleteFromOrderForm(false);
        setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
        setCompleteFromOrderData({
          saleId: null,
          customer: '',
          selling_price: '',
          sale_type: 'bought_from_shop',
          now_uzs_cash: '',
          now_uzs_card: '',
          now_usd_cash: '',
          now_usd_card: '',
          deposit_received: false,
          deposit_amount: '',
          deposit_currency: 'USD',
          deposit_payment_type: 'cash',
        });
        fetchSales();
        showNotification('Sale from order completed successfully!', 'success');
      }
    } catch (error) {
      console.error('Error completing sale from order:', error);
      showNotification(error.response?.data?.error || 'Error completing sale', 'error');
    }
  };

  const handleCancelReserved = async (saleId) => {
    if (window.confirm('Are you sure you want to cancel this reserved sale? The item will be returned to inventory.')) {
      try {
        await api.post(`/sales/${saleId}/cancel_reserved/`);
        fetchSales();
        fetchInventory();
        showNotification('Reserved sale cancelled successfully. Item returned to inventory.', 'success');
      } catch (error) {
        console.error('Error cancelling reserved sale:', error);
        showNotification(error.response?.data?.error || 'Error cancelling reserved sale', 'error');
      }
    }
  };

  const handleSellReserved = async (saleId) => {
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      // Calculate total including package cost
      const itemTotal = parseFloat(sale.selling_price) * sale.quantity;
      const packageCost = sale.package_cost || 0;
      const totalAmount = itemTotal + parseFloat(packageCost);
      const depositAmount = sale.deposit_amount || 0;
      const remainingAmount = totalAmount - depositAmount;
      
      setSellReservedData({
        saleId: saleId,
        payment_amount: remainingAmount > 0 ? remainingAmount.toFixed(2) : '0',
        payment_currency: sale.sale_currency || 'USD',
        payment_type: 'cash',
      });
      setShowSellReservedForm(true);
    }
  };

  const handleSellReservedSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/sales/${sellReservedData.saleId}/sell_reserved/`, {
        uzs_cash: parseFloat(sellReservedData.uzs_cash) || 0,
        uzs_card: parseFloat(sellReservedData.uzs_card) || 0,
        usd_cash: parseFloat(sellReservedData.usd_cash) || 0,
        usd_card: parseFloat(sellReservedData.usd_card) || 0,
        // legacy compat placeholder:
        payment_type: sellReservedData.payment_type,
      });
      setShowSellReservedForm(false);
      setSellReservedData({
        saleId: null,
        payment_amount: '',
        payment_currency: 'USD',
        payment_type: 'cash',
      });
      fetchSales();
      showNotification('Reserved sale completed successfully!', 'success');
    } catch (error) {
      console.error('Error completing reserved sale:', error);
      showNotification(error.response?.data?.error || 'Error completing reserved sale', 'error');
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
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

      <div className="page-header">
        <h1>Sales</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                setFormCategory('');
              } else {
                setShowBatchForm(false);
                setShowForm(true);
              }
            }}
          >
            {showForm ? 'Cancel' : '+ New sale'}
          </button>
          <button
            type="button"
            className="btn-edit"
            onClick={() => {
              if (showBatchForm) {
                setShowBatchForm(false);
                setBatchFormCategory('');
                setBatchLines([]);
              } else {
                setShowForm(false);
                setFormCategory('');
                setShowBatchForm(true);
                setBatchFormCategory('');
                setBatchCustomer('');
                setBatchDefaults({
                  sale_type: 'bought_from_shop',
                  sale_currency: 'USD',
                });
                setBatchLines([
                  {
                    key: `${Date.now()}-0`,
                    product: '',
                    quantity: '1',
                    selling_price: '',
                    package_type: '',
                    package_quantity: '',
                  },
                ]);
              }
            }}
          >
            {showBatchForm ? 'Close' : 'Multi-item (one customer)'}
          </button>
        </div>
      </div>

      {showDispatchForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Create Dispatch</h2>
          <form onSubmit={handleDispatchSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Dispatch Type</label>
                <select
                  value={dispatchFormData.dispatch_type}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDispatchFormData({
                      ...dispatchFormData,
                      dispatch_type: v,
                      dispatcher: v === 'dostavshik' ? dispatchFormData.dispatcher : '',
                    });
                  }}
                  required
                >
                  <option value="dostavshik">Dostavshik</option>
                  <option value="bts">BTS</option>
                </select>
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#555' }}>
                  Dostavshik: assign your courier here. BTS: carrier logistics; delivery and payments are still tracked in the Dispatchers tab.
                </p>
              </div>
              {dispatchFormData.dispatch_type === 'dostavshik' && (
                <div className="form-group">
                  <label>Dispatcher *</label>
                  <select
                    value={dispatchFormData.dispatcher}
                    onChange={(e) => setDispatchFormData({ ...dispatchFormData, dispatcher: e.target.value })}
                    required
                  >
                    <option value="">Select dispatcher…</option>
                    {dispatchersList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={dispatchFormData.currency}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, currency: e.target.value })}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Payment Type</label>
                <select
                  value={dispatchFormData.payment_type}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, payment_type: e.target.value })}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="form-group">
                <label>Delivery Cost ({dispatchFormData.currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dispatchFormData.delivery_cost}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, delivery_cost: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Tracking Number (Optional)</label>
                <input
                  type="text"
                  value={dispatchFormData.tracking_number}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, tracking_number: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes *</label>
                <textarea
                  rows={3}
                  value={dispatchFormData.dispatch_notes}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, dispatch_notes: e.target.value })}
                  required
                />
                <small style={{ color: '#666' }}>Required for the sale status change and for dispatch logistics notes.</small>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dispatchFormData.is_paid}
                    onChange={(e) => setDispatchFormData({ ...dispatchFormData, is_paid: e.target.checked })}
                  />
                  Payment Made (if unchecked, will be recorded as Payable)
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Dispatch
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowDispatchForm(false);
                  setDispatchFormData({
                    saleId: null,
                    delivery_cost: '',
                    tracking_number: '',
                    dispatch_type: 'dostavshik',
                    dispatcher: '',
                    is_paid: false,
                    currency: 'UZS',
                    payment_type: 'cash',
                    dispatch_notes: '',
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showCompleteFromOrderForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Complete Sale from Order - Sale #{completeFromOrderData.saleId}</h2>
          <form onSubmit={handleCompleteFromOrderSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Sale Type</label>
                <select
                  value={completeFromOrderData.sale_type}
                  onChange={(e) => {
                    const newSaleType = e.target.value;
                    setCompleteFromOrderData({
                      ...completeFromOrderData,
                      sale_type: newSaleType,
                      // Reset deposit fields if not reserved
                      deposit_received: newSaleType === 'reserved' ? completeFromOrderData.deposit_received : false,
                      deposit_amount: newSaleType === 'reserved' ? completeFromOrderData.deposit_amount : '',
                    });
                  }}
                  required
                >
                  <option value="bought_from_shop">Bought from Shop</option>
                  <option value="delivery">Delivery</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>
              <div className="form-group">
                <label>Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={completeFromOrderData.selling_price}
                  onChange={(e) => {
                    const sellingPrice = parseFloat(e.target.value) || 0;
                    const sale = sales.find(s => s.id === completeFromOrderData.saleId);
                    const advancePayment = sale?.advance_payment_received || 0;
                    const depositAmount = parseFloat(completeFromOrderData.deposit_amount || 0);
                    const totalAmount = sellingPrice * (sale?.quantity || 1);
                    // For reserved sales, calculate remaining after deposit
                    const nowPaid = completeFromOrderData.sale_type === 'reserved' 
                      ? totalAmount - advancePayment - depositAmount
                      : totalAmount - advancePayment;
                    setCompleteFromOrderData({
                      ...completeFromOrderData,
                      selling_price: e.target.value,
                      now_paid_amount: nowPaid > 0 ? nowPaid.toFixed(2) : '0',
                    });
                  }}
                  required
                />
              </div>
              <div className="form-group">
                <label>Advance Payment Received (Auto-filled)</label>
                <input
                  type="number"
                  step="0.01"
                  value={sales.find(s => s.id === completeFromOrderData.saleId)?.advance_payment_received || 0}
                  readOnly
                  style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                />
              </div>
              {/* Deposit fields for Reserved sales */}
              {completeFromOrderData.sale_type === 'reserved' && (
                <>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={completeFromOrderData.deposit_received}
                        onChange={(e) => {
                          const depositReceived = e.target.checked;
                          const sale = sales.find(s => s.id === completeFromOrderData.saleId);
                          const sellingPrice = parseFloat(completeFromOrderData.selling_price) || 0;
                          const advancePayment = sale?.advance_payment_received || 0;
                          const depositAmount = depositReceived ? parseFloat(completeFromOrderData.deposit_amount || 0) : 0;
                          const totalAmount = sellingPrice * (sale?.quantity || 1);
                          const nowPaid = totalAmount - advancePayment - depositAmount;
                          setCompleteFromOrderData({
                            ...completeFromOrderData,
                            deposit_received: depositReceived,
                            now_paid_amount: nowPaid > 0 ? nowPaid.toFixed(2) : '0',
                          });
                        }}
                      />
                      {' '}Customer deposited money
                    </label>
                  </div>
                  {completeFromOrderData.deposit_received && (
                    <>
                      <div className="form-group">
                        <label>Deposit Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={completeFromOrderData.deposit_amount}
                          onChange={(e) => {
                            const depositAmount = parseFloat(e.target.value) || 0;
                            const sale = sales.find(s => s.id === completeFromOrderData.saleId);
                            const sellingPrice = parseFloat(completeFromOrderData.selling_price) || 0;
                            const advancePayment = sale?.advance_payment_received || 0;
                            const totalAmount = sellingPrice * (sale?.quantity || 1);
                            const nowPaid = totalAmount - advancePayment - depositAmount;
                            setCompleteFromOrderData({
                              ...completeFromOrderData,
                              deposit_amount: e.target.value,
                              now_paid_amount: nowPaid > 0 ? nowPaid.toFixed(2) : '0',
                            });
                          }}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Deposit Currency</label>
                        <select
                          value={completeFromOrderData.deposit_currency}
                          onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, deposit_currency: e.target.value })}
                          required
                        >
                          <option value="USD">USD</option>
                          <option value="UZS">UZS</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Deposit Payment Type</label>
                        <select
                          value={completeFromOrderData.deposit_payment_type}
                          onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, deposit_payment_type: e.target.value })}
                          required
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="form-group">
                <label>Packages <span style={{ fontWeight: 400, color: '#a0aec0', fontSize: '12px' }}>(optional)</span></label>
                <PackageLinesSelector
                  lines={completeFromOrderPackageLines}
                  onChange={setCompleteFromOrderPackageLines}
                  packages={packages}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1', borderTop: '1px solid #eee', paddingTop: '12px', marginTop: '4px' }}>
                <p style={{ margin: '0 0 10px 0', color: '#555', fontSize: '0.9em', fontWeight: 600 }}>
                  Payment — fill any combination:
                </p>
              </div>
              <div className="form-group">
                <label>UZS — Cash</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={completeFromOrderData.now_uzs_cash}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, now_uzs_cash: e.target.value })} />
              </div>
              <div className="form-group">
                <label>UZS — Card</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={completeFromOrderData.now_uzs_card}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, now_uzs_card: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD — Cash</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={completeFromOrderData.now_usd_cash}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, now_usd_cash: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD — Card</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={completeFromOrderData.now_usd_card}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, now_usd_card: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Complete Sale
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowCompleteFromOrderForm(false);
                  setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
                  setCompleteFromOrderData({
                    saleId: null,
                    customer: '',
                    selling_price: '',
                    sale_type: 'bought_from_shop',
                    now_uzs_cash: '',
                    now_uzs_card: '',
                    now_usd_cash: '',
                    now_usd_card: '',
                    deposit_received: false,
                    deposit_amount: '',
                    deposit_currency: 'USD',
                    deposit_payment_type: 'cash',
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {completePaySale && (
        <SaleCompletePayForm
          sale={completePaySale}
          onClose={() => setCompletePaySale(null)}
          onSuccess={() => {
            setCompletePaySale(null);
            fetchSales();
          }}
          showNotification={showNotification}
        />
      )}

      {showSellReservedForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Complete Reserved Sale #{sellReservedData.saleId}</h2>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            Fill in any combination of payment methods for the remaining amount.
          </p>
          <form onSubmit={handleSellReservedSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>UZS — Cash</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={sellReservedData.uzs_cash}
                  onChange={(e) => setSellReservedData({ ...sellReservedData, uzs_cash: e.target.value })} />
              </div>
              <div className="form-group">
                <label>UZS — Card</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={sellReservedData.uzs_card}
                  onChange={(e) => setSellReservedData({ ...sellReservedData, uzs_card: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD — Cash</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={sellReservedData.usd_cash}
                  onChange={(e) => setSellReservedData({ ...sellReservedData, usd_cash: e.target.value })} />
              </div>
              <div className="form-group">
                <label>USD — Card</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={sellReservedData.usd_card}
                  onChange={(e) => setSellReservedData({ ...sellReservedData, usd_card: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Complete Sale
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowSellReservedForm(false);
                  setSellReservedData({
                    saleId: null,
                    payment_amount: '',
                    payment_currency: 'USD',
                    payment_type: 'cash',
                  });
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
          <h2>New Sale</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Filter by category</label>
                <select
                  value={formCategory}
                  onChange={(e) => { setFormCategory(e.target.value); setFormData({ ...formData, product: '', selling_price: '' }); }}
                >
                  <option value="">All Categories</option>
                  {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Product</label>
                <select
                  value={formData.product}
                  onChange={(e) => {
                    const selectedProductId = e.target.value;
                    const selectedProduct = products.find(p => p.id === parseInt(selectedProductId));
                    setFormData({
                      ...formData,
                      product: selectedProductId,
                      selling_price: selectedProduct ? selectedProduct.selling_price : formData.selling_price,
                    });
                  }}
                  required
                >
                  <option value="">Select a product</option>
                  {products
                    .filter(p => !formCategory || p.category === formCategory)
                    .slice()
                    .sort((a, b) => b.id - a.id)
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {productSalePickerLabel(product)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>In Inventory</label>
                <input
                  type="number"
                  value={
                    formData.product
                      ? (() => {
                          const inventoryItems = inventory.filter(
                            item => item.product === parseInt(formData.product) && item.status === 'in_inventory'
                          );
                          return inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                        })()
                      : ''
                  }
                  readOnly
                  style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                />
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={formData.sale_currency}
                  onChange={(e) => setFormData({ ...formData, sale_currency: e.target.value })}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Selling Price ({formData.sale_currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Sale Type</label>
                <select
                  value={formData.sale_type}
                  onChange={(e) => {
                    const newSaleType = e.target.value;
                    setFormData({ 
                      ...formData, 
                      sale_type: newSaleType,
                      // Set status to 'reserved' if sale type is reserved
                      status: newSaleType === 'reserved' ? 'reserved' : 'pending',
                    });
                  }}
                  required
                >
                  <option value="bought_from_shop">Bought from Shop</option>
                  <option value="delivery">Delivery</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>
              <div className="form-group">
                <label>Packages <span style={{ fontWeight: 400, color: '#a0aec0', fontSize: '12px' }}>(optional)</span></label>
                <PackageLinesSelector
                  lines={formPackageLines}
                  onChange={setFormPackageLines}
                  packages={packages}
                />
              </div>
              {/* Deposit fields for Reserved sales */}
              {formData.sale_type === 'reserved' && (
                <>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={formData.deposit_received}
                        onChange={(e) => setFormData({ ...formData, deposit_received: e.target.checked })}
                      />
                      {' '}Customer deposited money
                    </label>
                  </div>
                  {formData.deposit_received && (
                    <>
                      <div className="form-group">
                        <label>Deposit Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.deposit_amount}
                          onChange={(e) => setFormData({ ...formData, deposit_amount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Deposit Currency</label>
                        <select
                          value={formData.deposit_currency}
                          onChange={(e) => setFormData({ ...formData, deposit_currency: e.target.value })}
                          required
                        >
                          <option value="USD">USD</option>
                          <option value="UZS">UZS</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Deposit Payment Type</label>
                        <select
                          value={formData.deposit_payment_type}
                          onChange={(e) => setFormData({ ...formData, deposit_payment_type: e.target.value })}
                          required
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="form-group">
                <label>Customer</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <select
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    style={{ flex: 1, borderColor: !formData.customer ? '#f44336' : undefined }}
                    required
                  >
                    <option value="">— Select a customer (required) —</option>
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
                    style={{ whiteSpace: 'nowrap', padding: '10px 14px', fontSize: '14px', borderRadius: '5px' }}
                  >
                    + New
                  </button>
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Sale
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowForm(false);
                  setFormCategory('');
                  setFormData({
                    product: '',
                    quantity: '',
                    selling_price: '',
                    sale_currency: 'USD',
                    sale_type: 'bought_from_shop',
                    package_type: '',
                    package_quantity: '',
                    customer: '',
                    status: 'pending',
                    deposit_received: false,
                    deposit_amount: '',
                    deposit_currency: 'USD',
                    deposit_payment_type: 'cash',
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showBatchForm && (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>Multi-item sale (one customer)</h2>
          <p style={{ color: '#555', fontSize: '0.9em', marginTop: 0, marginBottom: 16 }}>
            Add one line per product. The customer and the sale type and currency below apply to every line. Each line becomes a separate sale (status: pending — update in the list as usual).
          </p>
          <form onSubmit={handleBatchSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Filter by category (product list)</label>
                <select
                  value={batchFormCategory}
                  onChange={(e) => setBatchFormCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {[...new Set(products.map((p) => p.category).filter(Boolean))].sort().map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Customer *</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <select
                    value={batchCustomer}
                    onChange={(e) => setBatchCustomer(e.target.value)}
                    style={{ flex: 1, borderColor: !batchCustomer ? '#f44336' : undefined }}
                    required
                  >
                    <option value="">— Select customer (required) —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.telephone ? `(${c.telephone})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-edit"
                    onClick={() => setShowCustomerForm(true)}
                    style={{ whiteSpace: 'nowrap', padding: '10px 14px', fontSize: '14px', borderRadius: '5px' }}
                  >
                    + New
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Sale type (all lines)</label>
                <select
                  value={batchDefaults.sale_type}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, sale_type: e.target.value })}
                >
                  <option value="bought_from_shop">Bought from shop</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
              <div className="form-group">
                <label>Currency (all lines)</label>
                <select
                  value={batchDefaults.sale_currency}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, sale_currency: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
            </div>
            <div className="batch-sale-lines-block">
              <div className="batch-sale-lines-block__label" id="batch-line-items-label">
                Line items
              </div>
              <div className="batch-sale-lines-wrap batch-sale-lines-wrap--scroll">
                <table
                  className="batch-sale-lines"
                  role="table"
                  aria-labelledby="batch-line-items-label"
                >
                  <colgroup>
                    <col className="batch-col-product" />
                    <col className="batch-col-stock" />
                    <col className="batch-col-qty" />
                    <col className="batch-col-price" />
                    <col className="batch-col-package" />
                    <col className="batch-col-row" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="batch-sale-lines__th--num" title="In inventory">
                        Stock
                      </th>
                      <th className="batch-sale-lines__th--num">Qty</th>
                      <th className="batch-sale-lines__th--num">Selling price</th>
                      <th>Packages</th>
                      <th className="batch-sale-lines__th--action" aria-label="Remove line" />
                    </tr>
                  </thead>
                  <tbody>
                    {batchLines.map((line) => {
                      const pid = line.product ? parseInt(line.product, 10) : null;
                      const stock = pid
                        ? inventory
                            .filter((x) => x.product === pid && x.status === 'in_inventory')
                            .reduce((s, it) => s + (it.quantity || 0), 0)
                        : null;
                      return (
                        <tr key={line.key}>
                          <td>
                            <select
                              className="batch-sale-lines__control"
                              value={line.product}
                              onChange={(e) => updateBatchLine(line.key, 'product', e.target.value)}
                              aria-label="Product"
                            >
                              <option value="">— Product —</option>
                              {products
                                .filter((p) => !batchFormCategory || p.category === batchFormCategory)
                                .sort((a, b) => b.id - a.id)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {productSalePickerLabel(p)}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="batch-sale-lines__td--num">
                            {pid ? stock : <span className="batch-sale-lines__empty" aria-hidden>—</span>}
                          </td>
                          <td className="batch-sale-lines__td--num">
                            <input
                              className="batch-sale-lines__control"
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => updateBatchLine(line.key, 'quantity', e.target.value)}
                              title="Quantity"
                              aria-label="Quantity"
                            />
                          </td>
                          <td className="batch-sale-lines__td--num">
                            <input
                              className="batch-sale-lines__control"
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.selling_price}
                              onChange={(e) => updateBatchLine(line.key, 'selling_price', e.target.value)}
                              title="Selling price"
                              placeholder="0.00"
                              aria-label="Selling price"
                            />
                          </td>
                          <td style={{ minWidth: '260px', verticalAlign: 'top', paddingTop: '6px' }}>
                            <PackageLinesSelector
                              lines={line.packageLines || EMPTY_PKG_LINES()}
                              onChange={(newLines) => updateBatchLine(line.key, 'packageLines', newLines)}
                              packages={packages}
                            />
                          </td>
                          <td className="batch-sale-lines__td--action">
                            {batchLines.length > 1 ? (
                              <button
                                type="button"
                                className="batch-sale-lines__remove"
                                onClick={() => removeBatchLine(line.key)}
                                title="Remove line"
                                aria-label="Remove line"
                              >
                                ×
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="form-actions batch-sale-lines-actions">
              <button type="button" className="btn-edit" onClick={addBatchLine}>
                + Add line
              </button>
              <button type="submit" className="btn-primary">
                Create {batchLines.filter((l) => l.product).length} sale(s)
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
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes *</label>
                <textarea
                  value={newCustomerData.notes}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, notes: e.target.value })}
                  rows="3"
                  required
                />
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
                  setNewCustomerData({ name: '', telephone: '', instagram: '', notes: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showForm && !showBatchForm && !showCustomerForm && !showDispatchForm && !completePaySale && !showCompleteFromOrderForm && !showSellReservedForm && (
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
              {[...new Set(sales.map(s => s.product_detail?.category).filter(Boolean))].sort().map(cat => (
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
              {getUniqueValues(sales, 'brand').map((brand) => (
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
              {getUniqueValues(sales, 'model').map((model) => (
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
              {getUniqueValues(sales, 'size').map((size) => (
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
              {getUniqueValues(sales, 'color').map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="reserved">Reserved</option>
              <option value="confirmed">Confirmed</option>
              <option value="dispatched">Dispatched</option>
              <option value="completed">Completed</option>
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
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', status: '', year: '', month: '' })}
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
              <th>Product</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Sale Type</th>
              <th>Package</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
              <th>Discount / credit</th>
              <th>UZS Cash</th>
              <th>UZS Card</th>
              <th>USD Cash</th>
              <th>USD Card</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Salesman</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan="23" style={{ textAlign: 'center' }}>
                  No sales found
                </td>
              </tr>
            ) : (
              filteredSales.map((sale) => (
                <tr
                  key={sale.id}
                  style={{
                    backgroundColor:
                      sale.balance_shortfall_type === 'on_credit'
                        ? '#ffebee'
                        : sale.balance_shortfall_type === 'discount'
                          ? '#fff3e0'
                          : undefined,
                  }}
                >
                  <td>#{sale.id}</td>
                  <td>
                    {sale.status === 'pending' && sale.sale_type === 'delivery' && (
                      <button
                        className="btn-status"
                        onClick={() => handleStatusUpdate(sale.id, 'dispatched')}
                      >
                        Dispatch
                      </button>
                    )}
                    {(sale.status === 'pending' || sale.status === 'confirmed') && sale.sale_type === 'bought_from_shop' && (
                      <button
                        className="btn-status"
                        onClick={() => handleStatusUpdate(sale.id, 'completed')}
                      >
                        Complete & Pay
                      </button>
                    )}
                    {sale.status === 'dispatched' && (
                      <button
                        className="btn-status"
                        onClick={() => handleStatusUpdate(sale.id, 'completed')}
                      >
                        Complete & Pay
                      </button>
                    )}
                    {sale.status === 'pending' && sale.sale_type === 'from_order' && (
                      <button
                        className="btn-status"
                        onClick={() => handleCompleteFromOrder(sale.id)}
                        style={{ backgroundColor: '#4caf50', color: 'white' }}
                      >
                        Complete Sale
                      </button>
                    )}
                    {sale.status === 'reserved' && sale.sale_type === 'reserved' && (
                      <>
                        <button
                          className="btn-status"
                          onClick={() => handleSellReserved(sale.id)}
                          style={{ backgroundColor: '#4caf50', color: 'white', marginBottom: '5px' }}
                        >
                          Sell
                        </button>
                        <button
                          className="btn-edit"
                          onClick={() => handleCancelReserved(sale.id)}
                          style={{ backgroundColor: '#f44336', color: 'white' }}
                        >
                          Cancel
                        </button>
                        {sale.deposit_received && (
                          <span style={{ fontSize: '0.85em', color: '#666', display: 'block', marginTop: '5px' }}>
                            Deposit:{' '}
                            {formatDisplayAmount(sale.deposit_amount, sale.deposit_currency || 'USD')}
                          </span>
                        )}
                      </>
                    )}
                    {sale.status === 'completed' && sale.payment_currency && sale.payment_type && (
                      <span style={{ fontSize: '0.9em', color: '#666', display: 'block', marginTop: '5px' }}>
                        Paid: {sale.payment_currency} {sale.payment_type === 'cash' ? 'Cash' : 'Card'}
                      </span>
                    )}
                  </td>
                  <td>{sale.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{sale.product_detail?.name || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>
                    {sale.product_detail
                      ? `${sale.product_detail.brand} ${sale.product_detail.model}`
                      : `Product #${sale.product}`}
                  </td>
                  <td>{sale.product_detail?.brand || '-'}</td>
                  <td>{sale.product_detail?.model || '-'}</td>
                  <td><strong>{sale.product_detail?.size || '-'}</strong></td>
                  <td><strong>{sale.product_detail?.color || '-'}</strong></td>
                  <td>{sale.sale_type === 'bought_from_shop' ? 'Shop' : sale.sale_type === 'from_order' ? 'From Order' : sale.sale_type === 'reserved' ? 'Reserved' : 'Delivery'}</td>
                  <td>
                    {sale.package_lines && sale.package_lines.length > 0 ? (
                      <span style={{ fontSize: '0.85em' }}>
                        {sale.package_lines.map((pl, i) => {
                          const pkg = packages.find(p => p.package_type === pl.package_type);
                          const costUsd = pkg ? Number(pkg.cost_per_unit_usd) * pl.quantity : 0;
                          const costUzs = pkg ? Number(pkg.cost_per_unit_uzs) * pl.quantity : 0;
                          return (
                            <span key={pl.id ?? i} style={{ display: 'block', whiteSpace: 'nowrap' }}>
                              {pl.package_type} ×{pl.quantity}
                              {costUsd > 0 ? ` $${costUsd.toFixed(2)}` : ''}
                              {costUzs > 0 ? ` ${costUzs.toLocaleString()} UZS` : ''}
                            </span>
                          );
                        })}
                      </span>
                    ) : sale.package_type ? (
                      <span>
                        {sale.package_type} ×{sale.package_quantity != null ? sale.package_quantity : sale.quantity}
                        {sale.package_cost_per_unit_usd > 0 ? ` $${Number(sale.package_cost_per_unit_usd).toFixed(2)}` : ''}
                        {sale.package_cost_per_unit_uzs > 0 ? ` ${Number(sale.package_cost_per_unit_uzs).toLocaleString()} UZS` : ''}
                      </span>
                    ) : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>{sale.quantity}</td>
                  <td>{formatDisplayAmount(sale.selling_price, sale.sale_currency || 'USD')}</td>
                  <td>{formatDisplayAmount(sale.total_amount, sale.sale_currency || 'USD')}</td>
                  <td style={{ fontSize: '0.9em' }}>
                    {sale.balance_shortfall_type === 'discount' && sale.balance_shortfall_amount
                      ? `Discount: ${formatDisplayAmount(sale.balance_shortfall_amount, sale.balance_shortfall_currency || 'USD')}`
                      : sale.balance_shortfall_type === 'on_credit' && sale.balance_shortfall_amount
                        ? `On credit: ${formatDisplayAmount(sale.balance_shortfall_amount, sale.balance_shortfall_currency || 'USD')}`
                        : '—'}
                  </td>
                  <td>
                    {parseFloat(sale.payment_uzs_cash) > 0
                      ? <span style={{ color: sale.status === 'completed' ? '#4caf50' : 'inherit' }}>{parseFloat(sale.payment_uzs_cash).toLocaleString()} UZS</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(sale.payment_uzs_card) > 0
                      ? <span style={{ color: sale.status === 'completed' ? '#4caf50' : 'inherit' }}>{parseFloat(sale.payment_uzs_card).toLocaleString()} UZS</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(sale.payment_usd_cash) > 0
                      ? <span style={{ color: sale.status === 'completed' ? '#4caf50' : 'inherit' }}>${parseFloat(sale.payment_usd_cash).toFixed(2)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>
                    {parseFloat(sale.payment_usd_card) > 0
                      ? <span style={{ color: sale.status === 'completed' ? '#4caf50' : 'inherit' }}>${parseFloat(sale.payment_usd_card).toFixed(2)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  <td>{sale.customer_detail?.name || '-'}</td>
                  <td>{sale.customer_detail?.telephone || <span style={{ color: '#bbb' }}>—</span>}</td>
                  <td>{sale.salesman_detail?.username || '-'}</td>
                  <td>
                    <span className={`status-badge ${sale.status}`}>
                      {sale.status}
                    </span>
                  </td>
                  <td>{new Date(sale.sale_date).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="11" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td style={{ fontWeight: 600 }}>{salesColumnTotals.quantity.toLocaleString()}</td>
              <td>—</td>
              <td style={{ fontWeight: 600 }}>
                {!filteredSales.length
                  ? '—'
                  : salesColumnTotals.totalAmountCurrency
                    ? formatDisplayAmount(
                        salesColumnTotals.totalAmount,
                        salesColumnTotals.totalAmountCurrency,
                      )
                    : formatPlainAmount(salesColumnTotals.totalAmount)}
              </td>
              <td>—</td>
              <td>
                {salesColumnTotals.uzsCash > 0
                  ? `${salesColumnTotals.uzsCash.toLocaleString()} UZS`
                  : '—'}
              </td>
              <td>
                {salesColumnTotals.uzsCard > 0
                  ? `${salesColumnTotals.uzsCard.toLocaleString()} UZS`
                  : '—'}
              </td>
              <td>
                {salesColumnTotals.usdCash > 0 ? `$${salesColumnTotals.usdCash.toFixed(2)}` : '—'}
              </td>
              <td>
                {salesColumnTotals.usdCard > 0 ? `$${salesColumnTotals.usdCard.toFixed(2)}` : '—'}
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

export default Sales;

