import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import './TablePage.css';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [balances, setBalances] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
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
    supplier_country: 'germany',
    eshop: '',
    ordered_quantity: '',
    cost_per_unit: '',
    cost_total: '',
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
    order_payment_amount: '',
    order_payment_currency: 'USD',
    order_payment_type: 'card',
    is_pay_order: false,
    is_received_and_pay: false,
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  const [cargoFormData, setCargoFormData] = useState({
    orderId: null,
    cargo_amount: '',
    cargo_currency: 'UZS',
    cargo_payment_type: 'cash',
    cargo_is_paid: false,
  });
  const [showCargoForm, setShowCargoForm] = useState(false);
  
  const [showMoveToInventoryForm, setShowMoveToInventoryForm] = useState(false);
  const [isNewEshop, setIsNewEshop] = useState(false);

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
      const response = await api.post('/customers/', newCustomerData);
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
      // Validate cost_total is calculated
      if (!formData.cost_total || parseFloat(formData.cost_total) <= 0) {
        showNotification('Please enter both quantity and cost per unit to calculate total cost', 'error');
        return;
      }

      // If paying immediately, check balance before creating the order
      if (formData.order_is_paid) {
        const required = parseFloat(formData.cost_total);
        const available = getAvailableBalance(formData.order_payment_currency, formData.order_payment_type);
        if (available < required) {
          showNotification(
            `Insufficient balance. Available: ${available.toFixed(2)} ${formData.order_payment_currency} (${formData.order_payment_type}), Required: ${required.toFixed(2)} ${formData.order_payment_currency}. Please top up your balance first or uncheck "Order payment is already made".`,
            'error'
          );
          return;
        }
      }
      
      // Prepare order data for API
      const orderData = {
        ...formData,
      };
      
      await api.post('/orders/', orderData);
      setShowForm(false);
      setIsNewEshop(false);
      setFormData({
        order_type: 'stock',
        product: '',
        supplier_country: 'germany',
        eshop: '',
        ordered_quantity: '',
        cost_per_unit: '',
        cost_total: '',
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
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error creating order', 'error');
    }
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      // Just update status - payment should be done separately
      // Don't send cargo_is_paid to preserve existing payment status
      await api.post(`/orders/${orderId}/update_status/`, { status: newStatus });
      // Refresh orders to get updated data
      await fetchOrders();
      showNotification('Order status updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating status:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error updating status', 'error');
    }
  };

  const handlePayOrder = async (orderId) => {
    // Show form to enter order payment details
    const order = orders.find(o => o.id === orderId);
    setPaymentFormData({
      orderId: orderId,
      order_payment_amount: order?.cost_total || '',
      order_payment_currency: order?.order_payment_currency || 'USD',
      order_payment_type: order?.order_payment_type || 'card',
      is_pay_order: true,
      is_received_and_pay: false,
    });
    setShowPaymentForm(true);
    setTimeout(() => paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handlePayCargo = async (orderId) => {
    // Show form to enter cargo payment details
    const order = orders.find(o => o.id === orderId);
    setCargoFormData({
      orderId: orderId,
      cargo_amount: order?.cargo_cost_uzs || order?.cargo_cost_usd || '',
      cargo_currency: order?.cargo_payment_currency || 'UZS',
      cargo_payment_type: 'cash',
      cargo_is_paid: true,
    });
    setShowCargoForm(true);
    setTimeout(() => cargoFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      // Check if this is for paying order separately
      if (paymentFormData.is_pay_order) {
        // Check balance before submitting
        const required = parseFloat(paymentFormData.order_payment_amount);
        const available = getAvailableBalance(paymentFormData.order_payment_currency, paymentFormData.order_payment_type);
        if (available < required) {
          showNotification(
            `Insufficient balance. Available: ${available.toFixed(2)} ${paymentFormData.order_payment_currency} (${paymentFormData.order_payment_type}), Required: ${required.toFixed(2)} ${paymentFormData.order_payment_currency}. Please top up your balance first.`,
            'error'
          );
          return;
        }
        // Pay for order separately
        await api.post(`/orders/${paymentFormData.orderId}/pay_order/`, {
          order_payment_amount: paymentFormData.order_payment_amount,
          order_payment_currency: paymentFormData.order_payment_currency,
          order_payment_type: paymentFormData.order_payment_type,
        });
        setShowPaymentForm(false);
        setPaymentFormData({
          orderId: null,
          order_payment_amount: '',
          order_payment_currency: 'USD',
          order_payment_type: 'card',
          is_pay_order: false,
          is_received_and_pay: false,
        });
        fetchOrders();
        return;
      }
      
      // Otherwise, handle status update with payment (for "Move to Inventory & Pay")
      const order = orders.find(o => o.id === paymentFormData.orderId);
      const targetStatus = paymentFormData.is_received_and_pay ? 'received' : 'in_inventory';
      
      // Check if order is already paid - if so, don't send payment info again
      const isAlreadyPaid = order?.order_is_paid;

      // Check balance before submitting (only if not already paid)
      if (!isAlreadyPaid) {
        const required = parseFloat(order?.cost_total || 0);
        const available = getAvailableBalance(paymentFormData.order_payment_currency, paymentFormData.order_payment_type);
        if (available < required) {
          showNotification(
            `Insufficient balance. Available: ${available.toFixed(2)} ${paymentFormData.order_payment_currency} (${paymentFormData.order_payment_type}), Required: ${required.toFixed(2)} ${paymentFormData.order_payment_currency}. Please top up your balance first.`,
            'error'
          );
          return;
        }
      }
      
      // Build update payload
      const updatePayload = {
        status: targetStatus,
      };
      
      // Only send payment info if order is not already paid
      if (!isAlreadyPaid) {
        updatePayload.order_payment_amount = paymentFormData.order_payment_amount;
        updatePayload.order_payment_currency = paymentFormData.order_payment_currency;
        updatePayload.order_payment_type = paymentFormData.order_payment_type;
        updatePayload.order_is_paid = true;
      }
      
      // Update order status
      await api.post(`/orders/${paymentFormData.orderId}/update_status/`, updatePayload);
      
      // Refresh orders to get updated status
      await fetchOrders();
      
      setShowPaymentForm(false);
      setPaymentFormData({
        orderId: null,
        order_payment_amount: '',
        order_payment_currency: 'USD',
        order_payment_type: 'card',
        is_pay_order: false,
        is_received_and_pay: false,
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
      if (!cargoFormData.cargo_amount) {
        showNotification('Please enter cargo amount', 'error');
        return;
      }

      // Check balance before submitting
      const required = parseFloat(cargoFormData.cargo_amount);
      const available = getAvailableBalance(cargoFormData.cargo_currency, cargoFormData.cargo_payment_type);
      if (available < required) {
        showNotification(
          `Insufficient balance. Available: ${available.toFixed(2)} ${cargoFormData.cargo_currency} (${cargoFormData.cargo_payment_type}), Required: ${required.toFixed(2)} ${cargoFormData.cargo_currency}. Please top up your balance first.`,
          'error'
        );
        return;
      }
      
      await api.post(`/orders/${cargoFormData.orderId}/pay_cargo/`, {
        cargo_amount: cargoFormData.cargo_amount,
        cargo_currency: cargoFormData.cargo_currency,
        cargo_payment_type: cargoFormData.cargo_payment_type,
      });
      setShowCargoForm(false);
      setCargoFormData({
        orderId: null,
        cargo_amount: '',
        cargo_currency: 'UZS',
        cargo_payment_type: 'cash',
        cargo_is_paid: false,
      });
      // Refresh orders to get updated payment status
      await fetchOrders();
      showNotification('Cargo payment processed successfully!', 'success');
    } catch (error) {
      console.error('Error paying cargo:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error paying cargo', 'error');
    }
  };

  const handleSellProduct = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    
    // Check if cargo payment has not been made
    if (!order?.cargo_is_paid) {
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
    
    // Check if cargo payment has not been made
    if (!order?.cargo_is_paid) {
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
          <p>Please enter payment details for this order:</p>
          <form onSubmit={handlePaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Payment Amount ({paymentFormData.order_payment_currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentFormData.order_payment_amount}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, order_payment_amount: e.target.value })}
                  required
                />
                <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                  Auto-filled from order total (adjustable)
                </small>
              </div>
              <div className="form-group">
                <label>Payment Currency</label>
                <select
                  value={paymentFormData.order_payment_currency}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, order_payment_currency: e.target.value })}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Payment Type</label>
                <select
                  value={paymentFormData.order_payment_type}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, order_payment_type: e.target.value })}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {paymentFormData.is_pay_order ? 'Pay for the Order' : paymentFormData.is_received_and_pay ? 'Mark as Received and Pay' : 'Confirm & Move to Inventory'}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowPaymentForm(false);
                  setPaymentFormData({
                    orderId: null,
                    order_payment_amount: '',
                    order_payment_currency: 'USD',
                    order_payment_type: 'card',
                    is_pay_order: false,
                    is_received_and_pay: false,
                  });
                }}
              >
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
          <form onSubmit={handleCargoPaymentSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Cargo Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cargoFormData.cargo_amount}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, cargo_amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Cargo Currency</label>
                <select
                  value={cargoFormData.cargo_currency}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, cargo_currency: e.target.value })}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Payment Type</label>
                <select
                  value={cargoFormData.cargo_payment_type}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, cargo_payment_type: e.target.value })}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
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
                  setCargoFormData({
                    orderId: null,
                    cargo_amount: '',
                    cargo_currency: 'UZS',
                    cargo_payment_type: 'cash',
                    cargo_is_paid: false,
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
                <label>Product</label>
                <select
                  value={formData.product}
                  onChange={(e) => {
                    const selectedProductId = e.target.value;
                    const selectedProduct = products.find(p => p.id === parseInt(selectedProductId));
                    setFormData({
                      ...formData,
                      product: selectedProductId,
                      cost_per_unit: selectedProduct ? selectedProduct.cost_price : '',
                    });
                  }}
                  required
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.brand} {product.model} - Size {product.size} ({product.color}) - ${product.cost_price}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Supplier Country</label>
                <select
                  value={formData.supplier_country}
                  onChange={(e) => setFormData({ ...formData, supplier_country: e.target.value })}
                  required
                >
                  <option value="germany">Germany</option>
                  <option value="japan">Japan</option>
                  <option value="korea">Korea</option>
                </select>
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
                  onChange={(e) => {
                    const quantity = e.target.value;
                    const costPerUnit = parseFloat(formData.cost_per_unit) || 0;
                    const total = quantity && costPerUnit ? (parseFloat(quantity) * costPerUnit).toFixed(2) : '';
                    setFormData({ ...formData, ordered_quantity: quantity, cost_total: total });
                  }}
                  required
                />
              </div>
              <div className="form-group">
                <label>Cost Per Unit (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost_per_unit}
                  onChange={(e) => {
                    const costPerUnit = e.target.value;
                    const quantity = parseFloat(formData.ordered_quantity) || 0;
                    const total = costPerUnit && quantity ? (parseFloat(costPerUnit) * quantity).toFixed(2) : '';
                    setFormData({ ...formData, cost_per_unit: costPerUnit, cost_total: total });
                  }}
                  required
                />
              </div>
              <div className="form-group">
                <label>Cost Total (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost_total}
                  readOnly
                  style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                />
                <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
                  Auto-calculated from quantity × cost per unit
                </small>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.order_is_paid}
                    onChange={(e) => setFormData({ ...formData, order_is_paid: e.target.checked })}
                  />
                  {' '}Order payment is already made
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
                      <option value="UZS">UZS</option>
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
                  setFormData({
                    order_type: 'stock',
                    product: '',
                    supplier_country: 'germany',
                    eshop: '',
                    ordered_quantity: '',
                    cost_per_unit: '',
                    cost_total: '',
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
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h3>Filters</h3>
        <div className="form-grid">
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
          <div className="form-group">
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
              onClick={() => setFilters({ brand: '', model: '', size: '', color: '', order_type: '', status: '', year: '', month: '' })}
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
              <th>Product</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Order Type</th>
              <th>Customer</th>
              <th>Quantity</th>
              <th>Cost Per Unit</th>
              <th>Total Cost</th>
              <th>Order Payment</th>
              <th>Cargo Cost</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="17" style={{ textAlign: 'center' }}>
                  No orders found
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>
                    {order.product_detail
                      ? `${order.product_detail.brand} ${order.product_detail.model}`
                      : `Product #${order.product}`}
                  </td>
                  <td>{order.product_detail?.brand || '-'}</td>
                  <td>{order.product_detail?.model || '-'}</td>
                  <td><strong>{order.product_detail?.size || '-'}</strong></td>
                  <td><strong>{order.product_detail?.color || '-'}</strong></td>
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
                              Advance: ${order.advance_payment_amount}
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
                  <td>${order.cost_per_unit}</td>
                  <td>${order.cost_total}</td>
                  <td>
                    {order.order_is_paid ? (
                      <span className={`status-badge ${order.order_payment_type === 'card' ? 'confirmed' : ''}`}>
                        {order.order_payment_currency} {order.order_payment_type === 'cash' ? 'Cash' : 'Card'}
                      </span>
                    ) : (
                      <span style={{ color: '#f44336' }}>Unpaid</span>
                    )}
                  </td>
                  <td>
                    {order.cargo_cost_uzs > 0 ? (
                      <span>{order.cargo_cost_uzs} UZS</span>
                    ) : order.cargo_cost_usd > 0 ? (
                      <span>{order.cargo_cost_usd} USD</span>
                    ) : (
                      '-'
                    )}
                    {order.cargo_cost_uzs > 0 || order.cargo_cost_usd > 0 ? (
                      <span style={{ display: 'block', fontSize: '0.85em', color: order.cargo_is_paid ? '#4caf50' : '#f44336' }}>
                        {order.cargo_is_paid ? 'Paid' : 'Unpaid'}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`status-badge ${order.status}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{order.created_by_detail?.username || '-'}</td>
                  <td>{new Date(order.order_date || order.created_at).toLocaleString()}</td>
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
                          if (!order.cargo_is_paid) {
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Orders;
