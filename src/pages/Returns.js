import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../utils/api';
import { cashBalanceTotalByCurrency, formatInsufficientLedgerMessage } from '../utils/currencyFormat';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

function returnProductPickerLabel(p) {
  if (!p) return '';
  return `${p.brand} ${p.model} - Size ${p.size} (${p.color})`;
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

  const productDropdownRef = useRef(null);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  useEffect(() => {
    if (!showForm) {
      setProductSearch('');
      setProductDropdownOpen(false);
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

  const soldPriceDisplay = useMemo(() => {
    if (!selectedSaleForReturn) return '';
    const s = selectedSaleForReturn;
    const ccy = s.sale_currency || 'USD';
    const unit =
      s.selling_price != null && s.selling_price !== '' ? parseFloat(s.selling_price) : NaN;
    const qty = parseInt(s.quantity, 10) || 0;
    const totalRaw = s.total_amount;
    const total =
      totalRaw != null && totalRaw !== ''
        ? parseFloat(totalRaw)
        : Number.isFinite(unit) && qty
          ? unit * qty
          : NaN;
    const parts = [];
    if (Number.isFinite(unit)) parts.push(`${unit.toFixed(2)} ${ccy}/unit`);
    else parts.push('No unit price on record');
    if (qty) parts.push(`original qty ${qty}`);
    if (Number.isFinite(total)) parts.push(`line total ${total.toFixed(2)} ${ccy}`);
    return parts.join(' · ');
  }, [selectedSaleForReturn]);

  const newReturnEligibleSales = useMemo(() => {
    const cid = formData.customer ? parseInt(formData.customer, 10) : null;
    return sales.filter((s) => {
      if (getRemainingReturnQtyForSale(s) <= 0) return false;
      if (cid != null && !Number.isNaN(cid) && s.customer !== cid) return false;
      if (formData.product && s.product !== parseInt(formData.product, 10)) return false;
      if (formCategory && s.product_detail?.category !== formCategory) return false;
      return true;
    });
  }, [sales, formData.customer, formData.product, formCategory, getRemainingReturnQtyForSale]);

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
      const selectedSale = sales.find((s) => s.id === parseInt(formData.sale, 10));
      if (selectedSale) {
        const rem = getRemainingReturnQtyForSale(selectedSale);
        const q = parseInt(formData.quantity, 10) || 0;
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

  const returnsSort = useClientTableSort(RETURNS_SORT_ACCESSORS);
  const displayReturns = useMemo(
    () => returnsSort.sortRows(filteredReturns),
    [filteredReturns, returnsSort]
  );

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
                const eligibleSales = sales.filter((s) => getRemainingReturnQtyForSale(s) > 0);
                const customerEligibleSales = formData.customer
                  ? eligibleSales.filter((s) => s.customer === parseInt(formData.customer, 10))
                  : eligibleSales;
                const customerProductIds = new Set(customerEligibleSales.map((s) => s.product).filter(Boolean));
                const availableProducts = formData.customer
                  ? products.filter((p) => customerProductIds.has(p.id))
                  : products.filter((p) => eligibleSales.some((s) => s.product === p.id));

                const availableCategories = [...new Set(availableProducts.map((p) => p.category).filter(Boolean))].sort();

                const filteredByCategory = availableProducts.filter(
                  (p) => !formCategory || p.category === formCategory,
                );
                const searchLower = productSearch.toLowerCase();
                const filteredProductOptions = filteredByCategory.filter((p) => {
                  if (!productSearch) return true;
                  const haystack = `${p.id} ${p.brand ?? ''} ${p.model ?? ''} ${p.size ?? ''} ${p.color ?? ''}`.toLowerCase();
                  return haystack.includes(searchLower);
                });
                const selectedReturnProduct =
                  filteredByCategory.find((p) => p.id === parseInt(formData.product, 10)) ||
                  availableProducts.find((p) => p.id === parseInt(formData.product, 10));

                return (
                  <>
                  <div className="form-group">
                    <label>Customer (Optional)</label>
                    <select
                      value={formData.customer}
                      onChange={(e) => {
                        setFormCategory('');
                        setProductSearch('');
                        setProductDropdownOpen(false);
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
                      onChange={(e) => {
                        setProductSearch('');
                        setProductDropdownOpen(false);
                        setFormCategory(e.target.value);
                        setFormData({ ...formData, product: '', sale: '' });
                      }}
                    >
                      <option value="">All Categories</option>
                      {availableCategories.map(cat => (
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
                                    setFormData({
                                      ...formData,
                                      product: String(product.id),
                                      sale: '',
                                    });
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
                    {formData.customer && (
                      <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                        Showing only products purchased by{' '}
                        <strong>{customers.find((c) => c.id === parseInt(formData.customer, 10))?.name}</strong> that
                        still have returnable quantity.
                      </small>
                    )}
                  </div>
                  </>
                );
              })()}
              <div className="form-group">
                <label>Sale (Optional)</label>
                <select
                  value={formData.sale}
                  onChange={(e) => setFormData({ ...formData, sale: e.target.value })}
                >
                  <option value="">None</option>
                  {newReturnEligibleSales.map((sale) => (
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
                <label>Sold price</label>
                <input
                  type="text"
                  readOnly
                  value={soldPriceDisplay}
                  placeholder="Select a sale to show unit price and line total."
                  style={{
                    backgroundColor: '#f5f5f5',
                    cursor: 'not-allowed',
                    color: soldPriceDisplay ? '#2c3e50' : '#888',
                  }}
                />
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
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
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
              <SortableTh columnId="id" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                ID
              </SortableTh>
              <th>Actions</th>
              <SortableTh columnId="category" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Category
              </SortableTh>
              <SortableTh columnId="product" sortCol={returnsSort.sortCol} sortDir={returnsSort.sortDir} onSort={returnsSort.onHeaderClick}>
                Product
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
                <td colSpan="19" style={{ textAlign: 'center' }}>
                  No returns found
                </td>
              </tr>
            ) : (
              displayReturns.map((returnItem) => (
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
              <td colSpan="11" style={{ textAlign: 'right' }}>
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

