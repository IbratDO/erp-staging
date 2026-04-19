import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import './TablePage.css';

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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
    package_type: '',
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
    try {
      const response = await api.post('/customers/', newCustomerData);
      await fetchCustomers();
      setFormData({ ...formData, customer: response.data.id });
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
      // Check inventory availability for the selected product
      const selectedProduct = products.find(p => p.id === parseInt(formData.product));
      if (selectedProduct) {
        // Find inventory items for this product with status 'in_inventory'
        const inventoryItems = inventory.filter(
          item => item.product === parseInt(formData.product) && item.status === 'in_inventory'
        );
        const totalAvailable = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        
        if (totalAvailable < parseInt(formData.quantity)) {
          showNotification(`Insufficient inventory! Available: ${totalAvailable}, Requested: ${formData.quantity}. This product is sold out or has insufficient stock.`, 'error');
          return;
        }
      }
      
      // Check package stock if package_type is selected
      if (formData.package_type) {
        const selectedPackage = packages.find(p => p.package_type === formData.package_type);
        if (!selectedPackage) {
          showNotification(`Package type "${formData.package_type}" does not exist. Please add it to inventory first.`, 'error');
          return;
        }
        const packagesNeeded = parseInt(formData.quantity) || 1;
        if (selectedPackage.quantity < packagesNeeded) {
          showNotification(`Insufficient package stock! Available: ${selectedPackage.quantity}, Required: ${packagesNeeded} for ${formData.quantity} item(s).`, 'error');
          return;
        }
      }
      
      await api.post('/sales/', formData);
      setShowForm(false);
      setFormCategory('');
      setFormData({
        product: '',
        quantity: '',
        selling_price: '',
        sale_currency: 'USD',
        sale_type: 'bought_from_shop',
        package_type: '',
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

  const [dispatchFormData, setDispatchFormData] = useState({
    saleId: null,
    delivery_cost: '',
    tracking_number: '',
    dispatch_type: 'dostavshik',
    is_paid: false,
    currency: 'UZS',
    payment_type: 'cash',
  });
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  
  const [showSellReservedForm, setShowSellReservedForm] = useState(false);
  const [sellReservedData, setSellReservedData] = useState({
    saleId: null,
    uzs_cash: '',
    uzs_card: '',
    usd_cash: '',
    usd_card: '',
  });
  
  const [paymentFormData, setPaymentFormData] = useState({
    saleId: null,
    uzs_cash: '',
    uzs_card: '',
    usd_cash: '',
    usd_card: '',
    // Prepayment fields for sales from orders
    prepayment_amount: '',
    total_sale_amount: '',
    // Dispatch payment fields
    dispatch_payment_needed: false,
    dispatch_payment_amount: '',
    dispatch_payment_currency: 'UZS',
    dispatch_payment_type: 'cash',
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  const [showCompleteFromOrderForm, setShowCompleteFromOrderForm] = useState(false);
  const [completeFromOrderData, setCompleteFromOrderData] = useState({
    saleId: null,
    customer: '',
    selling_price: '',
    sale_type: 'bought_from_shop',
    package_type: '',
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
          is_paid: false,
          currency: 'UZS',
          payment_type: 'cash',
        });
        setShowDispatchForm(true);
      } else if (newStatus === 'completed') {
        // Show payment form - auto-fill from sale data (no API call here)
        const sale = sales.find(s => s.id === saleId);
        if (!sale) {
          console.warn('Sale not found when trying to complete:', saleId);
          return;
        }

        const sellingPrice = parseFloat(sale.selling_price || 0);
        const quantity = parseFloat(sale.quantity || 0);
        const totalAmount = !isNaN(sellingPrice * quantity) ? sellingPrice * quantity : 0;
        const advancePayment = parseFloat(sale.advance_payment_received || 0);
        const nowBeingPaid = totalAmount - advancePayment;
        
        // Check if sale has dispatch that is not paid (using dispatch_info from API)
        const dispatch = sale.dispatch_info;
        const dispatchPaymentNeeded =
          dispatch &&
          !dispatch.is_paid &&
          ((dispatch.delivery_cost_uzs && parseFloat(dispatch.delivery_cost_uzs) > 0) ||
            (dispatch.delivery_cost && parseFloat(dispatch.delivery_cost) > 0));
        
        // Check if sale is from order (has advance payment)
        const isFromOrder = !!(sale.order || advancePayment > 0 || sale.sale_type === 'from_order');
        
        setPaymentFormData({
          saleId: saleId,
          uzs_cash: '',
          uzs_card: '',
          usd_cash: isFromOrder
            ? (nowBeingPaid > 0 ? nowBeingPaid.toFixed(2) : '0')
            : totalAmount.toFixed(2),
          usd_card: '',
          prepayment_amount: isFromOrder && advancePayment > 0 ? advancePayment.toFixed(2) : '',
          total_sale_amount: isFromOrder && advancePayment > 0 ? totalAmount.toFixed(2) : '',
          // Dispatch payment fields - auto-fill from dispatch if not paid
          dispatch_payment_needed: !!dispatchPaymentNeeded,
          dispatch_payment_amount: dispatchPaymentNeeded
            ? dispatch.delivery_cost_uzs || dispatch.delivery_cost || ''
            : '',
          dispatch_payment_currency: dispatchPaymentNeeded
            ? (dispatch.delivery_cost_uzs ? 'UZS' : 'USD')
            : 'UZS',
          dispatch_payment_type: dispatchPaymentNeeded
            ? (dispatch.delivery_payment_cash && parseFloat(dispatch.delivery_payment_cash) > 0 ? 'cash' : 'card')
            : 'cash',
        });
        setShowPaymentForm(true);
      } else {
        await api.post(`/sales/${saleId}/update_status/`, { status: newStatus });
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

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const requestData = {
        status: 'completed',
        uzs_cash: parseFloat(paymentFormData.uzs_cash) || 0,
        uzs_card: parseFloat(paymentFormData.uzs_card) || 0,
        usd_cash: parseFloat(paymentFormData.usd_cash) || 0,
        usd_card: parseFloat(paymentFormData.usd_card) || 0,
      };
      
      // Add dispatch payment info if needed
      if (paymentFormData.dispatch_payment_needed && paymentFormData.dispatch_payment_amount) {
        requestData.dispatch_payment_amount = paymentFormData.dispatch_payment_amount;
        requestData.dispatch_payment_currency = paymentFormData.dispatch_payment_currency;
        requestData.dispatch_payment_type = paymentFormData.dispatch_payment_type;
      }
      
      await api.post(`/sales/${paymentFormData.saleId}/update_status/`, requestData);
      setShowPaymentForm(false);
      setPaymentFormData({
        saleId: null,
        payment_currency: 'USD',
        payment_amount: '',
        payment_type: 'cash',
        prepayment_amount: '',
        total_sale_amount: '',
        dispatch_payment_needed: false,
        dispatch_payment_amount: '',
        dispatch_payment_currency: 'UZS',
        dispatch_payment_type: 'cash',
      });
      fetchSales();
      showNotification('Sale completed successfully!', 'success');
    } catch (error) {
      console.error('Error completing sale:', error);
      showNotification(error.response?.data?.error || 'Error completing sale', 'error');
    }
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    try {
      // First update sale status to dispatched
      await api.post(`/sales/${dispatchFormData.saleId}/update_status/`, { status: 'dispatched' });
      
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
        };
        
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
        is_paid: false,
        currency: 'UZS',
        payment_type: 'cash',
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
      setCompleteFromOrderData({
        saleId: saleId,
        customer: sale.customer || sale.order_detail?.customer || '',
        selling_price: sale.selling_price || '',
        sale_type: 'bought_from_shop',
        package_type: '',
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
      
      const requestData = {
        customer: completeFromOrderData.customer,
        selling_price: sellingPrice,
        sale_type: completeFromOrderData.sale_type,
        package_type: completeFromOrderData.package_type || null,
        uzs_cash: parseFloat(completeFromOrderData.now_uzs_cash) || 0,
        uzs_card: parseFloat(completeFromOrderData.now_uzs_card) || 0,
        usd_cash: parseFloat(completeFromOrderData.now_usd_cash) || 0,
        usd_card: parseFloat(completeFromOrderData.now_usd_card) || 0,
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
          is_paid: false,
          currency: 'UZS',
          payment_type: 'cash',
        });
        setShowDispatchForm(true);
        setCompleteFromOrderData({
          saleId: null,
          customer: '',
          selling_price: '',
          sale_type: 'bought_from_shop',
          package_type: '',
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
        setCompleteFromOrderData({
          saleId: null,
          customer: '',
          selling_price: '',
          sale_type: 'bought_from_shop',
          package_type: '',
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
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Sale'}
        </button>
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
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, dispatch_type: e.target.value })}
                  required
                >
                  <option value="dostavshik">Dostavshik</option>
                  <option value="bts">BTS</option>
                </select>
              </div>
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
                    currency: 'UZS',
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
                <label>Package Type (Optional)</label>
                <select
                  value={completeFromOrderData.package_type || ''}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, package_type: e.target.value })}
                >
                  <option value="">No Package</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                </select>
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
                  setCompleteFromOrderData({
                    saleId: null,
                    customer: '',
                    selling_price: '',
                    sale_type: 'bought_from_shop',
                    package_type: '',
                    now_paid_amount: '',
                    now_paid_currency: 'USD',
                    now_paid_type: 'cash',
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

      {showPaymentForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>Complete Sale #{paymentFormData.saleId}</h2>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            Fill in any combination of payment methods. Leave a field empty or 0 if not used.
          </p>
          <form onSubmit={handlePaymentSubmit}>
            <div className="form-grid">
              {paymentFormData.prepayment_amount && parseFloat(paymentFormData.prepayment_amount) > 0 && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Prepayment Already Received</label>
                  <input type="number" step="0.01" value={paymentFormData.prepayment_amount} readOnly
                    style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }} />
                  <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>This amount was received when the order was created</small>
                </div>
              )}
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
              
              {/* Dispatch Payment Fields - shown if dispatch exists and is not paid */}
              {paymentFormData.dispatch_payment_needed && (
                <>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e0e0e0' }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Dispatch Payment</h3>
                    <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '0.9em' }}>
                      This dispatch was not paid at dispatch time. Please enter payment details now.
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Dispatch Payment Amount ({paymentFormData.dispatch_payment_currency})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentFormData.dispatch_payment_amount}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, dispatch_payment_amount: e.target.value })}
                      required={paymentFormData.dispatch_payment_needed}
                    />
                  </div>
                  <div className="form-group">
                    <label>Dispatch Payment Currency</label>
                    <select
                      value={paymentFormData.dispatch_payment_currency || 'UZS'}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, dispatch_payment_currency: e.target.value })}
                      required={paymentFormData.dispatch_payment_needed}
                    >
                      <option value="USD">USD</option>
                      <option value="UZS">UZS</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Dispatch Payment Type</label>
                    <select
                      value={paymentFormData.dispatch_payment_type || 'cash'}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, dispatch_payment_type: e.target.value })}
                      required={paymentFormData.dispatch_payment_needed}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Complete Sale
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowPaymentForm(false);
                  setPaymentFormData({
                    saleId: null,
                    uzs_cash: '', uzs_card: '', usd_cash: '', usd_card: '',
                    prepayment_amount: '', total_sale_amount: '',
                    dispatch_payment_needed: false,
                    dispatch_payment_amount: '',
                    dispatch_payment_currency: 'UZS',
                    dispatch_payment_type: 'cash',
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
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
                <label>Category <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter products)</span></label>
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
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.brand} {product.model} - Size {product.size} ({product.color}) - ${product.selling_price}
                      </option>
                    ))}
                </select>
              </div>
              {formData.product && (() => {
                const cat = products.find(p => p.id === parseInt(formData.product))?.category;
                return cat ? (
                  <div className="form-group">
                    <label>Category</label>
                    <input type="text" value={cat} readOnly style={{ background: '#f5f5f5', color: '#666', cursor: 'default' }} />
                  </div>
                ) : null;
              })()}
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
                <label>Package Type</label>
                <select
                  value={formData.package_type === 'custom' ? 'custom' : (packages.find(p => p.package_type === formData.package_type) ? formData.package_type : (formData.package_type ? 'custom' : ''))}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setFormData({ ...formData, package_type: '' });
                    } else if (e.target.value === '') {
                      setFormData({ ...formData, package_type: '' });
                    } else {
                      setFormData({ ...formData, package_type: e.target.value });
                    }
                  }}
                >
                  <option value="">No Package</option>
                  <option value="custom">+ Add New Package Type</option>
                  {packages.map(pkg => (
                    <option key={pkg.id} value={pkg.package_type}>
                      {pkg.package_type} (Stock: {pkg.quantity})
                    </option>
                  ))}
                </select>
                {formData.package_type && !packages.find(p => p.package_type === formData.package_type) && (
                  <input
                    type="text"
                    placeholder="Enter package type name (e.g., M, L, Small Box, etc.)"
                    value={formData.package_type}
                    onChange={(e) => setFormData({ ...formData, package_type: e.target.value })}
                    style={{ marginTop: '10px' }}
                  />
                )}
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
                    style={{ whiteSpace: 'nowrap' }}
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
                <label>Notes</label>
                <textarea
                  value={newCustomerData.notes}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, notes: e.target.value })}
                  rows="3"
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
      {!showForm && !showCustomerForm && !showDispatchForm && !showPaymentForm && !showCompleteFromOrderForm && !showSellReservedForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h3>Filters</h3>
        <div className="form-grid">
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
            <button
              type="button"
              className="btn-edit"
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', status: '', year: '', month: '' })}
            >
              Clear Filters
            </button>
          </div>
        </div>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
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
              <th>UZS Cash</th>
              <th>UZS Card</th>
              <th>USD Cash</th>
              <th>USD Card</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Salesman</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan="22" style={{ textAlign: 'center' }}>
                  No sales found
                </td>
              </tr>
            ) : (
              filteredSales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.id}</td>
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
                    {sale.package_type ? (
                      <span>
                        {sale.package_type} {sale.package_cost_per_unit ? `($${sale.package_cost_per_unit.toFixed(2)})` : ''}
                      </span>
                    ) : '-'}
                  </td>
                  <td>{sale.quantity}</td>
                  <td>${sale.selling_price}</td>
                  <td>${sale.total_amount}</td>
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
                            Deposit: ${sale.deposit_amount} ({sale.deposit_currency})
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Sales;

