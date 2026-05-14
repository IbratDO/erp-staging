import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { cashBalanceTotalByCurrency, formatInsufficientLedgerMessage } from '../utils/currencyFormat';
import './TablePage.css';

const Returns = () => {
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
    reason: 'customer_request',
    notes: '',
  });
  const [refundFormData, setRefundFormData] = useState({
    returnId: null,
    uzs: '',
    usd: '',
  });
  const [showRefundForm, setShowRefundForm] = useState(false);

  useEffect(() => {
    fetchReturns();
    fetchProducts();
    fetchSales();
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!String(formData.notes || '').trim()) {
      showNotification('Please enter notes.', 'error');
      return;
    }
    if (formData.sale) {
      const selectedSale = sales.find(s => s.id === parseInt(formData.sale));
      if (selectedSale && parseInt(formData.quantity) > selectedSale.quantity) {
        showNotification(`Return quantity (${formData.quantity}) cannot exceed the original sale quantity (${selectedSale.quantity}).`, 'error');
        return;
      }
    }
    try {
      const payload = {
        product: parseInt(formData.product, 10),
        quantity: parseInt(formData.quantity, 10),
        reason: formData.reason,
        notes: String(formData.notes).trim(),
        sale: formData.sale ? parseInt(formData.sale, 10) : null,
        customer: formData.customer ? parseInt(formData.customer, 10) : null,
      };
      if (Number.isNaN(payload.product) || Number.isNaN(payload.quantity)) {
        showNotification('Please select a product and enter a valid quantity.', 'error');
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
        reason: 'customer_request',
        notes: '',
      });
      fetchReturns();
    } catch (error) {
      console.error('Error creating return:', error);
      const d = error.response?.data;
      const msg =
        (Array.isArray(d?.quantity) && d.quantity[0]) ||
        (typeof d?.quantity === 'string' && d.quantity) ||
        d?.detail ||
        d?.error ||
        (typeof d === 'string' ? d : null) ||
        error.message ||
        'Error creating return';
      showNotification(typeof msg === 'string' ? msg : 'Error creating return', 'error');
    }
  };

  const handleMarkRefunded = (returnId) => {
    const returnItem = returns.find(r => r.id === returnId);
    setRefundFormData({
      returnId: returnId,
      uzs: '',
      usd: returnItem?.sale_detail?.total_amount || '',
    });
    setShowRefundForm(true);
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    try {
      const uzs = parseFloat(refundFormData.uzs) || 0;
      const usd = parseFloat(refundFormData.usd) || 0;
      if (uzs + usd === 0) {
        showNotification('Please enter at least one refund amount.', 'error');
        return;
      }
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
      await api.post(`/returns/${refundFormData.returnId}/mark_refunded/`, {
        uzs, usd,
      });
      setShowRefundForm(false);
      setRefundFormData({ returnId: null, uzs: '', usd: '' });
      fetchReturns();
    } catch (error) {
      console.error('Error marking return as refunded:', error);
      showNotification(error.response?.data?.error || error.response?.data?.detail || 'Error marking return as refunded', 'error');
    }
  };

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
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Return'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h2>New Return</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {(() => {
                const customerSales = formData.customer
                  ? sales.filter(s => s.customer === parseInt(formData.customer))
                  : sales;
                const customerProductIds = new Set(customerSales.map(s => s.product).filter(Boolean));
                const availableProducts = formData.customer
                  ? products.filter(p => customerProductIds.has(p.id))
                  : products;
                const availableCategories = [...new Set(availableProducts.map(p => p.category).filter(Boolean))].sort();

                return (<>
                  <div className="form-group">
                    <label>Customer (Optional)</label>
                    <select
                      value={formData.customer}
                      onChange={(e) => {
                        setFormCategory('');
                        setFormData({ ...formData, customer: e.target.value, sale: '', product: '' });
                      }}
                    >
                      <option value="">All customers</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.telephone ? ` — ${c.telephone}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Category <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter products)</span></label>
                    <select
                      value={formCategory}
                      onChange={(e) => { setFormCategory(e.target.value); setFormData({ ...formData, product: '', sale: '' }); }}
                    >
                      <option value="">All Categories</option>
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Product</label>
                    <select
                      value={formData.product}
                      onChange={(e) => setFormData({ ...formData, product: e.target.value, sale: '' })}
                      required
                    >
                      <option value="">Select a product</option>
                      {availableProducts
                        .filter(p => !formCategory || p.category === formCategory)
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.brand} {product.model} - Size {product.size} ({product.color})
                          </option>
                        ))}
                    </select>
                    {formData.customer && (
                      <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                        Showing only products purchased by <strong>{customers.find(c => c.id === parseInt(formData.customer))?.name}</strong>
                      </small>
                    )}
                  </div>
                </>);
              })()}
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
                <label>Sale (Optional)</label>
                <select
                  value={formData.sale}
                  onChange={(e) => setFormData({ ...formData, sale: e.target.value })}
                >
                  <option value="">None</option>
                  {sales
                    .filter(s => {
                      if (formData.customer && s.customer !== parseInt(formData.customer)) return false;
                      if (formData.product && s.product !== parseInt(formData.product)) return false;
                      if (formCategory && s.product_detail?.category !== formCategory) return false;
                      return true;
                    })
                    .map((sale) => (
                      <option key={sale.id} value={sale.id}>
                        Sale #{sale.id} - {sale.product_detail?.brand} {sale.product_detail?.model}
                        {sale.customer_detail?.name ? ` (${sale.customer_detail.name})` : ''}
                      </option>
                    ))}
                </select>
                {(formData.customer || formData.product) && (
                  <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                    Filtered by:{' '}
                    {formData.customer && <strong>{customers.find(c => c.id === parseInt(formData.customer))?.name}</strong>}
                    {formData.customer && formData.product && ' · '}
                    {formData.product && <strong>{products.find(p => p.id === parseInt(formData.product))?.brand} {products.find(p => p.id === parseInt(formData.product))?.model}</strong>}
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={formData.sale ? (sales.find(s => s.id === parseInt(formData.sale))?.quantity || undefined) : undefined}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
                {formData.sale && (() => {
                  const selectedSale = sales.find(s => s.id === parseInt(formData.sale));
                  return selectedSale ? (
                    <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                      Original sale quantity: <strong>{selectedSale.quantity}</strong>
                    </small>
                  ) : null;
                })()}
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
            Enter the UZS and/or USD refund amount.
          </p>
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
              <th>ID</th>
              <th>Actions</th>
              <th>Category</th>
              <th>Name</th>
              <th>Product</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Sale</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Quantity</th>
              <th>Reason</th>
              <th>Refund UZS</th>
              <th>Refund USD</th>
              <th>Refund Status</th>
              <th>Notes</th>
              <th>Processed By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredReturns.length === 0 ? (
              <tr>
                <td colSpan="20" style={{ textAlign: 'center' }}>
                  No returns found
                </td>
              </tr>
            ) : (
              filteredReturns.map((returnItem) => (
                <tr key={returnItem.id}>
                  <td>#{returnItem.id}</td>
                  <td>
                    {returnItem.refund_status === 'not_refunded' && (
                      <button
                        className="btn-status"
                        onClick={() => handleMarkRefunded(returnItem.id)}
                      >
                        Mark as Refunded
                      </button>
                    )}
                  </td>
                  <td>{returnItem.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{returnItem.product_detail?.name || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>
                    {returnItem.product_detail
                      ? `${returnItem.product_detail.brand} ${returnItem.product_detail.model}`
                      : `Product #${returnItem.product}`}
                  </td>
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
              <td colSpan="12" style={{ textAlign: 'right' }}>
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

