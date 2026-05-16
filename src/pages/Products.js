import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

const PRODUCTS_SORT_ACCESSORS = {
  id: (p) => Number(p.id) || 0,
  category: (p) => String(p.category ?? '').toLowerCase(),
  brand: (p) => String(p.brand ?? '').toLowerCase(),
  model: (p) => String(p.model ?? '').toLowerCase(),
  size: (p) => String(p.size ?? '').toLowerCase(),
  color: (p) => String(p.color ?? '').toLowerCase(),
};

const COMMON_COLORS = [
  'Black', 'White', 'Grey', 'Navy', 'Red', 'Blue', 'Brown', 'Beige', 'Green', 'Pink',
];

/** Normalize variant fields for duplicate checks (matches backend iexact + strip). */
const variantPart = (v) => String(v ?? '').trim().toLowerCase();

const variantKeyFromBody = (body) =>
  [variantPart(body.brand), variantPart(body.model), variantPart(body.size), variantPart(body.color)].join('|');

/** Letter apparel sizes (shown separately from numeric sizes in pickers). */
const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
/** Typical numeric sizes (e.g. footwear); separate group from LETTER_SIZES in the UI. */
const NUMERIC_SIZES = Array.from({ length: 11 }, (_, i) => (36 + i).toString());
const ALL_EDITOR_SIZE_OPTIONS = [...LETTER_SIZES, ...NUMERIC_SIZES];

const LETTER_SIZE_RANK = new Map(
  LETTER_SIZES.map((s, i) => [s.toUpperCase(), i]),
);

/** Order for display/filter: XS…XXL (case-insensitive), then numeric ascending, then other strings A–Z. */
function sortSizesCanonical(values) {
  const uniq = [...new Set(values)].filter(Boolean);
  const numericString = (s) => /^-?\d+(\.\d+)?$/.test(String(s).trim());

  return uniq.sort((a, b) => {
    const au = String(a).toUpperCase();
    const bu = String(b).toUpperCase();
    const ar = LETTER_SIZE_RANK.get(au);
    const br = LETTER_SIZE_RANK.get(bu);
    if (ar !== undefined && br !== undefined) return ar - br;
    if (ar !== undefined) return -1;
    if (br !== undefined) return 1;
    const aNum = numericString(a);
    const bNum = numericString(b);
    if (aNum && bNum) return Number(a) - Number(b);
    if (aNum) return 1;
    if (bNum) return -1;
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  });
}

/** Split size list for grouped selects: letter / number / other. */
function partitionSizesForUiGroups(sortedSizesFlat) {
  const letterSet = new Set(LETTER_SIZES.map((s) => s.toUpperCase()));
  const letters = [];
  const nums = [];
  const other = [];
  for (const s of sortedSizesFlat) {
    if (!s) continue;
    const up = String(s).toUpperCase();
    const isNum = /^-?\d+(\.\d+)?$/.test(String(s).trim());
    if (letterSet.has(up)) letters.push(s);
    else if (isNum) nums.push(s);
    else other.push(s);
  }
  return { letters, nums, other };
}

function apiErrorMessage(error, fallback = 'Request failed') {
  const data = error.response?.data;
  if (!data) return error.message || fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return data.non_field_errors.join(' ');
  }
  const keys = Object.keys(data);
  if (keys.length && Array.isArray(data[keys[0]])) {
    return `${keys[0]}: ${data[keys[0]][0]}`;
  }
  return fallback;
}

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
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    model: '',
    size: '',
    color: '',
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
  });
  const [isNewBrand, setIsNewBrand] = useState(false);
  const [isNewModel, setIsNewModel] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [pendingCustomColor, setPendingCustomColor] = useState('');
  const [pendingCustomSize, setPendingCustomSize] = useState('');
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const sizeDropdownRef = useRef(null);
  const colorDropdownRef = useRef(null);

  const toggleSize = (size) => {
    setSelectedSizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  };

  const toggleColor = (color) => {
    const c = String(color).trim();
    if (!c) return;
    setSelectedColors(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const addPendingCustomColor = () => {
    const c = pendingCustomColor.trim();
    if (!c) return;
    setSelectedColors((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setPendingCustomColor('');
  };

  /** Product.size is CharField(max_length=20); allow free text like colors for new-product flow. */
  const addPendingCustomSize = () => {
    const raw = pendingCustomSize.trim();
    if (!raw) return;
    if (raw.length > 20) {
      showNotification('Size must be 20 characters or less.', 'error');
      return;
    }
    setSelectedSizes((prev) => (prev.includes(raw) ? prev : [...prev, raw]));
    setPendingCustomSize('');
  };

  // Close size/color dropdowns when clicking outside either panel
  useEffect(() => {
    const handleClickOutside = (e) => {
      const inSize = sizeDropdownRef.current?.contains(e.target);
      const inColor = colorDropdownRef.current?.contains(e.target);
      if (!inSize) setSizeDropdownOpen(false);
      if (!inColor) setColorDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      const productsList = response.data.results || response.data;
      setProducts(productsList);

      applyFilters(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (productsList, field) => {
    const values = productsList.map((p) => p[field]).filter(Boolean);
    const uniq = [...new Set(values)];
    if (field === 'size') return sortSizesCanonical(uniq);
    return uniq.sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }),
    );
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

  const pickerColorOptions = useMemo(() => {
    const s = new Set([...colorOptions, ...selectedColors]);
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [colorOptions, selectedColors]);

  /**
   * Letter/number presets are listed above. Everything else: sizes already on products (persisted)
   * plus any non-preset size selected this session (before save) — same idea as pickerColorOptions.
   */
  const pickerExtraSizes = useMemo(() => {
    const fromDb = [
      ...new Set(
        products
          .map((p) => String(p.size ?? '').trim())
          .filter(Boolean)
          .filter((s) => !ALL_EDITOR_SIZE_OPTIONS.includes(s)),
      ),
    ];
    const fromSession = selectedSizes.filter((s) => !ALL_EDITOR_SIZE_OPTIONS.includes(s));
    return sortSizesCanonical([...new Set([...fromDb, ...fromSession])]);
  }, [products, selectedSizes]);

  const existingVariantKeys = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      set.add(variantKeyFromBody(p));
    }
    return set;
  }, [products]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...formData };
    try {
      if (editingProduct) {
        if (selectedColors.length === 0) {
          showNotification('Please select at least one color.', 'error');
          return;
        }
        const basePayload = { ...payload, color: selectedColors[0] };
        await api.put(`/products/${editingProduct.id}/`, basePayload);
        const extraColors = selectedColors.slice(1);
        if (extraColors.length > 0) {
          const bodies = extraColors.map((color) => ({ ...payload, color }));
          const toPost = [];
          const skippedDup = [];
          for (const body of bodies) {
            const k = variantKeyFromBody(body);
            if (existingVariantKeys.has(k)) skippedDup.push(`${body.size} / ${body.color}`);
            else toPost.push(body);
          }
          if (toPost.length === 0) {
            showNotification(
              'That product variant is already included (same brand, model, size, and color). No duplicate rows were added.',
              'error',
            );
          } else {
            await Promise.all(toPost.map((body) => api.post('/products/', body)));
            if (skippedDup.length > 0) {
              showNotification(
                `Product updated. Added ${toPost.length} new variant(s). Skipped ${skippedDup.length} already in the catalog.`,
                'success',
              );
            } else {
              showNotification(
                `Product updated. Created ${toPost.length} additional color variant${toPost.length !== 1 ? 's' : ''}.`,
                'success',
              );
            }
          }
        } else {
          showNotification('Product updated.', 'success');
        }
      } else {
        if (selectedSizes.length === 0) {
          showNotification('Please select at least one size.', 'error');
          return;
        }
        if (selectedColors.length === 0) {
          showNotification('Please select at least one color.', 'error');
          return;
        }
        const combos = [];
        for (const size of selectedSizes) {
          for (const color of selectedColors) {
            combos.push({ ...payload, size, color });
          }
        }
        const toCreate = [];
        const skippedDup = [];
        for (const body of combos) {
          const k = variantKeyFromBody(body);
          if (existingVariantKeys.has(k)) skippedDup.push(`${body.size} / ${body.color}`);
          else toCreate.push(body);
        }
        if (toCreate.length === 0) {
          showNotification(
            'This product has already been included (same brand, model, size, and color).',
            'error',
          );
          return;
        }
        await Promise.all(toCreate.map((body) => api.post('/products/', body)));
        if (skippedDup.length > 0) {
          showNotification(
            `Created ${toCreate.length} product${toCreate.length !== 1 ? 's' : ''}. Skipped ${skippedDup.length} variant${skippedDup.length !== 1 ? 's' : ''} already in the catalog.`,
            'success',
          );
        } else {
          showNotification(
            `Created ${toCreate.length} product${toCreate.length !== 1 ? 's' : ''} (${selectedSizes.length} size${
              selectedSizes.length !== 1 ? 's' : ''
            } × ${selectedColors.length} color${selectedColors.length !== 1 ? 's' : ''}).`,
            'success',
          );
        }
      }
      setShowForm(false);
      setEditingProduct(null);
      setIsNewBrand(false);
      setIsNewModel(false);
      setIsNewCategory(false);
      setSelectedSizes([]);
      setSelectedColors([]);
      setPendingCustomColor('');
      setPendingCustomSize('');
      setColorDropdownOpen(false);
      setSizeDropdownOpen(false);
      setFormData({
        name: '',
        category: '',
        brand: '',
        model: '',
        size: '',
        color: '',
      });
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      const msg =
        error.response?.data?.selling_price?.[0] ||
        apiErrorMessage(error, 'Error saving product');
      showNotification(msg, 'error');
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setIsNewBrand(false);
    setIsNewModel(false);
    setIsNewCategory(false);
    setSelectedSizes([]);
    const initialColor = product.color != null ? String(product.color).trim() : '';
    setSelectedColors(initialColor ? [initialColor] : []);
    setPendingCustomColor('');
    setPendingCustomSize('');
    setColorDropdownOpen(false);
    setSizeDropdownOpen(false);
    setFormData({
      name: product.name,
      category: product.category || '',
      brand: product.brand,
      model: product.model,
      size: product.size,
      color: product.color,
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

  const productSort = useClientTableSort(PRODUCTS_SORT_ACCESSORS);
  const displayProducts = useMemo(
    () => productSort.sortRows(filteredProducts),
    [filteredProducts, productSort]
  );

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
            setIsNewCategory(false);
            setSelectedSizes([]);
            setSelectedColors([]);
            setPendingCustomColor('');
            setPendingCustomSize('');
            setColorDropdownOpen(false);
            setSizeDropdownOpen(false);
            setFormData({
              name: '',
              category: '',
              brand: '',
              model: '',
              size: '',
              color: '',
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
                    <optgroup label="Letter sizes">
                      {LETTER_SIZES.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Number sizes (36–46)">
                      {NUMERIC_SIZES.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </optgroup>
                    {formData.size && !ALL_EDITOR_SIZE_OPTIONS.includes(formData.size) && (
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
                          : sortSizesCanonical(selectedSizes).join(', ')}
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
                        display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
                      }}>
                        <div style={{
                          flexBasis: '100%',
                          marginBottom: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#555',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}>
                          Letter sizes
                        </div>
                        {LETTER_SIZES.map((size) => {
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
                        <div style={{
                          flexBasis: '100%',
                          marginTop: '10px',
                          marginBottom: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#555',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}>
                          Number sizes (36–46)
                        </div>
                        {NUMERIC_SIZES.map((size) => {
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
                        {pickerExtraSizes.length > 0 && (
                          <>
                            <div style={{
                              flexBasis: '100%',
                              marginTop: '10px',
                              marginBottom: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#555',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}>
                              Saved & other sizes
                            </div>
                            {pickerExtraSizes.map((size) => {
                              const isSelected = selectedSizes.includes(size);
                              return (
                                <div
                                  key={`extra-${size}`}
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
                          </>
                        )}
                        <div style={{
                          flexBasis: '100%',
                          marginTop: '10px',
                          paddingTop: '10px',
                          borderTop: '1px solid #eee',
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}>
                          <input
                            type="text"
                            placeholder="Custom size (e.g. 37.5, 3XL)"
                            value={pendingCustomSize}
                            onChange={(e) => setPendingCustomSize(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPendingCustomSize();
                              }
                            }}
                            maxLength={20}
                            style={{
                              flex: 1,
                              minWidth: '140px',
                              padding: '6px 10px',
                              border: '1px solid #ccc',
                              borderRadius: '4px',
                            }}
                          />
                          <button
                            type="button"
                            className="btn-edit"
                            onClick={(e) => {
                              e.preventDefault();
                              addPendingCustomSize();
                            }}
                          >
                            Add size
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>
                  Color
                  <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em', marginLeft: '6px' }}>
                    — click to select multiple
                  </span>
                </label>
                <div ref={colorDropdownRef} style={{ position: 'relative' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setColorDropdownOpen((prev) => !prev);
                      }
                    }}
                    onClick={() => setColorDropdownOpen((prev) => !prev)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      background: '#fff',
                      cursor: 'pointer',
                      userSelect: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      minHeight: '38px',
                    }}
                  >
                    <span style={{ color: selectedColors.length === 0 ? '#999' : '#333' }}>
                      {selectedColors.length === 0
                        ? 'Select colors...'
                        : selectedColors
                            .slice()
                            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                            .join(', ')}
                    </span>
                    <span style={{ fontSize: '0.75em', color: '#666' }}>{colorDropdownOpen ? '▲' : '▼'}</span>
                  </div>
                  {colorDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        background: '#fff',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        marginTop: '2px',
                        padding: '8px',
                        maxHeight: '280px',
                        overflowY: 'auto',
                      }}
                    >
                      <div
                        role="listbox"
                        aria-label="Colors"
                        aria-multiselectable="true"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0',
                          border: '1px solid #eee',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          marginBottom: '4px',
                        }}
                      >
                        {pickerColorOptions.map((c, idx) => {
                          const isSelected = selectedColors.includes(c);
                          const isLast = idx === pickerColorOptions.length - 1;
                          return (
                            <label
                              key={c}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                userSelect: 'none',
                                fontSize: '0.95em',
                                borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
                                background: isSelected ? '#e8f4fd' : '#fff',
                                transition: 'background 0.12s',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleColor(c)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                              />
                              <span
                                style={{
                                  flex: 1,
                                  fontWeight: isSelected ? 600 : 400,
                                  color: '#222',
                                }}
                              >
                                {c}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div
                        style={{
                          marginTop: '10px',
                          paddingTop: '10px',
                          borderTop: '1px solid #eee',
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Custom color name"
                          value={pendingCustomColor}
                          onChange={(e) => setPendingCustomColor(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addPendingCustomColor();
                            }
                          }}
                          maxLength={100}
                          style={{
                            flex: 1,
                            minWidth: '140px',
                            padding: '6px 10px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                          }}
                        />
                        <button
                          type="button"
                          className="btn-edit"
                          onClick={(e) => {
                            e.preventDefault();
                            addPendingCustomColor();
                          }}
                        >
                          Add color
                        </button>
                      </div>
                    </div>
                  )}
                  {!editingProduct && selectedSizes.length > 0 && selectedColors.length > 0 && (
                    <small style={{ color: '#1976d2', marginTop: '6px', display: 'block' }}>
                      {selectedSizes.length} size{selectedSizes.length !== 1 ? 's' : ''} × {selectedColors.length}{' '}
                      color{selectedColors.length !== 1 ? 's' : ''} = {selectedSizes.length * selectedColors.length}{' '}
                      product{selectedSizes.length * selectedColors.length !== 1 ? 's' : ''} will be created
                    </small>
                  )}
                  {editingProduct && selectedColors.length > 1 && (
                    <small style={{ color: '#1976d2', marginTop: '6px', display: 'block' }}>
                      This row keeps the first selected color (after your edits); each extra color creates a new product
                      with the same brand, model, and size.
                    </small>
                  )}
                </div>
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
              {(() => {
                const sortedSizes = getUniqueValues(products, 'size');
                const { letters, nums, other } = partitionSizesForUiGroups(sortedSizes);
                return (
                  <>
                    {letters.length > 0 ? (
                      <optgroup label="Letter sizes">
                        {letters.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {nums.length > 0 ? (
                      <optgroup label="Number sizes">
                        {nums.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {other.length > 0 ? (
                      <optgroup label="Other sizes">
                        {other.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </>
                );
              })()}
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
              onClick={() => setFilters({ category: '', brand: '', model: '', size: '', color: '', year: '', month: '' })}
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
              <SortableTh columnId="id" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                ID
              </SortableTh>
              <SortableTh columnId="category" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                Category
              </SortableTh>
              <SortableTh columnId="brand" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                Brand
              </SortableTh>
              <SortableTh columnId="model" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                Model
              </SortableTh>
              <SortableTh columnId="size" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                Size
              </SortableTh>
              <SortableTh columnId="color" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                Color
              </SortableTh>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center' }}>
                  No products found
                </td>
              </tr>
            ) : (
              displayProducts.map((product) => {
                return (
                <tr key={product.id}>
                  <td>#{product.id}</td>
                  <td>{product.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{product.brand}</td>
                  <td>{product.model}</td>
                  <td><strong>{product.size}</strong></td>
                  <td><strong>{product.color}</strong></td>
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
              <td colSpan="7" style={{ textAlign: 'right', color: '#718096', fontSize: '0.85em' }}>
                {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Products;

