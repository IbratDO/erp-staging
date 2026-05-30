import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';
import PageTitle from '../components/PageTitle';
import './TablePage.css';

const PRODUCT_CATEGORY_TYPE_VALUES = ['sports', 'casual'];

const categoryTypeLabel = (value, t) =>
  value ? t(`categoryTypes.${value}`, { defaultValue: '' }) : '';

const PRODUCTS_SORT_ACCESSORS = {
  id: (p) => Number(p.id) || 0,
  category_type: (p) => String(p.category_type ?? '').toLowerCase(),
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

/** Normalize size input: comma decimal separators become dot (e.g. 41,5 → 41.5). */
function normalizeSizeValue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return trimmed;
  if (/^-?\d+,\d+$/.test(trimmed)) {
    return trimmed.replace(',', '.');
  }
  return trimmed;
}

function isNumericSize(value) {
  return /^-?\d+(\.\d+)?$/.test(normalizeSizeValue(value));
}

function sortLetterSizes(values) {
  return [...new Set(values)].filter(Boolean).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }),
  );
}

function sortNumberSizes(values) {
  return [...new Set(values)].filter(Boolean).sort(
    (a, b) => Number(normalizeSizeValue(a)) - Number(normalizeSizeValue(b)),
  );
}

/** Letters A–Z, then numbers ascending (summary label / filters). */
function sortSizesCanonical(values) {
  const uniq = [...new Set(values)].filter(Boolean);
  const letters = uniq.filter((s) => !isNumericSize(s));
  const nums = uniq.filter(isNumericSize);
  return [...sortLetterSizes(letters), ...sortNumberSizes(nums)];
}

/** Split size list for grouped selects: letter vs number. */
function partitionSizesForUiGroups(sortedSizesFlat) {
  const letters = [];
  const nums = [];
  for (const s of sortedSizesFlat) {
    if (!s) continue;
    if (isNumericSize(s)) nums.push(s);
    else letters.push(s);
  }
  return {
    letters: sortLetterSizes(letters),
    nums: sortNumberSizes(nums),
  };
}

/** Custom sizes from inventory + current selection, excluding preset chips. */
function customSizesFromProductsAndSelection(products, selectedSizes) {
  const fromDb = products
    .map((p) => String(p.size ?? '').trim())
    .filter(Boolean);
  return [...new Set([...fromDb, ...selectedSizes])].filter(
    (s) => !ALL_EDITOR_SIZE_OPTIONS.includes(s),
  );
}

function apiErrorMessage(error, fallback) {
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
  const { t, monthOptions } = useAppTranslation(['products', 'common']);
  const { hasPermission } = usePermissions();

  const productCategoryTypes = useMemo(
    () => PRODUCT_CATEGORY_TYPE_VALUES.map((value) => ({ value, label: t(`categoryTypes.${value}`) })),
    [t],
  );
  const canCreate = hasPermission('products.create');
  const canUpdate = hasPermission('products.update');
  const canDelete = hasPermission('products.delete');
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
    category_type: '',
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
    category_type: '',
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
    const normalized = normalizeSizeValue(raw);
    if (normalized.length > 20) {
      showNotification(t('notifications.errSizeMax'), 'error');
      return;
    }
    setSelectedSizes((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
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

    if (filters.category_type) {
      filtered = filtered.filter((p) => p.category_type === filters.category_type);
    }
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

  /** Preset + saved/custom letter sizes (alphabetical), including sizes added this session. */
  const pickerLetterSizes = useMemo(() => {
    const extras = customSizesFromProductsAndSelection(products, selectedSizes).filter(
      (s) => !isNumericSize(s),
    );
    const editExtra =
      editingProduct && formData.size && !isNumericSize(formData.size) ? [formData.size] : [];
    return sortLetterSizes([...new Set([...LETTER_SIZES, ...extras, ...editExtra])]);
  }, [products, selectedSizes, editingProduct, formData.size]);

  /** Preset + saved/custom number sizes (ascending), including sizes added this session. */
  const pickerNumericSizes = useMemo(() => {
    const extras = customSizesFromProductsAndSelection(products, selectedSizes).filter(isNumericSize);
    const editExtra =
      editingProduct && formData.size && isNumericSize(formData.size) ? [formData.size] : [];
    return sortNumberSizes([...new Set([...NUMERIC_SIZES, ...extras, ...editExtra])]);
  }, [products, selectedSizes, editingProduct, formData.size]);

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
    if (!payload.category_type) payload.category_type = null;
    if (payload.size) payload.size = normalizeSizeValue(payload.size);
    try {
      if (editingProduct) {
        if (selectedColors.length === 0) {
          showNotification(t('notifications.errSelectColor'), 'error');
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
            showNotification(t('notifications.errVariantExistsNoAdd'), 'error');
          } else {
            await Promise.all(toPost.map((body) => api.post('/products/', body)));
            if (skippedDup.length > 0) {
              showNotification(
                t('notifications.updatedWithVariants', {
                  added: toPost.length,
                  skipped: skippedDup.length,
                }),
                'success',
              );
            } else {
              showNotification(
                t('notifications.updatedWithVariantsSimple', { count: toPost.length }),
                'success',
              );
            }
          }
        } else {
          showNotification(t('notifications.updated'), 'success');
        }
      } else {
        if (!String(formData.category_type || '').trim()) {
          showNotification(t('notifications.errCategoryType'), 'error');
          return;
        }
        if (!String(formData.category || '').trim()) {
          showNotification(t('notifications.errCategory'), 'error');
          return;
        }
        if (!String(formData.brand || '').trim()) {
          showNotification(t('notifications.errBrand'), 'error');
          return;
        }
        if (!String(formData.model || '').trim()) {
          showNotification(t('notifications.errModel'), 'error');
          return;
        }
        if (selectedSizes.length === 0) {
          showNotification(t('notifications.errSelectSize'), 'error');
          return;
        }
        if (selectedColors.length === 0) {
          showNotification(t('notifications.errSelectColor'), 'error');
          return;
        }
        const combos = [];
        for (const size of selectedSizes) {
          for (const color of selectedColors) {
            combos.push({ ...payload, size: normalizeSizeValue(size), color });
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
          showNotification(t('notifications.errAlreadyIncluded'), 'error');
          return;
        }
        await Promise.all(toCreate.map((body) => api.post('/products/', body)));
        if (skippedDup.length > 0) {
          showNotification(
            t('notifications.createdWithSkipped', {
              created: toCreate.length,
              skipped: skippedDup.length,
            }),
            'success',
          );
        } else {
          showNotification(
            t('notifications.createdCombo', {
              count: toCreate.length,
              sizes: selectedSizes.length,
              colors: selectedColors.length,
            }),
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
        category_type: '',
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
        apiErrorMessage(error, t('notifications.errSave'));
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
      category_type: product.category_type || '',
      category: product.category || '',
      brand: product.brand,
      model: product.model,
      size: product.size,
      color: product.color,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('notifications.confirmDelete'))) {
      try {
        await api.delete(`/products/${id}/`);
        fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        alert(t('notifications.errDelete'));
      }
    }
  };

  const productSort = useClientTableSort(PRODUCTS_SORT_ACCESSORS);
  const displayProducts = useMemo(
    () => productSort.sortRows(filteredProducts),
    [filteredProducts, productSort]
  );

  if (loading) {
    return <div className="page-container">{t('actions.loading', { ns: 'common' })}</div>;
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
        <PageTitle ns="products" />
        {canCreate && (
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
              category_type: '',
              category: '',
              brand: '',
              model: '',
              size: '',
              color: '',
            });
          }
        }}>
          {showForm ? t('actions.cancel', { ns: 'common' }) : `+ ${t('addProduct')}`}
        </button>
        )}
      </div>

      {showForm && (canCreate || (canUpdate && editingProduct)) && (
        <div className="form-card">
          <h2>{editingProduct ? t('editProduct') : t('newProduct')}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  {t('categoryType')}{' '}
                  {!editingProduct && <span style={{ color: '#e53e3e' }}>*</span>}
                </label>
                <select
                  value={formData.category_type}
                  onChange={(e) => setFormData({ ...formData, category_type: e.target.value })}
                  required={!editingProduct}
                >
                  {editingProduct ? <option value="">{t('form.none')}</option> : null}
                  {!editingProduct ? <option value="">{t('form.selectCategoryType')}</option> : null}
                  {productCategoryTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>
                  {t('category')}{' '}
                  {editingProduct ? (
                    <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>{t('form.optional')}</span>
                  ) : (
                    <span style={{ color: '#e53e3e' }}>*</span>
                  )}
                </label>
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
                    required={!editingProduct}
                  >
                    {editingProduct ? <option value="">{t('form.none')}</option> : null}
                    {!editingProduct ? <option value="">{t('form.selectCategory')}</option> : null}
                    {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__new__">{t('form.addNewCategory')}</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('form.categoryPlaceholder')}
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required={!editingProduct}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => { setIsNewCategory(false); setFormData({ ...formData, category: '' }); }}
                      style={{ padding: '0 10px', background: '#eee', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {t('form.back')}
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>
                  {t('brand')} {!editingProduct && <span style={{ color: '#e53e3e' }}>*</span>}
                </label>
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
                    <option value="">{t('form.selectBrand')}</option>
                    {[...new Set(products.map(p => p.brand).filter(Boolean))].sort().map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                    <option value="__new__">{t('form.addNewBrand')}</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('form.brandPlaceholder')}
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
                      {t('form.back')}
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>
                  {t('model')} {!editingProduct && <span style={{ color: '#e53e3e' }}>*</span>}
                </label>
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
                    <option value="">{t('form.selectModel')}</option>
                    {[...new Set(products.map(p => p.model).filter(Boolean))].sort().map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                    <option value="__new__">{t('form.addNewModel')}</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('form.modelPlaceholder')}
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
                      {t('form.back')}
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>
                  {t('size')}
                  {!editingProduct ? (
                    <>
                      <span style={{ color: '#e53e3e' }}> *</span>
                      <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em', marginLeft: '6px' }}>
                        {t('form.selectAtLeastOne')}
                      </span>
                    </>
                  ) : null}
                </label>
                {editingProduct ? (
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    required
                  >
                    <option value="">{t('form.selectSize')}</option>
                    <optgroup label={t('form.letterSizes')}>
                      {pickerLetterSizes.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('form.numberSizes')}>
                      {pickerNumericSizes.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </optgroup>
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
                          ? t('form.selectSizes')
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
                          {t('form.letterSizes')}
                        </div>
                        {pickerLetterSizes.map((size) => {
                          const isSelected = selectedSizes.includes(size);
                          return (
                            <div
                              key={`letter-${size}`}
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
                          {t('form.numberSizes')}
                        </div>
                        {pickerNumericSizes.map((size) => {
                          const isSelected = selectedSizes.includes(size);
                          return (
                            <div
                              key={`num-${size}`}
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
                          paddingTop: '10px',
                          borderTop: '1px solid #eee',
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}>
                          <input
                            type="text"
                            placeholder={t('form.customSizePlaceholder')}
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
                            {t('form.addSize')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>
                  {t('color')}
                  {!editingProduct ? (
                    <>
                      <span style={{ color: '#e53e3e' }}> *</span>
                      <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em', marginLeft: '6px' }}>
                        {t('form.selectAtLeastOne')}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em', marginLeft: '6px' }}>
                      {t('form.selectMultiple')}
                    </span>
                  )}
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
                        ? t('form.selectColors')
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
                        aria-label={t('color')}
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
                          placeholder={t('form.customColorPlaceholder')}
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
                          {t('form.addColor')}
                        </button>
                      </div>
                    </div>
                  )}
                  {!editingProduct && selectedSizes.length > 0 && selectedColors.length > 0 && (
                    <small style={{ color: '#1976d2', marginTop: '6px', display: 'block' }}>
                      {t('form.comboPreview', {
                        sizes: selectedSizes.length,
                        colors: selectedColors.length,
                        total: selectedSizes.length * selectedColors.length,
                      })}
                    </small>
                  )}
                  {editingProduct && selectedColors.length > 1 && (
                    <small style={{ color: '#1976d2', marginTop: '6px', display: 'block' }}>
                      {t('form.editExtraColors')}
                    </small>
                  )}
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingProduct ? t('form.update') : t('form.create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title">{t('filters.title', { ns: 'common' })}</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>{t('categoryType')}</label>
            <select
              value={filters.category_type}
              onChange={(e) => setFilters({ ...filters, category_type: e.target.value })}
            >
              <option value="">{t('filters.allTypes')}</option>
              {productCategoryTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('category')}</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">{t('filters.allCategories')}</option>
              {[...new Set(
                products
                  .filter((p) => !filters.category_type || p.category_type === filters.category_type)
                  .map((p) => p.category)
                  .filter(Boolean),
              )]
                .sort()
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('brand')}</label>
            <select
              value={filters.brand}
              onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
            >
              <option value="">{t('filters.allBrands')}</option>
              {getUniqueValues(products, 'brand').map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('model')}</label>
            <select
              value={filters.model}
              onChange={(e) => setFilters({ ...filters, model: e.target.value })}
            >
              <option value="">{t('filters.allModels')}</option>
              {getUniqueValues(products, 'model').map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('size')}</label>
            <select
              value={filters.size}
              onChange={(e) => setFilters({ ...filters, size: e.target.value })}
            >
              <option value="">{t('filters.allSizes')}</option>
              {(() => {
                const sortedSizes = getUniqueValues(products, 'size');
                const { letters, nums } = partitionSizesForUiGroups(sortedSizes);
                return (
                  <>
                    {letters.length > 0 ? (
                      <optgroup label={t('form.letterSizes')}>
                        {letters.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {nums.length > 0 ? (
                      <optgroup label={t('form.numberSizes')}>
                        {nums.map((size) => (
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
            <label>{t('color')}</label>
            <select
              value={filters.color}
              onChange={(e) => setFilters({ ...filters, color: e.target.value })}
            >
              <option value="">{t('filters.allColors')}</option>
              {getUniqueValues(products, 'color').map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('filters.year', { ns: 'common' })}</label>
            <select
              value={filters.year}
              onChange={(e) => setFilters({ ...filters, year: e.target.value })}
            >
              <option value="">{t('filters.allYears', { ns: 'common' })}</option>
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
            <label>{t('filters.month', { ns: 'common' })}</label>
            <select
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            >
              {monthOptions.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-toolbar__actions">
            <button
              type="button"
              className="btn-edit"
              onClick={() =>
                setFilters({
                  category_type: '',
                  category: '',
                  brand: '',
                  model: '',
                  size: '',
                  color: '',
                  year: '',
                  month: '',
                })
              }
            >
              {t('actions.clearAll', { ns: 'common' })}
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
                {t('table.id', { ns: 'common' })}
              </SortableTh>
              <SortableTh columnId="category_type" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                {t('categoryType')}
              </SortableTh>
              <SortableTh columnId="category" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                {t('category')}
              </SortableTh>
              <SortableTh columnId="brand" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                {t('brand')}
              </SortableTh>
              <SortableTh columnId="model" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                {t('model')}
              </SortableTh>
              <SortableTh columnId="size" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                {t('size')}
              </SortableTh>
              <SortableTh columnId="color" sortCol={productSort.sortCol} sortDir={productSort.sortDir} onSort={productSort.onHeaderClick}>
                {t('color')}
              </SortableTh>
              <th>{t('table.actions', { ns: 'common' })}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>
                  {t('noProducts')}
                </td>
              </tr>
            ) : (
              displayProducts.map((product) => {
                return (
                <tr key={product.id}>
                  <td>#{product.id}</td>
                  <td>
                    {categoryTypeLabel(product.category_type, t) || (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td>{product.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>{product.brand}</td>
                  <td>{product.model}</td>
                  <td><strong>{product.size}</strong></td>
                  <td><strong>{product.color}</strong></td>
                  <td>
                    {canUpdate && (
                    <button
                      className="btn-edit"
                      onClick={() => handleEdit(product)}
                    >
                      {t('actions.edit', { ns: 'common' })}
                    </button>
                    )}
                    {canDelete && (
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(product.id)}
                    >
                      {t('actions.delete', { ns: 'common' })}
                    </button>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="8" style={{ textAlign: 'right', color: '#718096', fontSize: '0.85em' }}>
                {t('productCount', { count: filteredProducts.length })}
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

