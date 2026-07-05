import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { productCostPickerLabel } from '../utils/productCost';
import { plannedSellingSummary } from '../utils/orderPlannedPricing';
import SortableTh from '../components/SortableTh';
import ProductCatalogFilterFields from '../components/ProductCatalogFilterFields';
import { matchesProductCatalogFilters } from '../utils/productFilterUtils';
import { useClientTableSort } from '../utils/tableSort';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';
import PageTitle from '../components/PageTitle';
import './TablePage.css';

const PRODUCT_CATEGORY_TYPE_VALUES = ['sports', 'casual'];

const categoryTypeLabel = (value, t) =>
  value ? t(`categoryTypes.${value}`, { defaultValue: '' }) : '';

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
  category_type: (it) => String(it.product_detail?.category_type ?? '').toLowerCase(),
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
  const { t, tStatus, monthOptions } = useAppTranslation(['inventory', 'common', 'status']);
  const { hasPermission } = usePermissions();
  const productCategoryTypes = useMemo(
    () => PRODUCT_CATEGORY_TYPE_VALUES.map((value) => ({ value, label: t(`categoryTypes.${value}`) })),
    [t],
  );
  const canAddInventory = hasPermission('inventory.create');
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formCategoryType, setFormCategoryType] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [filters, setFilters] = useState({
    category_type: '',
    category: '',
    brand: '',
    model: '',
    sizes: [],
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
    selling_usd_per_unit: '',
    unit_supplier_cost_usd: '',
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
    
    if (filters.category_type) {
      filtered = filtered.filter(
        (item) => item.product_detail?.category_type === filters.category_type,
      );
    }
    filtered = filtered.filter((item) => matchesProductCatalogFilters(item.product_detail, filters));
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
    if (!e.target.reportValidity()) return;
    const qty = parseInt(formData.quantity, 10) || 0;
    const usd = parseFloat(formData.unit_supplier_cost_usd) || 0;
    const sellingUsd = parseFloat(formData.selling_usd_per_unit) || 0;
    if (qty < 1) {
      alert(t('notifications.errQuantity'));
      return;
    }
    if (!(sellingUsd > 0)) {
      alert(t('notifications.errSellingPrice'));
      return;
    }
    if (!(usd > 0)) {
      alert(t('notifications.errSupplierCost'));
      return;
    }
    try {
      const payload = {
        product: formData.product,
        quantity: qty,
        status: formData.status,
        location: formData.location,
        selling_usd_per_unit: sellingUsd,
        unit_supplier_cost_usd: usd,
      };
      await api.post('/inventory/', payload);
      setShowForm(false);
      setFormCategoryType('');
      setFormCategory('');
      setFormData({
        product: '',
        quantity: '',
        status: 'in_inventory',
        location: '',
        selling_usd_per_unit: '',
        unit_supplier_cost_usd: '',
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
        t('notifications.errSave');
      alert(msg);
    }
  };

  if (loading) {
    return <div className="page-container">{t('actions.loading', { ns: 'common' })}</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <PageTitle ns="inventory" />
        {canAddInventory && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? t('actions.cancel', { ns: 'common' }) : `+ ${t('addItem')}`}
          </button>
        )}
      </div>

      {showForm && canAddInventory && (
        <div className="form-card">
          <h2>{t('newItem')}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  {t('form.categoryType')}{' '}
                  <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>
                    {t('filters.filterProductsHint')}
                  </span>
                </label>
                <select
                  value={formCategoryType}
                  onChange={(e) => {
                    setFormCategoryType(e.target.value);
                    setFormCategory('');
                    setFormData({ ...formData, product: '' });
                  }}
                >
                  <option value="">{t('filters.allTypes')}</option>
                  {productCategoryTypes.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>
                  {t('form.category')}{' '}
                  <span style={{ color: '#888', fontWeight: 400, fontSize: '0.85em' }}>
                    {t('filters.filterProductsHint')}
                  </span>
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => { setFormCategory(e.target.value); setFormData({ ...formData, product: '' }); }}
                >
                  <option value="">{t('filters.allCategories')}</option>
                  {[...new Set(
                    products
                      .filter((p) => !formCategoryType || p.category_type === formCategoryType)
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
              <div className="form-group">
                <label>{t('form.product')}</label>
                <select
                  value={formData.product}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const p = products.find((x) => String(x.id) === pid);
                    const sp = p?.selling_price != null ? parseFloat(p.selling_price) : NaN;
                    setFormData({
                      ...formData,
                      product: pid,
                      selling_usd_per_unit:
                        Number.isFinite(sp) && sp > 0 ? sp.toFixed(2) : formData.selling_usd_per_unit,
                    });
                  }}
                  required
                >
                  <option value="">{t('form.selectProduct')}</option>
                  {products
                    .filter(
                      (p) =>
                        (!formCategoryType || p.category_type === formCategoryType) &&
                        (!formCategory || p.category === formCategory),
                    )
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
                <label>{t('quantity')}</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  {t('form.sellingPriceUsd')}{' '}
                  <span style={{ color: '#e53e3e' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={t('form.usdPerUnit')}
                  value={formData.selling_usd_per_unit}
                  onChange={(e) => setFormData({ ...formData, selling_usd_per_unit: e.target.value })}
                  required
                />
                {parseFloat(formData.selling_usd_per_unit) > 0 && parseInt(formData.quantity, 10) > 0 && (
                  <span className="orders-field-hint">
                    {t('form.lineTotalUsd', {
                      amount: (parseFloat(formData.selling_usd_per_unit) * parseInt(formData.quantity, 10)).toFixed(2),
                    })}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>
                  {t('form.costPerUnitUsd')}{' '}
                  <span style={{ color: '#e53e3e' }}>*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('form.usdPerUnit')}
                  value={formData.unit_supplier_cost_usd}
                  onChange={(e) =>
                    setFormData({ ...formData, unit_supplier_cost_usd: e.target.value })
                  }
                  required
                />
                {parseFloat(formData.unit_supplier_cost_usd) > 0 && parseInt(formData.quantity, 10) > 0 && (
                  <span className="orders-field-hint">
                    {t('form.lineTotalUsd', {
                      amount: (parseFloat(formData.unit_supplier_cost_usd) * parseInt(formData.quantity, 10)).toFixed(2),
                    })}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>{t('form.status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  {['in_inventory', 'reserved', 'sold', 'returned'].map((st) => (
                    <option key={st} value={st}>
                      {tStatus(st, 'inventory')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('form.locationOptional')}</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('form.create')}
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
            <label>{t('form.categoryType')}</label>
            <select
              value={filters.category_type}
              onChange={(e) => setFilters({ ...filters, category_type: e.target.value })}
            >
              <option value="">{t('filters.allTypes')}</option>
              {productCategoryTypes.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>
          <ProductCatalogFilterFields
            filters={filters}
            onFiltersChange={setFilters}
            options={{
              categories: [
                ...new Set(
                  inventory
                    .filter(
                      (i) =>
                        !filters.category_type ||
                        i.product_detail?.category_type === filters.category_type,
                    )
                    .map((i) => i.product_detail?.category)
                    .filter(Boolean),
                ),
              ].sort(),
              brands: getUniqueValues(inventory, 'brand'),
              models: getUniqueValues(inventory, 'model'),
              sizes: getUniqueValues(inventory, 'size'),
              colors: getUniqueValues(inventory, 'color'),
            }}
            t={t}
            fieldLabels={{
              category: t('form.category'),
              brand: t('table.brand'),
              model: t('table.model'),
              size: t('table.size'),
              color: t('table.color'),
            }}
            emptyLabels={{
              category: t('filters.allCategories'),
              brand: t('filters.allBrands'),
              model: t('filters.allModels'),
              size: t('filters.allSizes'),
              color: t('filters.allColors'),
            }}
          />
          <div className="filter-field">
            <label>{t('form.status')}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">{t('filters.allStatuses')}</option>
              {['in_inventory', 'reserved', 'sold', 'returned'].map((st) => (
                <option key={st} value={st}>
                  {tStatus(st, 'inventory')}
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
                  sizes: [],
                  color: '',
                  status: '',
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
              <SortableTh columnId="category_type" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.categoryType')}
              </SortableTh>
              <SortableTh columnId="category" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.category')}
              </SortableTh>
              <SortableTh columnId="rec_no" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.recNo')}
              </SortableTh>
              <SortableTh columnId="brand" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.brand')}
              </SortableTh>
              <SortableTh columnId="model" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.model')}
              </SortableTh>
              <SortableTh columnId="size" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.size')}
              </SortableTh>
              <SortableTh columnId="color" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.color')}
              </SortableTh>
              <SortableTh columnId="layer" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.layerNo')}
              </SortableTh>
              <SortableTh columnId="cost_uzs" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.landedCostUzs')}
              </SortableTh>
              <SortableTh columnId="cost_usd" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.landedCostUsd')}
              </SortableTh>
              <SortableTh columnId="selling" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.sellingPerUnit')}
              </SortableTh>
              <SortableTh columnId="quantity" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('quantity')}
              </SortableTh>
              <SortableTh columnId="status" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('form.status')}
              </SortableTh>
              <SortableTh columnId="location" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.location')}
              </SortableTh>
              <SortableTh columnId="updated_at" sortCol={invSort.sortCol} sortDir={invSort.sortDir} onSort={invSort.onHeaderClick}>
                {t('table.updated')}
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan="15" style={{ textAlign: 'center' }}>
                  {t('noStock')}
                </td>
              </tr>
            ) : (
              displayInventory.map((item) => {
                const cost = layerLandedCostCells(item);
                const sell = inventorySellingCell(item.product_detail, item.stocking_order);
                const sellTip = plannedSellingSummary(item.stocking_order) || '';
                return (
                <tr key={item.batch_id}>
                  <td>
                    {categoryTypeLabel(item.product_detail?.category_type, t) || (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td>{item.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
                  <td><strong>#{item.product_detail?.id ?? item.product}</strong></td>
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
                      {tStatus(item.status, 'inventory')}
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
                {t('table.total')}
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

