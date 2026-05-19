import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { productCostPickerLabel } from '../utils/productCost';
import { plannedSellingSummary } from '../utils/orderPlannedPricing';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

/** Landed unit cost for one FIFO layer row (supplier + cargo per unit). */
function layerLandedCostCells(layer) {
  const supUzs = parseFloat(layer.unit_supplier_cost_uzs) || 0;
  const supUsd = parseFloat(layer.unit_supplier_cost_usd) || 0;
  const cargoUzs = parseFloat(layer.unit_cargo_cost_uzs) || 0;
  const cargoUsd = parseFloat(layer.unit_cargo_cost_usd) || 0;
  const uzs = supUzs + cargoUzs;
  const usd = supUsd + cargoUsd;
  return {
    uzsTotal: uzs > 0 ? uzs.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—',
    usdTotal: usd > 0 ? `$${usd.toFixed(2)}` : '—',
  };
}

function layerCostUzsNum(layer) {
  return (parseFloat(layer.unit_supplier_cost_uzs) || 0) + (parseFloat(layer.unit_cargo_cost_uzs) || 0);
}

function layerCostUsdNum(layer) {
  return (parseFloat(layer.unit_supplier_cost_usd) || 0) + (parseFloat(layer.unit_cargo_cost_usd) || 0);
}

function inventorySellingCell(productDetail, stockingOrder) {
  const label = plannedSellingSummary(stockingOrder || null);
  if (label) return label;
  const pu = parseFloat(productDetail?.selling_price);
  if (productDetail?.selling_price != null && !Number.isNaN(pu) && pu > 0)
    return `$${pu.toFixed(2)}/u`;
  return '—';
}

function invSellingPriceNum(item) {
  const so = item.stocking_order;
  if (so?.selling_price != null && String(so.selling_price).trim() !== '') {
    const n = parseFloat(so.selling_price);
    return Number.isFinite(n) ? n : 0;
  }
  const pu = parseFloat(item.product_detail?.selling_price);
  return Number.isFinite(pu) ? pu : 0;
}

const INVENTORY_SORT_ACCESSORS = {
  category: (it) => String(it.product_detail?.category ?? '').toLowerCase(),
  rec_no: (it) => Number(it.product_detail?.id ?? it.product) || 0,
  product: (it) =>
    it.product_detail
      ? `${it.product_detail.brand} ${it.product_detail.model}`.toLowerCase()
      : String(it.product ?? ''),
  brand: (it) => String(it.product_detail?.brand ?? '').toLowerCase(),
  model: (it) => String(it.product_detail?.model ?? '').toLowerCase(),
  size: (it) => String(it.product_detail?.size ?? '').toLowerCase(),
  color: (it) => String(it.product_detail?.color ?? '').toLowerCase(),
  layer: (it) => Number(it.batch_id) || 0,
  cost_uzs: (it) => layerCostUzsNum(it),
  cost_usd: (it) => layerCostUsdNum(it),
  selling: (it) => invSellingPriceNum(it),
  quantity: (it) => Number(it.quantity) || 0,
  status: (it) => String(it.status ?? '').toLowerCase(),
  location: (it) => String(it.location ?? '').toLowerCase(),
  updated_at: (it) => new Date(it.updated_at).getTime() || 0,
};

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
    unit_supplier_cost_usd: '',
    unit_supplier_cost_uzs: '',
  });

  useEffect(() => {
    fetchInventory();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory/layers/');
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
    let uzsTotal = 0;
    let usdTotal = 0;
    for (const item of filteredInventory) {
      const q = parseInt(item.quantity, 10) || 0;
      quantity += q;
      uzsTotal += layerCostUzsNum(item) * q;
      usdTotal += layerCostUsdNum(item) * q;
    }
    return { quantity, uzsTotal, usdTotal };
  }, [filteredInventory]);

  const invSort = useClientTableSort(INVENTORY_SORT_ACCESSORS);
  const displayInventory = useMemo(
    () => invSort.sortRows(filteredInventory),
    [filteredInventory, invSort]
  );

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
    const qty = parseInt(formData.quantity, 10) || 0;
    const usd = parseFloat(formData.unit_supplier_cost_usd) || 0;
    const uzs = parseFloat(formData.unit_supplier_cost_uzs) || 0;
    if (qty > 0 && usd <= 0 && uzs <= 0) {
      alert(
        'Enter unit supplier cost (USD and/or UZS) for the units you are adding. ' +
          'This creates a FIFO batch used for COGS when these items are sold.'
      );
      return;
    }
    try {
      const payload = {
        product: formData.product,
        quantity: formData.quantity,
        status: formData.status,
        location: formData.location,
      };
      if (qty > 0) {
        if (usd > 0) payload.unit_supplier_cost_usd = usd;
        if (uzs > 0) payload.unit_supplier_cost_uzs = uzs;
      }
      await api.post('/inventory/', payload);
      setShowForm(false);
      setFormCategory('');
      setFormData({
        product: '',
        quantity: '',
        status: 'in_inventory',
        location: '',
        unit_supplier_cost_usd: '',
        unit_supplier_cost_uzs: '',
      });
      fetchInventory();
    } catch (error) {
      console.error('Error saving inventory item:', error);
      const data = error.response?.data;
      const msg =
        (typeof data === 'string' && data) ||
        data?.detail ||
        (Array.isArray(data) ? data.join('\n') : null) ||
        (data && typeof data === 'object'
          ? Object.entries(data)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join('\n')
          : null) ||
        'Error saving inventory item';
      alert(msg);
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
                <label>
                  Unit supplier cost (USD){' '}
                  <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>
                    required if adding stock
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 55.00"
                  value={formData.unit_supplier_cost_usd}
                  onChange={(e) =>
                    setFormData({ ...formData, unit_supplier_cost_usd: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>
                  Unit supplier cost (UZS){' '}
                  <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>
                    and/or UZS
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 650000"
                  value={formData.unit_supplier_cost_uzs}
                  onChange={(e) =>
                    setFormData({ ...formData, unit_supplier_cost_uzs: e.target.value })
                  }
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
              <SortableTh columnId="category" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Category
              </SortableTh>
              <SortableTh columnId="rec_no" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Rec #
              </SortableTh>
              <SortableTh columnId="product" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Product
              </SortableTh>
              <SortableTh columnId="brand" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Brand
              </SortableTh>
              <SortableTh columnId="model" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Model
              </SortableTh>
              <SortableTh columnId="size" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Size
              </SortableTh>
              <SortableTh columnId="color" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Color
              </SortableTh>
              <SortableTh columnId="layer" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Layer #
              </SortableTh>
              <SortableTh columnId="cost_uzs" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Landed cost (UZS) / unit
              </SortableTh>
              <SortableTh columnId="cost_usd" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Landed cost (USD) / unit
              </SortableTh>
              <SortableTh columnId="selling" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Selling price / unit
              </SortableTh>
              <SortableTh columnId="quantity" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Quantity
              </SortableTh>
              <SortableTh columnId="status" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Status
              </SortableTh>
              <SortableTh columnId="location" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Location
              </SortableTh>
              <SortableTh columnId="updated_at" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                Updated
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan="15" style={{ textAlign: 'center' }}>
                  No inventory in stock
                </td>
              </tr>
            ) : (
              displayInventory.map((item) => {
                const cost = layerLandedCostCells(item);
                const sell = inventorySellingCell(item.product_detail, item.stocking_order);
                const sellTip = plannedSellingSummary(item.stocking_order) || '';
                return (
                <tr key={item.batch_id}>
                  <td>{item.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
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
                  <td style={{ fontSize: '0.85em', color: '#666' }}>#{item.batch_id}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.uzsTotal}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.usdTotal}</td>
                  <td style={{ fontSize: '0.9em', color: '#2c3e50' }} title={sellTip || undefined}>
                    {sell}
                  </td>
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
                {inventoryColumnTotals.uzsTotal > 0
                  ? inventoryColumnTotals.uzsTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {inventoryColumnTotals.usdTotal > 0
                  ? `$${inventoryColumnTotals.usdTotal.toFixed(2)}`
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em', color: '#999' }}>—</td>
              <td style={{ fontWeight: 600 }}>{inventoryColumnTotals.quantity.toLocaleString()}</td>
              <td colSpan="4">—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Inventory;

