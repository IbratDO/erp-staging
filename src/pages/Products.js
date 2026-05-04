import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import { productCostCells } from '../utils/productCost';
import { uniqueSupplierCountriesFromProducts } from '../utils/supplierCountries';
import './TablePage.css';

const COMMON_COLORS = [
  'Black', 'White', 'Grey', 'Navy', 'Red', 'Blue', 'Brown', 'Beige', 'Green', 'Pink',
];

const Products = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ message: '', type: '', visible: false });

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type, visible: true });
    setTimeout(() => setNotification({ message: '', type: '', visible: false }), 4000);
  };
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [availableSizes, setAvailableSizes] = useState([]);
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    supplier_country: '',
    year: '',
    month: '',
  });
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    supplier_country: '',
  });
  const [isNewBrand, setIsNewBrand] = useState(false);
  const [isNewModel, setIsNewModel] = useState(false);
  const [isNewCountry, setIsNewCountry] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [isNewColor, setIsNewColor] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const sizeDropdownRef = useRef(null);

  const toggleSize = (size) => {
    setSelectedSizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  };

  // Close size dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(e.target)) {
        setSizeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // All possible sizes from 36 to 46
  const allSizes = Array.from({ length: 11 }, (_, i) => (36 + i).toString());
  

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      const productsList = response.data.results || response.data;
      setProducts(productsList);
      
      // Use all sizes from 36 to 46
      setAvailableSizes(allSizes);
      
      applyFilters(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (productsList, field) => {
    const values = productsList.map(p => p[field]).filter(Boolean);
    return [...new Set(values)].sort();
  };

  const applyFilters = (productsList) => {
    let filtered = productsList;

    if (filters.category) {
      filtered = filtered.filter(p => p.category === filters.category);
    }
    if (filters.brand) {
      filtered = filtered.filter(p => p.brand === filters.brand);
    }
    if (filters.model) {
      filtered = filtered.filter(p => p.model === filters.model);
    }
    if (filters.size) {
      filtered = filtered.filter(p => p.size === filters.size);
    }
    if (filters.color) {
      filtered = filtered.filter(p => p.color === filters.color);
    }
    if (filters.supplier_country) {
      filtered = filtered.filter(p => p.supplier_country === filters.supplier_country);
    }
    if (filters.year) {
      filtered = filtered.filter(p => {
        const productYear = new Date(p.created_at || p.updated_at).getFullYear();
        return productYear.toString() === filters.year;
      });
    }
    if (filters.month) {
      filtered = filtered.filter(p => {
        const productMonth = new Date(p.created_at || p.updated_at).getMonth() + 1;
        return productMonth.toString() === filters.month;
      });
    }
    
    setFilteredProducts(filtered);
  };

  useEffect(() => {
    if (products.length > 0) {
      applyFilters(products);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, products]);

  /** Colors from inventory + presets; sorted for the Color dropdown (same idea as supplier country picklist). */
  const colorOptions = useMemo(() => {
    const fromDb = [...new Set(products.map((p) => p.color).filter(Boolean))];
    const set = new Set([...COMMON_COLORS, ...fromDb]);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [products]);

  const toNum = (v) => (v === '' || v == null ? 0 : parseFloat(v) || 0);

  const productColumnTotals = useMemo(() => {
    let uzsC = 0;
    let uzsCard = 0;
    let usdC = 0;
    let usdCard = 0;
    let sell = 0;
    for (const p of filteredProducts) {
      uzsC += toNum(p.cost_uzs_cash);
      uzsCard += toNum(p.cost_uzs_card);
      usdC += toNum(p.cost_usd_cash);
      usdCard += toNum(p.cost_usd_card);
      sell += toNum(p.selling_price);
    }
    return { uzsC, uzsCard, usdC, usdCard, sell };
  }, [filteredProducts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...formData };
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}/`, payload);
      } else {
        if (selectedSizes.length === 0) {
          showNotification('Please select at least one size.', 'error');
          return;
        }
        await Promise.all(
          selectedSizes.map(size => api.post('/products/', { ...payload, size }))
        );
      }
      setShowForm(false);
      setEditingProduct(null);
      setIsNewBrand(false);
      setIsNewModel(false);
      setIsNewCountry(false);
      setIsNewCategory(false);
      setIsNewColor(false);
      setSelectedSizes([]);
      setSizeDropdownOpen(false);
      setFormData({
        name: '',
        category: '',
        brand: '',
        model: '',
        size: '',
        color: '',
        supplier_country: '',
      });
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      showNotification(error.response?.data?.selling_price?.[0] || error.response?.data?.detail || error.response?.data?.error || 'Error saving product', 'error');
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setIsNewBrand(false);
    setIsNewModel(false);
    setIsNewCountry(false);
    setIsNewCategory(false);
    setIsNewColor(false);
    setSelectedSizes([]);
    setSizeDropdownOpen(false);
    setFormData({
      name: product.name,
      category: product.category || '',
      brand: product.brand,
      model: product.model,
      size: product.size,
      color: product.color,
      supplier_country: product.supplier_country,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await api.delete(`/products/${id}/`);
        fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        alert('Error deleting product');
      }
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      {notification.visible && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
          padding: '12px 20px', borderRadius: '6px', color: 'white', fontWeight: 500,
          backgroundColor: notification.type === 'success' ? '#4caf50' : '#f44336',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', maxWidth: '400px'
        }}>
          {notification.message}
        </div>
      )}
      <div className="page-header">
        <h1>Products</h1>
        <button className="btn-primary" onClick={() => {
          setShowForm(!showForm);
          // Clear editing state and reset form when canceling or opening new form
          if (showForm || !showForm) {
            setEditingProduct(null);
            setIsNewBrand(false);
            setIsNewModel(false);
            setIsNewCountry(false);
            setIsNewCategory(false);
            setIsNewColor(false);
            setSelectedSizes([]);
            setSizeDropdownOpen(false);
            setFormData({
              name: '',
              category: '',
              brand: '',
              model: '',
              size: '',
              color: '',
              supplier_country: '',
            });
          }
        }}>
          {showForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h2>{editingProduct ? 'Edit Product' : 'New Product'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Category <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(optional)</span></label>
                {!isNewCategory ? (
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewCategory(true);
                        setFormData({ ...formData, category: '' });
                      } else {
                        setFormData({ ...formData, category: e.target.value });
                      }
                    }}
                  >
                    <option value="">— None —</option>
                    {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__new__">+ Add new category...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="e.g. Shoes, T-Shirt, Cap"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => { setIsNewCategory(false); setFormData({ ...formData, category: '' }); }}
                      style={{ padding: '0 10px', background: '#eee', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ← Back
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Brand</label>
                {!isNewBrand ? (
                  <select
                    value={formData.brand}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewBrand(true);
                        setFormData({ ...formData, brand: '' });
                      } else {
                        setFormData({ ...formData, brand: e.target.value });
                      }
                    }}
                    required
                  >
                    <option value="">Select a brand</option>
                    {[...new Set(products.map(p => p.brand).filter(Boolean))].sort().map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                    <option value="__new__">+ Add new brand...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter new brand name"
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      required
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewBrand(false);
                        setFormData({ ...formData, brand: '' });
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
                <label>Model</label>
                {!isNewModel ? (
                  <select
                    value={formData.model}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewModel(true);
                        setFormData({ ...formData, model: '' });
                      } else {
                        setFormData({ ...formData, model: e.target.value });
                      }
                    }}
                    required
                  >
                    <option value="">Select a model</option>
                    {[...new Set(products.map(p => p.model).filter(Boolean))].sort().map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                    <option value="__new__">+ Add new model...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter new model name"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      required
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewModel(false);
                        setFormData({ ...formData, model: '' });
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
                <label>Size{!editingProduct && <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em', marginLeft: '6px' }}>— click to select multiple</span>}</label>
                {editingProduct ? (
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    required
                  >
                    <option value="">Select Size</option>
                    {availableSizes.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                    {formData.size && !availableSizes.includes(formData.size) && (
                      <option value={formData.size}>{formData.size}</option>
                    )}
                  </select>
                ) : (
                  <div ref={sizeDropdownRef} style={{ position: 'relative' }}>
                    {/* Dropdown trigger */}
                    <div
                      onClick={() => setSizeDropdownOpen(prev => !prev)}
                      style={{
                        padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px',
                        background: '#fff', cursor: 'pointer', userSelect: 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        minHeight: '38px',
                      }}
                    >
                      <span style={{ color: selectedSizes.length === 0 ? '#999' : '#333' }}>
                        {selectedSizes.length === 0
                          ? 'Select sizes...'
                          : selectedSizes.slice().sort((a, b) => Number(a) - Number(b)).join(', ')}
                      </span>
                      <span style={{ fontSize: '0.75em', color: '#666' }}>{sizeDropdownOpen ? '▲' : '▼'}</span>
                    </div>

                    {/* Dropdown panel */}
                    {sizeDropdownOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        border: '1px solid #ccc', borderRadius: '4px', background: '#fff',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: '2px',
                        padding: '8px',
                        display: 'flex', flexWrap: 'wrap', gap: '6px',
                      }}>
                        {allSizes.map(size => {
                          const isSelected = selectedSizes.includes(size);
                          return (
                            <div
                              key={size}
                              onClick={() => toggleSize(size)}
                              style={{
                                padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                                fontWeight: 600, fontSize: '0.95em', userSelect: 'none',
                                border: isSelected ? '2px solid #1976d2' : '2px solid #ddd',
                                background: isSelected ? '#1976d2' : '#f5f5f5',
                                color: isSelected ? '#fff' : '#333',
                                transition: 'all 0.15s',
                              }}
                            >
                              {size}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {selectedSizes.length > 1 && (
                      <small style={{ color: '#1976d2', marginTop: '4px', display: 'block' }}>
                        {selectedSizes.length} products will be created
                      </small>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Color</label>
                {!isNewColor ? (
                  <select
                    value={formData.color}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewColor(true);
                        setFormData({ ...formData, color: '' });
                      } else {
                        setFormData({ ...formData, color: e.target.value });
                      }
                    }}
                    required
                  >
                    <option value="">Select color</option>
                    {colorOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {formData.color && !colorOptions.includes(formData.color) && (
                      <option value={formData.color}>{formData.color}</option>
                    )}
                    <option value="__new__">+ Add new color...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="e.g. Panda, Bred, Off-White"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      required
                      autoFocus
                      maxLength={100}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewColor(false);
                        setFormData({ ...formData, color: '' });
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
                <label>Supplier Country <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(optional)</span></label>
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
                  >
                    <option value="">— None —</option>
                    {uniqueSupplierCountriesFromProducts(products).map(country => (
                      <option key={country} value={country}>{country.charAt(0).toUpperCase() + country.slice(1)}</option>
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
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingProduct ? 'Update' : 'Create'}
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
              {getUniqueValues(products, 'brand').map((brand) => (
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
              {getUniqueValues(products, 'model').map((model) => (
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
              {getUniqueValues(products, 'size').map((size) => (
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
              {getUniqueValues(products, 'color').map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Supplier Country</label>
            <select
              value={filters.supplier_country}
              onChange={(e) => setFilters({ ...filters, supplier_country: e.target.value })}
            >
              <option value="">All Countries</option>
              {uniqueSupplierCountriesFromProducts(products).map(country => (
                <option key={country} value={country}>{country.charAt(0).toUpperCase() + country.slice(1)}</option>
              ))}
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
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', supplier_country: '', year: '', month: '' })}
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
              <th>Category</th>
              <th>Name</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Supplier</th>
              <th>Cost-UZS (cash)</th>
              <th>Cost-UZS (card)</th>
              <th>Cost-USD (cash)</th>
              <th>Cost-USD (card)</th>
              <th>Selling Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="14" style={{ textAlign: 'center' }}>
                  No products found
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => {
                const cost = productCostCells(product);
                return (
                <tr key={product.id}>
                  <td>#{product.id}</td>
                  <td>{product.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{product.name}</td>
                  <td>{product.brand}</td>
                  <td>{product.model}</td>
                  <td><strong>{product.size}</strong></td>
                  <td><strong>{product.color}</strong></td>
                  <td>{product.supplier_country}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.uzsCash}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.uzsCard}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.usdCash}</td>
                  <td style={{ fontSize: '0.9em' }}>{cost.usdCard}</td>
                  <td>{product.selling_price ? `$${product.selling_price}` : <span style={{ color: '#999' }}>—</span>}</td>
                  <td>
                    <button
                      className="btn-edit"
                      onClick={() => handleEdit(product)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(product.id)}
                    >
                      Delete
                    </button>
                  </td>
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
                {productColumnTotals.uzsC > 0
                  ? productColumnTotals.uzsC.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {productColumnTotals.uzsCard > 0
                  ? productColumnTotals.uzsCard.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {productColumnTotals.usdC > 0 ? `$${productColumnTotals.usdC.toFixed(2)}` : '—'}
              </td>
              <td style={{ fontWeight: 600, fontSize: '0.9em' }}>
                {productColumnTotals.usdCard > 0 ? `$${productColumnTotals.usdCard.toFixed(2)}` : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {productColumnTotals.sell > 0
                  ? `$${productColumnTotals.sell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </td>
              <td>—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Products;

