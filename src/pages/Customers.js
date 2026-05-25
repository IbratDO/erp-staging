import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { formatDisplayAmount, formatAmountByBalanceType, formatPlainAmount } from '../utils/currencyFormat';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import { usePermissions } from '../hooks/usePermissions';

const CUSTOMER_SORT_ACCESSORS = {
  name: (c) => String(c.name ?? '').toLowerCase(),
  telephone: (c) => String(c.telephone ?? '').toLowerCase(),
  instagram: (c) => String(c.instagram ?? '').toLowerCase(),
  region: (c) => String(c.region ?? '').toLowerCase(),
  total_sales: (c) => parseInt(c.sales_count, 10) || 0,
  on_credit: (c) => parseFloat(c.on_credit_outstanding) || 0,
};

const RECEIVABLE_SORT_ACCESSORS = {
  sale_id: (r) => Number(r.sale_id) || 0,
  product_label: (r) => String(r.product_label ?? '').toLowerCase(),
  amount: (r) => parseFloat(r.amount) || 0,
};

const HISTORY_ORDER_SORT_ACCESSORS = {
  created_at: (o) => new Date(o.created_at).getTime() || 0,
  product: (o) =>
    o.product_detail
      ? `${o.product_detail.brand ?? ''} ${o.product_detail.model ?? ''} size ${o.product_detail.size ?? ''} ${o.product_detail.color ?? ''}`
          .trim()
          .toLowerCase()
      : String(o.product ?? '').toLowerCase(),
  ordered_quantity: (o) => parseInt(o.ordered_quantity, 10) || 0,
  order_type: (o) => String(o.order_type ?? '').toLowerCase(),
  status: (o) => String(o.status ?? '').toLowerCase(),
  advance_payment_amount: (o) => parseFloat(o.advance_payment_amount) || 0,
};

const HISTORY_SALE_SORT_ACCESSORS = {
  sale_date: (s) => new Date(s.sale_date).getTime() || 0,
  product: (s) =>
    s.product_detail
      ? `${s.product_detail.brand ?? ''} ${s.product_detail.model ?? ''} size ${s.product_detail.size ?? ''} ${s.product_detail.color ?? ''}`
          .trim()
          .toLowerCase()
      : String(s.product ?? '').toLowerCase(),
  quantity: (s) => parseInt(s.quantity, 10) || 0,
  selling_price: (s) => parseFloat(s.selling_price) || 0,
  total_amount: (s) => parseFloat(s.total_amount) || 0,
  sale_type: (s) => String(s.sale_type ?? '').toLowerCase(),
  status: (s) => String(s.status ?? '').toLowerCase(),
};

const BALANCE_TX_SORT_ACCESSORS = {
  timestamp: (t) => new Date(t.timestamp).getTime() || 0,
  transaction_type_key: (t) => String(t.transaction_type ?? '').toLowerCase(),
  amount: (t) => parseFloat(t.amount) || 0,
  currency: (t) => {
    const bt = (t.balance_detail?.balance_type || '').toLowerCase();
    if (bt.startsWith('uzs')) return 'uzs';
    if (bt.startsWith('usd')) return 'usd';
    return '';
  },
  notes: (t) => String(t.notes ?? '').toLowerCase(),
};

const Customers = () => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('customers.create');
  const canUpdate = hasPermission('customers.update');
  const canDelete = hasPermission('customers.delete');
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [filters, setFilters] = useState({
    name: '',
  });
  const [formData, setFormData] = useState({
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

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers/');
      const customersList = response.data.results || response.data;
      setCustomers(customersList);
      applyFilters(customersList);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (customersList) => {
    let filtered = customersList;
    
    if (filters.name && filters.name.trim()) {
      filtered = filtered.filter(customer => 
        customer.name?.toLowerCase().includes(filters.name.toLowerCase())
      );
    }
    
    setFilteredCustomers(filtered);
  };

  useEffect(() => {
    if (customers.length > 0) {
      applyFilters(customers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const customerListSort = useClientTableSort(CUSTOMER_SORT_ACCESSORS);

  const sortedFilteredCustomers = useMemo(() => {
    const rows = filteredCustomers;
    if (!rows?.length) return rows;
    if (customerListSort.sortCol && CUSTOMER_SORT_ACCESSORS[customerListSort.sortCol]) {
      return customerListSort.sortRows(rows);
    }
    return rows;
  }, [filteredCustomers, customerListSort]);

  const receivableSort = useClientTableSort(RECEIVABLE_SORT_ACCESSORS);
  const sortedReceivables = useMemo(() => {
    const rows = customerHistory?.pending_receivables;
    if (!rows?.length) return rows || [];
    if (receivableSort.sortCol && RECEIVABLE_SORT_ACCESSORS[receivableSort.sortCol]) {
      return receivableSort.sortRows(rows);
    }
    return rows;
  }, [customerHistory, receivableSort]);

  const historyOrdersSort = useClientTableSort(HISTORY_ORDER_SORT_ACCESSORS);
  const sortedHistoryOrders = useMemo(() => {
    const rows = customerHistory?.orders;
    if (!rows?.length) return rows || [];
    if (historyOrdersSort.sortCol && HISTORY_ORDER_SORT_ACCESSORS[historyOrdersSort.sortCol]) {
      return historyOrdersSort.sortRows(rows);
    }
    return rows;
  }, [customerHistory, historyOrdersSort]);

  const historyPurchasesSort = useClientTableSort(HISTORY_SALE_SORT_ACCESSORS);
  const sortedHistorySales = useMemo(() => {
    const rows = customerHistory?.sales;
    if (!rows?.length) return rows || [];
    if (historyPurchasesSort.sortCol && HISTORY_SALE_SORT_ACCESSORS[historyPurchasesSort.sortCol]) {
      return historyPurchasesSort.sortRows(rows);
    }
    return rows;
  }, [customerHistory, historyPurchasesSort]);

  const balanceTxSort = useClientTableSort(BALANCE_TX_SORT_ACCESSORS);
  const combinedBalanceTransactions = useMemo(() => {
    if (!customerHistory) return [];
    return [
      ...(customerHistory.order_balance_transactions || []).map((t) => ({ ...t, source: 'order' })),
      ...(customerHistory.balance_transactions || []).map((t) => ({ ...t, source: 'sale' })),
    ].filter((t) => t.operation === 'add');
  }, [customerHistory]);

  const sortedCombinedBalanceTransactions = useMemo(() => {
    const rows = combinedBalanceTransactions;
    if (!rows.length) return rows;
    if (balanceTxSort.sortCol && BALANCE_TX_SORT_ACCESSORS[balanceTxSort.sortCol]) {
      return balanceTxSort.sortRows(rows);
    }
    return [...rows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [combinedBalanceTransactions, balanceTxSort]);

  const customerListTotals = useMemo(() => {
    let totalSalesCount = 0;
    let onCreditSum = 0;
    for (const c of filteredCustomers) {
      totalSalesCount += parseInt(c.sales_count, 10) || 0;
      onCreditSum += parseFloat(c.on_credit_outstanding) || 0;
    }
    return { totalSalesCount, onCreditSum };
  }, [filteredCustomers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.notes || '').trim()) {
      alert('Please enter notes.');
      return;
    }
    try {
      if (formData.id) {
        await api.put(`/customers/${formData.id}/`, formData);
      } else {
        await api.post('/customers/', formData);
      }
      setShowForm(false);
      setFormData({ name: '', telephone: '+998', instagram: '', region: 'tashkent_city', notes: '' });
      fetchCustomers();
    } catch (error) {
      console.error('Error saving customer:', error);
      alert(error.response?.data?.error || error.response?.data?.detail || 'Error saving customer');
    }
  };

  const handleEdit = (customer) => {
        setFormData({
        id: customer.id,
        name: customer.name || '',
        telephone: customer.telephone || '+998',
        instagram: customer.instagram || '',
        region: customer.region || 'tashkent_city',
        notes: customer.notes || '',
      });
    setShowForm(true);
  };

  const handleDelete = async (customerId) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await api.delete(`/customers/${customerId}/`);
        fetchCustomers();
        if (selectedCustomer?.id === customerId) {
          setSelectedCustomer(null);
          setCustomerHistory(null);
        }
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert(error.response?.data?.error || 'Error deleting customer');
      }
    }
  };

  const handleViewHistory = async (customer) => {
    try {
      const response = await api.get(`/customers/${customer.id}/history/`);
      setCustomerHistory(response.data);
      setSelectedCustomer(customer);
    } catch (error) {
      console.error('Error fetching customer history:', error);
      alert('Error fetching customer history');
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Customers</h1>
        {canCreate && (
        <button className="btn-primary" onClick={() => {
          setShowForm(!showForm);
          if (!showForm) {
            setFormData({ name: '', telephone: '+998', instagram: '', region: 'tashkent_city', notes: '' });
          }
        }}>
          {showForm ? 'Cancel' : '+ New Customer'}
        </button>
        )}
      </div>

      {showForm && (canCreate || canUpdate) && (
        <div className="form-card">
          <h2>{formData.id ? 'Edit Customer' : 'New Customer'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Telephone</label>
                <input
                  type="text"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Instagram</label>
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Region</label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
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
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  required
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {formData.id ? 'Update' : 'Create'} Customer
              </button>
                <button
                  type="button"
                  className="btn-edit"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ name: '', telephone: '+998', instagram: '', region: 'tashkent_city', notes: '' });
                  }}
                >
                  Cancel
                </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title">Filters</h3>
        <div className="filter-toolbar">
          <div className="filter-field filter-field--grow">
            <label>Name</label>
            <input
              type="search"
              value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder="Search name"
            />
          </div>
          <div className="filter-toolbar__actions">
            <button
              type="button"
              className="btn-edit"
              onClick={() => setFilters({ name: '' })}
            >
              Clear
            </button>
          </div>
        </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Customers List */}
        <div className="table-card" style={{ flex: selectedCustomer ? '0 0 40%' : '1' }}>
          <div className="data-table-scroll data-table-scroll--pane">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="name" sortCol={customerListSort.sortCol} sortDir={customerListSort.sortDir} onSort={customerListSort.onHeaderClick}>Name</SortableTh>
                <SortableTh columnId="telephone" sortCol={customerListSort.sortCol} sortDir={customerListSort.sortDir} onSort={customerListSort.onHeaderClick}>Telephone</SortableTh>
                <SortableTh columnId="instagram" sortCol={customerListSort.sortCol} sortDir={customerListSort.sortDir} onSort={customerListSort.onHeaderClick}>Instagram</SortableTh>
                <SortableTh columnId="region" sortCol={customerListSort.sortCol} sortDir={customerListSort.sortDir} onSort={customerListSort.onHeaderClick}>Region</SortableTh>
                <SortableTh columnId="total_sales" sortCol={customerListSort.sortCol} sortDir={customerListSort.sortDir} onSort={customerListSort.onHeaderClick}>Total Sales</SortableTh>
                <SortableTh columnId="on_credit" sortCol={customerListSort.sortCol} sortDir={customerListSort.sortDir} onSort={customerListSort.onHeaderClick}>On credit (due)</SortableTh>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                <td colSpan="7" style={{ textAlign: 'center' }}>
                  No customers found
                </td>
                </tr>
              ) : (
                sortedFilteredCustomers.map((customer) => (
                  <tr 
                    key={customer.id}
                    onClick={() => handleViewHistory(customer)}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: selectedCustomer?.id === customer.id ? '#e3f2fd' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCustomer?.id !== customer.id) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCustomer?.id !== customer.id) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <td><strong>{customer.name}</strong></td>
                    <td>{customer.telephone || '-'}</td>
                    <td>{customer.instagram || '-'}</td>
                    <td>{customer.region || '-'}</td>
                    <td>{customer.sales_count || 0} sales</td>
                    <td style={{ fontSize: '0.9em' }}>
                      {parseFloat(customer.on_credit_outstanding || 0) > 0
                        ? customer.on_credit_outstanding
                        : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canUpdate && (
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(customer)}
                        style={{ marginRight: '5px' }}
                      >
                        Edit
                      </button>
                      )}
                      {canDelete && (
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(customer.id)}
                      >
                        Delete
                      </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" style={{ textAlign: 'right' }}>
                  Total
                </td>
                <td style={{ fontWeight: 600 }}>{customerListTotals.totalSalesCount.toLocaleString()} sales</td>
                <td style={{ fontWeight: 600 }}>
                  {customerListTotals.onCreditSum > 0
                    ? customerListTotals.onCreditSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '—'}
                </td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        {/* Customer History */}
        {selectedCustomer && customerHistory && (
          <div className="table-card" style={{ flex: '1' }}>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{selectedCustomer.name} - Purchase History</h2>
              <button
                className="btn-edit"
                onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerHistory(null);
                }}
              >
                Close
              </button>
            </div>
            
            {/* Summary */}
            <div className="form-card" style={{ marginBottom: '20px', backgroundColor: '#f9f9f9' }}>
              <h3>Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                <div>
                  <strong>Total Sales:</strong> {customerHistory.summary.total_sales}
                </div>
                <div>
                  <strong>Completed Sales:</strong> {customerHistory.summary.completed_sales}
                </div>
                <div>
                  <strong>Reserved Sales:</strong> <span style={{ color: '#9b59b6', fontWeight: 'bold' }}>{customerHistory.summary.reserved_sales || 0}</span>
                  {customerHistory.summary.reserved_amount > 0 && (
                    <span
                      style={{ fontSize: '0.9em', color: '#666', marginLeft: '5px' }}
                      title="Sum of sale totals; may mix UZS and USD"
                    >
                      ({formatPlainAmount(customerHistory.summary.reserved_amount)})
                    </span>
                  )}
                </div>
                <div>
                  <strong>Pending Sales:</strong> {customerHistory.summary.pending_sales || 0}
                </div>
                <div>
                  <strong>Cancelled Sales:</strong> {customerHistory.summary.cancelled_sales || 0}
                </div>
                <div>
                  <strong>Total Orders:</strong> {customerHistory.summary.total_orders || 0}
                </div>
                <div title="Open-order advances; may mix UZS and USD">
                  <strong>Total Advance Payments:</strong>{' '}
                  {formatPlainAmount(customerHistory.summary.total_advance_payments || 0)}
                </div>
                <div title="Completed sale totals; may mix UZS and USD">
                  <strong>Total Amount (Completed):</strong>{' '}
                  {formatPlainAmount(customerHistory.summary.total_amount || 0)}
                </div>
                <div title="Includes balance movements; see Money Balance for detail">
                  <strong>Total Paid:</strong> {formatPlainAmount(customerHistory.summary.total_paid || 0)}
                </div>
                <div>
                  <strong>On credit (outstanding):</strong>{' '}
                  {parseFloat(customerHistory.summary.on_credit_outstanding || 0) > 0
                    ? customerHistory.summary.on_credit_outstanding
                    : '0'}
                </div>
              </div>
            </div>

            {customerHistory.pending_receivables && customerHistory.pending_receivables.length > 0 && (
              <>
                <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Open on-credit (receivables)</h3>
                <table className="data-table" style={{ marginBottom: '30px' }}>
                  <thead>
                    <tr>
                      <SortableTh columnId="sale_id" sortCol={receivableSort.sortCol} sortDir={receivableSort.sortDir} onSort={receivableSort.onHeaderClick}>Sale #</SortableTh>
                      <SortableTh columnId="product_label" sortCol={receivableSort.sortCol} sortDir={receivableSort.sortDir} onSort={receivableSort.onHeaderClick}>Product</SortableTh>
                      <SortableTh columnId="amount" sortCol={receivableSort.sortCol} sortDir={receivableSort.sortDir} onSort={receivableSort.onHeaderClick}>Amount</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReceivables.map((row) => (
                      <tr key={row.receivable_id}>
                        <td>#{row.sale_id}</td>
                        <td>{row.product_label || '—'}</td>
                        <td>{formatDisplayAmount(row.amount, row.currency || 'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Orders History */}
            {customerHistory.orders && customerHistory.orders.length > 0 && (
              <>
                <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Orders</h3>
                <table className="data-table" style={{ marginBottom: '30px' }}>
                  <thead>
                    <tr>
                      <SortableTh columnId="created_at" sortCol={historyOrdersSort.sortCol} sortDir={historyOrdersSort.sortDir} onSort={historyOrdersSort.onHeaderClick}>Date</SortableTh>
                      <SortableTh columnId="product" sortCol={historyOrdersSort.sortCol} sortDir={historyOrdersSort.sortDir} onSort={historyOrdersSort.onHeaderClick}>Product</SortableTh>
                      <SortableTh columnId="ordered_quantity" sortCol={historyOrdersSort.sortCol} sortDir={historyOrdersSort.sortDir} onSort={historyOrdersSort.onHeaderClick}>Quantity</SortableTh>
                      <SortableTh columnId="order_type" sortCol={historyOrdersSort.sortCol} sortDir={historyOrdersSort.sortDir} onSort={historyOrdersSort.onHeaderClick}>Type</SortableTh>
                      <SortableTh columnId="status" sortCol={historyOrdersSort.sortCol} sortDir={historyOrdersSort.sortDir} onSort={historyOrdersSort.onHeaderClick}>Status</SortableTh>
                      <SortableTh columnId="advance_payment_amount" sortCol={historyOrdersSort.sortCol} sortDir={historyOrdersSort.sortDir} onSort={historyOrdersSort.onHeaderClick}>Advance Payment</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistoryOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{new Date(order.created_at).toLocaleString()}</td>
                        <td>
                          {order.product_detail
                            ? `${order.product_detail.brand} ${order.product_detail.model} - Size ${order.product_detail.size} (${order.product_detail.color})`
                            : `Product #${order.product}`}
                        </td>
                        <td>{order.ordered_quantity}</td>
                        <td>{order.order_type === 'on_demand' ? 'On-Demand' : 'Stock'}</td>
                        <td>
                          <span className={`status-badge ${order.status}`}>
                            {order.status}
                          </span>
                        </td>
                        <td>
                          {order.advance_payment_amount
                            ? `${formatDisplayAmount(
                                order.advance_payment_amount,
                                order.advance_payment_currency || 'USD',
                              )} (${order.advance_payment_type})`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Purchase History */}
            <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Purchases</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh columnId="sale_date" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Date</SortableTh>
                  <SortableTh columnId="product" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Product</SortableTh>
                  <SortableTh columnId="quantity" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Quantity</SortableTh>
                  <SortableTh columnId="selling_price" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Price</SortableTh>
                  <SortableTh columnId="total_amount" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Total</SortableTh>
                  <SortableTh columnId="sale_type" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Type</SortableTh>
                  <SortableTh columnId="status" sortCol={historyPurchasesSort.sortCol} sortDir={historyPurchasesSort.sortDir} onSort={historyPurchasesSort.onHeaderClick}>Status</SortableTh>
                </tr>
              </thead>
              <tbody>
                {customerHistory.sales.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center' }}>
                      No purchases found
                    </td>
                  </tr>
                ) : (
                  sortedHistorySales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.sale_date).toLocaleString()}</td>
                      <td>
                        {sale.product_detail
                          ? `${sale.product_detail.brand} ${sale.product_detail.model} - Size ${sale.product_detail.size} (${sale.product_detail.color})`
                          : `Product #${sale.product}`}
                      </td>
                      <td>{sale.quantity}</td>
                      <td>{formatDisplayAmount(sale.selling_price, sale.sale_currency || 'USD')}</td>
                      <td>{formatDisplayAmount(sale.total_amount, sale.sale_currency || 'USD')}</td>
                      <td>
                        {sale.sale_type === 'bought_from_shop' ? 'Shop' : 
                         sale.sale_type === 'from_order' ? 'From Order' : 'Delivery'}
                      </td>
                      <td>
                        <span className={`status-badge ${sale.status}`}>
                          {sale.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Transaction History */}
            <h3 style={{ marginTop: '30px', marginBottom: '10px' }}>Transaction History</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh columnId="timestamp" sortCol={balanceTxSort.sortCol} sortDir={balanceTxSort.sortDir} onSort={balanceTxSort.onHeaderClick}>Date</SortableTh>
                  <SortableTh columnId="transaction_type_key" sortCol={balanceTxSort.sortCol} sortDir={balanceTxSort.sortDir} onSort={balanceTxSort.onHeaderClick}>Transaction type</SortableTh>
                  <SortableTh columnId="amount" sortCol={balanceTxSort.sortCol} sortDir={balanceTxSort.sortDir} onSort={balanceTxSort.onHeaderClick}>Amount</SortableTh>
                  <SortableTh columnId="currency" sortCol={balanceTxSort.sortCol} sortDir={balanceTxSort.sortDir} onSort={balanceTxSort.onHeaderClick}>Currency</SortableTh>
                  <SortableTh columnId="notes" sortCol={balanceTxSort.sortCol} sortDir={balanceTxSort.sortDir} onSort={balanceTxSort.onHeaderClick}>Notes</SortableTh>
                </tr>
              </thead>
              <tbody>
                {combinedBalanceTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center' }}>
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  <>
                    {sortedCombinedBalanceTransactions.map((transaction) => (
                        <tr key={`${transaction.source}-${transaction.id}`}>
                          <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                          <td>
                            {transaction.transaction_type === 'advance_payment' ? 'Advance Payment' : 
                             transaction.transaction_type === 'order_payment' ? 'Order Payment' : 
                             transaction.transaction_type === 'sale_payment' ? 'Sale Payment' : 
                             transaction.transaction_type === 'sale_completion' ? 'Sale Completion' : 
                             transaction.transaction_type}
                          </td>
                          <td>{formatAmountByBalanceType(transaction.amount, transaction.balance_detail?.balance_type)}</td>
                          <td>
                            {(() => {
                              const bt = (transaction.balance_detail?.balance_type || '').toLowerCase();
                              if (bt.startsWith('uzs')) return 'UZS';
                              if (bt.startsWith('usd')) return 'USD';
                              return '—';
                            })()}
                          </td>
                          <td>{transaction.notes || '-'}</td>
                        </tr>
                      ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Customers;

