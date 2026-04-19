import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import './TablePage.css';

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
    cost_price: '',
    selling_price: '',
  });
  const [isNewBrand, setIsNewBrand] = useState(false);
  const [isNewModel, setIsNewModel] = useState(false);
  const [isNewCountry, setIsNewCountry] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);
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
  
  // Common colors list
  const commonColors = [
    'Black',
    'White',
    'Grey',
    'Navy',
    'Red',
    'Blue',
    'Brown',
    'Beige',
    'Green',
    'Pink'
  ];

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      selling_price: formData.selling_price === '' ? null : formData.selling_price,
    };
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
        cost_price: '',
        selling_price: '',
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
      cost_price: product.cost_price,
      selling_price: product.selling_price,
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
              cost_price: '',
              selling_price: '',
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
                <select
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  required
                >
                  <option value="">Select Color</option>
                  {commonColors.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                  {/* Show current color if editing and it's not in the list */}
                  {editingProduct && formData.color && !commonColors.includes(formData.color) && (
                    <option value={formData.color}>{formData.color}</option>
                  )}
                </select>
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
                    {[...new Set(products.map(p => p.supplier_country).filter(Boolean))].sort().map(country => (
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
              <div className="form-group">
                <label>Cost Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Selling Price <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>(optional)</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter selling price"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                />
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
              {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
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
              {getUniqueValues(products, 'brand').map((brand) => (
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
              {getUniqueValues(products, 'model').map((model) => (
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
              {getUniqueValues(products, 'size').map((size) => (
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
              {getUniqueValues(products, 'color').map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Supplier Country</label>
            <select
              value={filters.supplier_country}
              onChange={(e) => setFilters({ ...filters, supplier_country: e.target.value })}
            >
              <option value="">All Countries</option>
              {[...new Set(products.map(p => p.supplier_country).filter(Boolean))].sort().map(country => (
                <option key={country} value={country}>{country.charAt(0).toUpperCase() + country.slice(1)}</option>
              ))}
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
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', supplier_country: '', year: '', month: '' })}
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
              <th>Brand</th>
              <th>Model</th>
              <th>Size</th>
              <th>Color</th>
              <th>Supplier</th>
              <th>Cost Price</th>
              <th>Selling Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center' }}>
                  No products found
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>#{product.id}</td>
                  <td>{product.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{product.name}</td>
                  <td>{product.brand}</td>
                  <td>{product.model}</td>
                  <td><strong>{product.size}</strong></td>
                  <td><strong>{product.color}</strong></td>
                  <td>{product.supplier_country}</td>
                  <td>${product.cost_price}</td>
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Products;

