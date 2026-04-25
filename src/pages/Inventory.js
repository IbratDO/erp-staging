import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { productCostCells, productCostPickerLabel } from '../utils/productCost';
import './TablePage.css';

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [products, setProducts] = useState([]);
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
    status: 'in_inventory',
    location: '',
  });

  useEffect(() => {
    fetchInventory();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory/');
      const inventoryList = response.data.results || response.data;
      setInventory(inventoryList);
      applyFilters(inventoryList);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (inventoryList, field) => {
    const values = inventoryList
      .map(item => item.product_detail?.[field])
      .filter(Boolean);
    return [...new Set(values)].sort();
  };

  const applyFilters = (inventoryList) => {
    let filtered = inventoryList;
    
    if (filters.category) {
      filtered = filtered.filter(item =>
        item.product_detail?.category === filters.category
      );
    }
    if (filters.brand) {
      filtered = filtered.filter(item => 
        item.product_detail?.brand === filters.brand
      );
    }
    if (filters.model) {
      filtered = filtered.filter(item => 
        item.product_detail?.model === filters.model
      );
    }
    if (filters.size) {
      filtered = filtered.filter(item => 
        item.product_detail?.size === filters.size
      );
    }
    if (filters.color) {
      filtered = filtered.filter(item => 
        item.product_detail?.color === filters.color
      );
    }
    if (filters.status) {
      filtered = filtered.filter(item => item.status === filters.status);
    }
    if (filters.year) {
      filtered = filtered.filter(item => {
        const itemYear = new Date(item.created_at || item.updated_at).getFullYear();
        return itemYear.toString() === filters.year;
      });
    }
    if (filters.month) {
      filtered = filtered.filter(item => {
        const itemMonth = new Date(item.created_at || item.updated_at).getMonth() + 1;
        return itemMonth.toString() === filters.month;
      });
    }
    
    setFilteredInventory(filtered);
  };

  useEffect(() => {
    if (inventory.length > 0) {
      applyFilters(inventory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const inventoryColumnTotals = useMemo(() => {
    let quantity = 0;
    let uzsC = 0;
    let uzsCard = 0;
    let usdC = 0;
    let usdCard = 0;
    for (const item of filteredInventory) {
      const q = parseInt(item.quantity, 10) || 0;
      const p = item.product_detail || {};
      quantity += q;
      uzsC += (parseFloat(p.cost_uzs_cash) || 0) * q;
      uzsCard += (parseFloat(p.cost_uzs_card) || 0) * q;
      usdC += (parseFloat(p.cost_usd_cash) || 0) * q;
      usdCard += (parseFloat(p.cost_usd_card) || 0) * q;
    }
    return { quantity, uzsC, uzsCard, usdC, usdCard };
  }, [filteredInventory]);

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
      await api.post('/inventory/', formData);
      setShowForm(false);
      setFormCategory('');
      setFormData({
        product: '',
        quantity: '',
        status: 'in_inventory',
        location: '',
      });
      fetchInventory();
    } catch (error) {
      console.error('Error saving inventory item:', error);
      alert('Error saving inventory item');
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Inventory</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Inventory Item'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h2>New Inventory Item</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Category <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(filter products)</span></label>
                <select
                  value={formCategory}
                  onChange={(e) => { setFormCategory(e.target.value); setFormData({ ...formData, product: '' }); }}
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
                  onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                  required
                >
                  <option value="">Select a product</option>
                  {products
                    .filter(p => !formCategory || p.category === formCategory)
                    .slice()
                    .sort((a, b) => b.id - a.id)
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {productCostPickerLabel(product)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  <option value="in_inventory">In Inventory</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                  <option value="returned">Returned</option>
                </select>
              </div>
              <div className="form-group">
                <label>Location (Optional)</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create
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
          <div className="filter-field">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              {[...new Set(inventory.map(i => i.product_detail?.category).filter(Boolean))].sort().map(cat => (
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
              {getUniqueValues(inventory, 'brand').map((brand) => (
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
              {getUniqueValues(inventory, 'model').map((model) => (
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
              {getUniqueValues(inventory, 'size').map((size) => (
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
              {getUniqueValues(inventory, 'color').map((color) => (
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
              <option value="in_inventory">In Inventory</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
              <option value="returned">Returned</option>
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
              <th>Category</th>
              <th>Name</th>
              <th>Rec #</th>
              <th>Product</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Cost-UZS (cash)</th>
              <th>Cost-UZS (card)</th>
              <th>Cost-USD (cash)</th>
              <th>Cost-USD (card)</th>
              <th>Quantity</th>
              <th>Status</th>
              <th>Location</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan="16" style={{ textAlign: 'center' }}>
                  No inventory items found
                </td>
              </tr>
            ) : (
              filteredInventory.map((item) => {
                const cost = productCostCells(item.product_detail || {});
                return (
                <tr key={item.id}>
                  <td>{item.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{item.product_detail?.name || <span style={{ color: '#999' }}>—</span>}</td>
                  <td><strong>#{item.product_detail?.id ?? item.product}</strong></td>
                  <td>
                    {item.product_detail
                      ? `${item.product_detail.brand} ${item.product_detail.model}`
                      : `Product #${item.product}`}
                  </td>
                  <td>{item.product_detail?.brand || '-'}</td>
                  <td>{item.product_detail?.model || '-'}</td>
                  <td><strong>{item.product_detail?.size || '-'}</strong></td>
                  <td><strong>{item.product_detail?.color || '-'}</strong></td>
                  <td style={{ fontSize: '0.9em' }}>{cost.uzsCash}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.uzsCard}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.usdCash}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.usdCard}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <span className={`status-badge ${item.status}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{item.location || '-'}</td>
                  <td>{new Date(item.updated_at).toLocaleString()}</td>
                </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="8" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {inventoryColumnTotals.uzsC > 0
                  ? inventoryColumnTotals.uzsC.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {inventoryColumnTotals.uzsCard > 0
                  ? inventoryColumnTotals.uzsCard.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {inventoryColumnTotals.usdC > 0
                  ? `$${inventoryColumnTotals.usdC.toFixed(2)}`
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {inventoryColumnTotals.usdCard > 0
                  ? `$${inventoryColumnTotals.usdCard.toFixed(2)}`
                  : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>{inventoryColumnTotals.quantity.toLocaleString()}</td>
              <td colSpan="3">—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Inventory;

