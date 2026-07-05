import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import i18n from '../i18n';
import {
  formatDisplayAmount,
  formatPlainAmount,
  cashBalanceTotalByCurrency,
  formatInsufficientLedgerMessage,
} from '../utils/currencyFormat';
import SaleCompletePayForm from '../components/SaleCompletePayForm';
import SaleDeliverySettlementForm from '../components/SaleDeliverySettlementForm';
import { shopDeliverySettlementRequired } from '../utils/saleCompletePayHelpers';
import ShopDeliverySettlementButtons from '../components/ShopDeliverySettlementButtons';
import ProductSearchableSelect from '../components/ProductSearchableSelect';
import CustomerSearchableSelect from '../components/CustomerSearchableSelect';
import ProductCatalogFilterFields from '../components/ProductCatalogFilterFields';
import { matchesProductCatalogFilters } from '../utils/productFilterUtils';
import { layerSalePickerLabel, resolveLayerListPrice } from '../utils/productCost';
import {
  computeAdvanceRemainingDue,
  saleHasOrderAdvance,
  computeReservedPaymentMeta,
  buildSplitCurrencyConfirmMessage,
} from '../utils/saleCompletePayHelpers';
import { runSalePaymentSubmitFlow } from '../utils/salePaymentFlowHelpers';
import useCbuExchangeRate from '../hooks/useCbuExchangeRate';
import { usePermissions } from '../hooks/usePermissions';
import './TablePage.css';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import PageTitle from '../components/PageTitle';
import useAppTranslation from '../hooks/useAppTranslation';
import {
  buildSaleDisplayRows,
  aggregateGroupSales,
  buildCombinedSaleForGroup,
  saleLikeForDisplayRow,
  sumSalesDiscountTotals,
  saleDiscountTotalAmount,
} from '../utils/saleGroupDisplay';

const PRODUCT_CATEGORY_TYPE_VALUES = ['sports', 'casual'];

function formatBatchCreateError(data, t) {
  if (!data) return t('notifications.errBatchCreate');
  if (data.item_errors?.length) {
    const row = data.item_errors[0];
    if (row.error) return row.error;
    if (row.errors && typeof row.errors === 'object') {
      const key = Object.keys(row.errors)[0];
      const val = row.errors[key];
      const msg = Array.isArray(val) ? val[0] : val;
      return `${key.replace(/_/g, ' ')}: ${msg}`;
    }
  }
  return data.error || data.detail || t('notifications.errBatchCreate');
}

/** Column accessors — match main sales grid header `columnId`s. Actions column excluded. */
const SALE_SORT_ACCESSORS = {
  id: (s) => Number(s.id) || 0,
  status: (s) => String(s.status ?? '').toLowerCase(),
  category_type: (s) => String(s.product_detail?.category_type ?? '').toLowerCase(),
  category: (s) => String(s.product_detail?.category ?? '').toLowerCase(),
  product: (s) =>
    s.product_detail
      ? `${s.product_detail.brand ?? ''} ${s.product_detail.model ?? ''}`.trim().toLowerCase()
      : String(s.product ?? '').toLowerCase(),
  brand: (s) => String(s.product_detail?.brand ?? '').toLowerCase(),
  model: (s) => String(s.product_detail?.model ?? '').toLowerCase(),
  size: (s) => String(s.product_detail?.size ?? '').toLowerCase(),
  color: (s) => String(s.product_detail?.color ?? '').toLowerCase(),
  sale_type: (s) => String(s.sale_type ?? '').toLowerCase(),
  package: (s) => {
    const lines = s.package_lines;
    if (Array.isArray(lines) && lines.length) {
      return lines.map((pl) => `${pl.package_type ?? ''}:${pl.quantity ?? ''}`).join('|').toLowerCase();
    }
    if (s.package_type) {
      const q = s.package_quantity != null ? s.package_quantity : s.quantity;
      return `${String(s.package_type)}:${q}`.toLowerCase();
    }
    return '';
  },
  quantity: (s) => parseInt(s.quantity, 10) || 0,
  selling_price: (s) => parseFloat(s.selling_price) || 0,
  total_amount: (s) => parseFloat(s.total_amount) || 0,
  discount_credit: (s) =>
    `${saleDiscountTotalAmount(s)}:${String(s.balance_shortfall_type ?? '')}:${parseFloat(s.balance_shortfall_amount) || 0}`,
  uzs_pay: (s) =>
    (parseFloat(s.payment_uzs_cash) || 0) + (parseFloat(s.payment_uzs_card) || 0),
  usd_pay: (s) =>
    (parseFloat(s.payment_usd_cash) || 0) + (parseFloat(s.payment_usd_card) || 0),
  customer: (s) => String(s.customer_detail?.name ?? '').toLowerCase(),
  phone: (s) => String(s.customer_detail?.telephone ?? '').toLowerCase(),
  salesman: (s) => String(s.salesman_detail?.username ?? '').toLowerCase(),
  dispatcher: (s) => {
    const d = s.dispatch_info;
    if (!d) return '';
    if (d.dispatch_type === 'bts' && !d.dispatcher_name) return 'bts';
    return String(d.dispatcher_name ?? '').toLowerCase();
  },
  sale_date: (s) => new Date(s.display_date || s.sale_date).getTime() || 0,
};

const SALE_DISPLAY_SORT_ACCESSORS = Object.fromEntries(
  Object.entries(SALE_SORT_ACCESSORS).map(([key, fn]) => [
    key,
    (row) => fn(saleLikeForDisplayRow(row)),
  ])
);

/** Main sales grid column count (must match thead). */
const SALES_TABLE_COLUMN_COUNT = 22;
/** Footer label spans id → package (inclusive); quantity is the next column. */
const SALES_FOOTER_LABEL_COL_SPAN = 12;

function saleRowBackground(sale) {
  if (sale.balance_shortfall_type === 'on_credit') return '#ffebee';
  if (sale.balance_shortfall_type === 'discount') return '#fff3e0';
  return undefined;
}

function renderDiscountCreditCell(sale, t) {
  const saleDiscount = parseFloat(sale.total_discount_amount) || 0;
  const parts = [];
  if (saleDiscount > 0) {
    parts.push(`${t('discount.label')}: ${formatDisplayAmount(saleDiscount, sale.sale_currency || 'USD')}`);
  }
  if (sale.balance_shortfall_type === 'discount' && sale.balance_shortfall_amount) {
    parts.push(
      `${t('discount.atCompletion')}: ${formatDisplayAmount(
        sale.balance_shortfall_amount,
        sale.balance_shortfall_currency || sale.sale_currency || 'USD'
      )}`
    );
  } else if (sale.balance_shortfall_type === 'on_credit' && sale.balance_shortfall_amount) {
    parts.push(
      `${t('discount.onCredit')}: ${formatDisplayAmount(
        sale.balance_shortfall_amount,
        sale.balance_shortfall_currency || sale.sale_currency || 'USD'
      )}`
    );
  }
  return parts.length ? parts.join(' · ') : '—';
}

function renderPackageCell(sale, packages) {
  if (sale.package_lines && sale.package_lines.length > 0) {
    return (
      <span style={{ fontSize: '0.85em' }}>
        {sale.package_lines.map((pl, i) => {
          const pkg = packages.find((p) => p.package_type === pl.package_type);
          const costUsd = pkg ? Number(pkg.cost_per_unit_usd) * pl.quantity : 0;
          const costUzs = pkg ? Number(pkg.cost_per_unit_uzs) * pl.quantity : 0;
          return (
            <span key={pl.id ?? i} style={{ display: 'block', whiteSpace: 'nowrap' }}>
              {pl.package_type} ×{pl.quantity}
              {costUsd > 0 ? ` $${costUsd.toFixed(2)}` : ''}
              {costUzs > 0 ? ` ${costUzs.toLocaleString()} UZS` : ''}
            </span>
          );
        })}
      </span>
    );
  }
  if (sale.package_type) {
    return (
      <span>
        {sale.package_type} ×{sale.package_quantity != null ? sale.package_quantity : sale.quantity}
        {sale.package_cost_per_unit_usd > 0 ? ` $${Number(sale.package_cost_per_unit_usd).toFixed(2)}` : ''}
        {sale.package_cost_per_unit_uzs > 0 ? ` ${Number(sale.package_cost_per_unit_uzs).toLocaleString()} UZS` : ''}
      </span>
    );
  }
  return <span style={{ color: '#bbb' }}>—</span>;
}

function renderDispatcherCell(sale) {
  const d = sale.dispatch_info;
  if (!d) return <span style={{ color: '#bbb' }}>—</span>;
  if (d.dispatch_type === 'bts') return d.dispatcher_name || i18n.t('dispatch.bts', { ns: 'sales' });
  return d.dispatcher_name ? d.dispatcher_name : <span style={{ color: '#bbb' }}>—</span>;
}

function findInventoryLayer(inventoryList, batchId) {
  return inventoryList.find((x) => Number(x.batch_id) === Number(batchId));
}

function productForLayer(layer, products) {
  if (!layer) return null;
  return layer.product_detail || products.find((x) => Number(x.id) === Number(layer.product));
}

function formatSalePriceForCurrency(priceNum, saleCur) {
  if (priceNum == null || !Number.isFinite(priceNum) || priceNum <= 0) return '';
  return saleCur === 'UZS' ? String(Math.round(priceNum)) : String(Number(priceNum.toFixed(2)));
}

function parsePriceNum(str) {
  if (str === '' || str == null) return null;
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatDiscountForCurrency(discNum, saleCur) {
  if (discNum == null || !Number.isFinite(discNum) || discNum <= 0) return '';
  return formatSalePriceForCurrency(discNum, saleCur);
}

/** list = full price; discount = amount off; selling = final price shown in the form. */
function applyListDiscountFinal(listNum, discNum, finalNum, saleCur) {
  const list = listNum != null && listNum >= 0 ? listNum : 0;
  let final = finalNum != null ? finalNum : list - Math.max(0, discNum ?? 0);
  final = Math.max(0, Math.min(final, list));
  const discount = Math.max(0, list - final);
  return {
    list_price: formatSalePriceForCurrency(list, saleCur),
    selling_price: formatSalePriceForCurrency(final, saleCur),
    discount_price: formatDiscountForCurrency(discount, saleCur),
  };
}

// ----- PackageLinesSelector: compact multi-package row editor -----
function PackageLinesSelector({ lines, onChange, packages: pkgList }) {
  const { t } = useAppTranslation('sales');
  const addLine = () =>
    onChange([...lines, { key: `${Date.now()}-${Math.random()}`, package_type: '', quantity: 1 }]);
  const removeLine = (key) => onChange(lines.filter((l) => l.key !== key));
  const updateLine = (key, field, value) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const fieldH = { padding: '10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '14px', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {lines.map((line, idx) => {
        const pkg = pkgList.find((p) => p.package_type === line.package_type);
        const isLow = pkg && pkg.quantity < line.quantity;
        const isLast = idx === lines.length - 1;
        return (
          <div key={line.key} style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
            {/* Type */}
            <select
              value={line.package_type ?? ''}
              onChange={(e) => updateLine(line.key, 'package_type', e.target.value)}
              style={{ ...fieldH, flex: '1 1 0', minWidth: 0, background: 'white',
                       borderColor: isLow ? '#fc8181' : '#ddd' }}
            >
              <option value="">{t('batch.pkgTypePlaceholder')}</option>
              {pkgList.map((p) => (
                <option key={p.id} value={p.package_type}>
                  {p.package_type} ({p.quantity})
                </option>
              ))}
            </select>

            {/* Qty */}
            <input
              type="number"
              min="1"
              value={line.quantity == null || Number.isNaN(line.quantity) ? 1 : line.quantity}
              onChange={(e) => updateLine(line.key, 'quantity', parseInt(e.target.value, 10) || 1)}
              style={{ ...fieldH, width: '62px', textAlign: 'center', flexShrink: 0,
                       borderColor: isLow ? '#fc8181' : '#ddd' }}
            />

            {/* "+ Add type" on last row, remove button on extra rows */}
            {isLast ? (
              <button type="button" onClick={addLine}
                style={{ ...fieldH, border: '1px dashed #90cdf4', background: 'none',
                         color: '#3182ce', cursor: 'pointer', whiteSpace: 'nowrap',
                         flexShrink: 0, transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ebf8ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                + {t('batch.addType')}
              </button>
            ) : (
              <button type="button" onClick={() => removeLine(line.key)}
                title={t('actions.delete', { ns: 'common' })}
                style={{ ...fieldH, border: '1px solid #fed7d7', background: '#fff5f5',
                         color: '#e53e3e', cursor: 'pointer', flexShrink: 0,
                         transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fed7d7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff5f5'; }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_PKG_LINES = () => [{ key: `${Date.now()}`, package_type: '', quantity: 1 }];

const Sales = () => {
  const { t, tStatus, monthOptions } = useAppTranslation(['sales', 'common', 'status']);
  const { hasPermission, hasAnyPermission } = usePermissions();

  const productCategoryTypes = useMemo(
    () =>
      PRODUCT_CATEGORY_TYPE_VALUES.map((value) => ({
        value,
        label: t(`categoryTypes.${value}`),
      })),
    [t],
  );

  const regionChoices = useMemo(
    () =>
      [
        'andijan',
        'bukhara',
        'fergana',
        'jizzakh',
        'kashkadarya',
        'khorezm',
        'namangan',
        'navoi',
        'samarkand',
        'surkhandarya',
        'syrdarya',
        'tashkent_region',
        'karakalpakstan',
        'tashkent_city',
      ].map((value) => ({ value, label: t(`regions.${value}`) })),
    [t],
  );
  const canBatchCreate = hasPermission('sales.batch_create');
  const canCompletePay = hasPermission('sales.complete_pay');
  const canCompleteFromOrder = hasPermission('sales.complete_from_order');
  const canCompleteWithoutPay = hasPermission('sales.complete') && !canCompletePay;
  const canCompleteSale = canCompleteFromOrder || canCompleteWithoutPay || canCompletePay;
  const canDispatch = hasPermission('sales.update_status');
  const canSellReserved = hasPermission('sales.sell_reserved');
  const canCancelReserved = hasPermission('sales.cancel_reserved');
  const canDeliverySettle = hasAnyPermission([
    'sales.delivery_customer_paid',
    'sales.delivery_shop_received',
    'sales.delivery_pay_dispatch_fee',
  ]);
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchFormCategory, setBatchFormCategory] = useState('');
  const [batchCustomer, setBatchCustomer] = useState('');
  const [batchDefaults, setBatchDefaults] = useState({
    sale_type: 'bought_from_shop',
    sale_currency: 'USD',
  });
  const [batchLines, setBatchLines] = useState([]);
  const [filters, setFilters] = useState({
    category_type: '',
    category: '',
    brand: '',
    model: '',
    sizes: [],
    color: '',
    status: '',
    sale_type: '',
    customer: '',
    year: '',
    month: '',
  });
  const [customers, setCustomers] = useState([]);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    telephone: '+998',
    instagram: '',
    region: 'tashkent_city',
  });

  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success', // 'success', 'error', 'info'
  });
  
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 5000);
  };

  useEffect(() => {
    fetchSales();
    fetchProducts();
    fetchInventory();
    fetchCustomers();
    fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const fetchPackages = async () => {
    if (!hasPermission('packages.view')) {
      setPackages([]);
      return;
    }
    try {
      const response = await api.get('/packages/');
      setPackages(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching packages:', error);
      setPackages([]);
    }
  };
  
  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers/', { params: { lite: 1 } });
      setCustomers(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };
  
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    const name = String(newCustomerData.name || '').trim();
    const telephone = String(newCustomerData.telephone || '').trim();
    if (!name) {
      showNotification(t('customer.errName'), 'error');
      return;
    }
    if (!telephone) {
      showNotification(t('customer.errPhone'), 'error');
      return;
    }
    try {
      const response = await api.post('/customers/', {
        ...newCustomerData,
        name,
        telephone,
      });
      await fetchCustomers();
      if (showBatchForm) {
        setBatchCustomer(String(response.data.id));
      }
      setShowCustomerForm(false);
      setNewCustomerData({ name: '', telephone: '+998', instagram: '', region: 'tashkent_city' });
      showNotification(t('customer.created'), 'success');
    } catch (error) {
      console.error('Error creating customer:', error);
      showNotification(error.response?.data?.error || t('customer.errCreate'), 'error');
    }
  };

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales/');
      const salesList = response.data.results || response.data;
      setSales(salesList);
      applyFilters(salesList);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for dropdowns
  const getUniqueValues = (salesList, field) => {
    const values = salesList
      .map(sale => sale.product_detail?.[field])
      .filter(Boolean);
    return [...new Set(values)].sort();
  };

  const customerFilterOptions = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      if (c?.id != null) map.set(c.id, c);
    }
    for (const s of sales) {
      const d = s.customer_detail;
      if (d?.id != null && !map.has(d.id)) map.set(d.id, d);
    }
    return [...map.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    );
  }, [customers, sales]);

  const applyFilters = (salesList) => {
    let filtered = salesList;
    
    if (filters.category_type) {
      filtered = filtered.filter(
        (sale) => sale.product_detail?.category_type === filters.category_type,
      );
    }
    filtered = filtered.filter((sale) => matchesProductCatalogFilters(sale.product_detail, filters));
    if (filters.status) {
      filtered = filtered.filter(sale => sale.status === filters.status);
    }
    if (filters.sale_type) {
      filtered = filtered.filter((sale) => sale.sale_type === filters.sale_type);
    }
    if (filters.customer) {
      if (filters.customer === '__none__') {
        filtered = filtered.filter((sale) => !sale.customer && !sale.customer_detail?.id);
      } else {
        const customerId = parseInt(filters.customer, 10);
        filtered = filtered.filter(
          (sale) =>
            sale.customer === customerId ||
            sale.customer_detail?.id === customerId,
        );
      }
    }
    if (filters.year) {
      filtered = filtered.filter(sale => {
        const saleYear = new Date(sale.sale_date).getFullYear();
        return saleYear.toString() === filters.year;
      });
    }
    if (filters.month) {
      filtered = filtered.filter(sale => {
        const saleMonth = new Date(sale.sale_date).getMonth() + 1; // getMonth() returns 0-11
        return saleMonth.toString() === filters.month;
      });
    }

    setFilteredSales(filtered);
  };

  useEffect(() => {
    if (sales.length > 0) {
      applyFilters(sales);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const saleSort = useClientTableSort(SALE_DISPLAY_SORT_ACCESSORS);
  const [expandedSaleGroups, setExpandedSaleGroups] = useState(() => new Set());

  const toggleSaleGroup = (groupId) => {
    setExpandedSaleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const salesDisplayRows = useMemo(
    () => buildSaleDisplayRows(filteredSales, sales),
    [filteredSales, sales]
  );

  const sortedDisplayRows = useMemo(() => {
    const rows = salesDisplayRows;
    if (!rows?.length) return rows;
    if (saleSort.sortCol && SALE_DISPLAY_SORT_ACCESSORS[saleSort.sortCol]) {
      return saleSort.sortRows(rows);
    }
    return [...rows].sort((a, b) => {
      const aSale = saleLikeForDisplayRow(a);
      const bSale = saleLikeForDisplayRow(b);
      const aDone = aSale.status === 'completed' ? 1 : 0;
      const bDone = bSale.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const ta = new Date(aSale.sale_date).getTime() || 0;
      const tb = new Date(bSale.sale_date).getTime() || 0;
      return tb - ta;
    });
  }, [salesDisplayRows, saleSort]);

  const salesColumnTotals = useMemo(() => {
    const list = filteredSales;
    if (!list.length) {
      return { quantity: 0, totalAmount: 0, totalAmountCurrency: null, totalDiscount: 0, totalDiscountCurrency: null, uzs: 0, usd: 0 };
    }
    let quantity = 0;
    let totalAmount = 0;
    let uzs = 0;
    let usd = 0;
    const saleCurrencies = new Set();
    for (const s of list) {
      quantity += parseInt(s.quantity, 10) || 0;
      totalAmount += parseFloat(s.total_amount) || 0;
      saleCurrencies.add(s.sale_currency || 'USD');
      uzs += (parseFloat(s.payment_uzs_cash) || 0) + (parseFloat(s.payment_uzs_card) || 0);
      usd += (parseFloat(s.payment_usd_cash) || 0) + (parseFloat(s.payment_usd_card) || 0);
    }
    const { total: totalDiscount, currency: totalDiscountCurrency } = sumSalesDiscountTotals(list);
    const totalAmountCurrency = saleCurrencies.size === 1 ? [...saleCurrencies][0] : null;
    return { quantity, totalAmount, totalAmountCurrency, totalDiscount, totalDiscountCurrency, uzs, usd };
  }, [filteredSales]);

  const productIdsWithPositiveInventory = useMemo(() => {
    const ids = new Set();
    for (const item of inventory) {
      if (item.status === 'in_inventory' && Number(item.quantity) > 0) {
        ids.add(Number(item.product));
      }
    }
    return ids;
  }, [inventory]);

  const productsAvailableForSale = useMemo(
    () => products.filter((p) => productIdsWithPositiveInventory.has(Number(p.id))),
    [products, productIdsWithPositiveInventory]
  );

  const batchLayerPickerItems = useMemo(
    () =>
      inventory
        .filter((layer) => Number(layer.quantity) > 0)
        .map((layer) => {
          const p = productForLayer(layer, products);
          if (!p) return null;
          if (batchFormCategory && p.category !== batchFormCategory) return null;
          return {
            value: String(layer.batch_id),
            label: layerSalePickerLabel(p, layer),
            product: p,
            layer,
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(b.product.id) - Number(a.product.id) || a.label.localeCompare(b.label)
        ),
    [inventory, products, batchFormCategory]
  );

  useEffect(() => {
    if (!showBatchForm) return;
    setBatchLines((lines) => {
      const allowed = new Set(batchLayerPickerItems.map((item) => item.value));
      let changed = false;
      const next = lines.map((line) => {
        if (!line.layer) return line;
        if (!allowed.has(String(line.layer))) {
          changed = true;
          return {
            ...line,
            layer: '',
            product: '',
            inventory_batch_id: '',
            list_price: '',
            selling_price: '',
            discount_price: '',
            packageLines: EMPTY_PKG_LINES(),
          };
        }
        return line;
      });
      return changed ? next : lines;
    });
  }, [showBatchForm, batchLayerPickerItems]);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      setProducts(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory/layers/');
      setInventory(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const updateBatchLine = (key, field, value) => {
    setBatchLines((lines) =>
      lines.map((l) => {
        if (l.key !== key) return l;
        const saleCur = batchDefaults.sale_currency || 'USD';
        if (field === 'layer') {
          const next = { ...l, layer: value };
          if (!value) {
            next.product = '';
            next.inventory_batch_id = '';
            next.list_price = '';
            next.selling_price = '';
            next.discount_price = '';
            next.packageLines = EMPTY_PKG_LINES();
            return next;
          }
          const layer = findInventoryLayer(inventory, value);
          const p = productForLayer(layer, products);
          const priceNum = resolveLayerListPrice(layer, p, saleCur);
          const formatted = formatSalePriceForCurrency(priceNum, saleCur);
          next.product = layer ? String(layer.product) : '';
          next.inventory_batch_id = layer ? String(layer.batch_id) : '';
          next.list_price = formatted;
          next.selling_price = formatted;
          next.discount_price = '';
          return next;
        }
        if (field === 'selling_price') {
          const listNum = parsePriceNum(l.list_price);
          const finalNum = parsePriceNum(value);
          if (listNum == null || finalNum == null) {
            return { ...l, selling_price: value };
          }
          return { ...l, ...applyListDiscountFinal(listNum, null, finalNum, saleCur) };
        }
        if (field === 'discount_price') {
          const listNum = parsePriceNum(l.list_price);
          if (listNum == null) {
            return { ...l, discount_price: value };
          }
          const discNum = parsePriceNum(value) ?? 0;
          return { ...l, ...applyListDiscountFinal(listNum, discNum, null, saleCur) };
        }
        return { ...l, [field]: value };
      })
    );
  };

  const addBatchLine = () => {
    setBatchLines((lines) => [
      ...lines,
      {
        key: `${Date.now()}-${Math.random()}`,
        layer: '',
        product: '',
        inventory_batch_id: '',
        quantity: '1',
        list_price: '',
        selling_price: '',
        discount_price: '',
        packageLines: EMPTY_PKG_LINES(),
      },
    ]);
  };

  const removeBatchLine = (key) => {
    setBatchLines((lines) => (lines.length <= 1 ? lines : lines.filter((l) => l.key !== key)));
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (!batchCustomer) {
      showNotification(t('notifications.errSelectCustomer'), 'error');
      return;
    }
    let freshInventory = inventory;
    try {
      const invRes = await api.get('/inventory/layers/');
      freshInventory = invRes.data.results || invRes.data;
      setInventory(freshInventory);
    } catch (err) {
      console.error('Error refreshing inventory layers:', err);
    }
    if (hasPermission('packages.view')) {
      await fetchPackages();
    }
    const withProduct = batchLines.filter((l) => l.layer && l.product);
    if (withProduct.length === 0) {
      showNotification(t('notifications.errAddLine'), 'error');
      return;
    }
    for (const l of withProduct) {
      if (l.selling_price === '' || l.selling_price == null) {
        showNotification(t('notifications.errSellingPrice'), 'error');
        return;
      }
    }
    // Aggregate package need across all lines for stock check
    const needPkg = new Map();
    const items = withProduct.map((l) => {
      const itemQty = parseInt(String(l.quantity), 10) || 1;
      const activeLines = (l.packageLines || []).filter((pl) => pl.package_type && pl.quantity > 0);
      const sellingForApi = parsePriceNum(l.selling_price);
      const row = {
        product: parseInt(l.product, 10),
        quantity: itemQty,
        selling_price:
          sellingForApi != null
            ? batchDefaults.sale_currency === 'UZS'
              ? String(Math.round(sellingForApi))
              : sellingForApi.toFixed(2)
            : String(l.selling_price || '').trim(),
        package_type: null,
        package_quantity: null,
      };
      if (l.inventory_batch_id) {
        row.inventory_batch_id = parseInt(l.inventory_batch_id, 10);
      }
      const disc = parsePriceNum(l.discount_price) || 0;
      if (disc > 0) {
        row.discount_price = l.discount_price;
      }
      if (activeLines.length > 0) {
        row.package_lines = activeLines.map(({ package_type, quantity }) => ({ package_type, quantity }));
        for (const pl of activeLines) {
          needPkg.set(pl.package_type, (needPkg.get(pl.package_type) || 0) + pl.quantity);
        }
      }
      return row;
    });
    for (const l of withProduct) {
      const batchId = parseInt(l.inventory_batch_id, 10);
      const need = parseInt(l.quantity, 10) || 0;
      const layer = findInventoryLayer(freshInventory, batchId);
      const available = layer ? Number(layer.quantity) || 0 : 0;
      if (!layer || available < need) {
        const pid = parseInt(l.product, 10);
        showNotification(
          t('notifications.errLayerStock', { pid, need, available }),
          'error'
        );
        return;
      }
    }
    const needByProduct = new Map();
    for (const l of withProduct) {
      const pid = parseInt(l.product, 10);
      const q = parseInt(l.quantity, 10) || 0;
      needByProduct.set(pid, (needByProduct.get(pid) || 0) + q);
    }
    for (const [pid, need] of needByProduct) {
      const available = freshInventory
        .filter((x) => Number(x.product) === pid)
        .reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      if (available < need) {
        showNotification(
          t('notifications.errInventory', { pid, need, available }),
          'error'
        );
        return;
      }
    }
    for (const [pt, n] of needPkg) {
      const pkg = packages.find((p) => p.package_type === pt);
      if (!pkg) {
        showNotification(t('notifications.errPkgNotInInventory', { type: pt }), 'error');
        return;
      }
      if (pkg.quantity < n) {
        showNotification(
          t('notifications.errPkgStock', { type: pt, need: n, have: pkg.quantity }),
          'error'
        );
        return;
      }
    }
    try {
      const { data } = await api.post('/sales/batch_create/', {
        customer: parseInt(batchCustomer, 10),
        defaults: {
          sale_type: batchDefaults.sale_type,
          sale_currency: batchDefaults.sale_currency,
          status: 'pending',
        },
        items,
      });
      showNotification(data.message || t('notifications.batchCreated', { count: data.count }), 'success');
      setShowBatchForm(false);
      setBatchFormCategory('');
      setBatchCustomer('');
      setBatchLines([]);
      fetchSales();
      fetchInventory();
      fetchPackages();
    } catch (error) {
      console.error('Error batch-creating sales:', error);
      const d = error.response?.data;
      showNotification(formatBatchCreateError(d, t), 'error');
      if (d?.item_errors) {
        console.warn('batch_create item_errors', d.item_errors);
      }
    }
  };

  const [balances, setBalances] = useState([]);
  const [dispatchFormData, setDispatchFormData] = useState({
    saleId: null,
    saleIds: [],
    delivery_cost: '',
    tracking_number: '',
    dispatch_type: 'dostavshik',
    dispatcher: '',
    is_paid: false,
    currency: 'UZS',
    dispatch_notes: '',
  });
  const [dispatchersList, setDispatchersList] = useState([]);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  
  const [showSellReservedForm, setShowSellReservedForm] = useState(false);
  const [sellReservedData, setSellReservedData] = useState({
    saleId: null,
    uzs: '',
    usd: '',
    balance_shortfall_type: '',
  });
  
  /** When set, shows shared Complete & Pay form (same flow as Dispatchers tab). */
  const [completePaySale, setCompletePaySale] = useState(null);
  
  const [showCompleteFromOrderForm, setShowCompleteFromOrderForm] = useState(false);
  const { exchangeRate: cfoExchangeRate, exchangeRateError: cfoExchangeRateError } =
    useCbuExchangeRate(showCompleteFromOrderForm);
  const { exchangeRate: sellReservedExchangeRate, exchangeRateError: sellReservedExchangeRateError } =
    useCbuExchangeRate(showSellReservedForm);
  const [completeFromOrderPackageLines, setCompleteFromOrderPackageLines] = useState(EMPTY_PKG_LINES());
  const [completeFromOrderData, setCompleteFromOrderData] = useState({
    saleId: null,
    customer: '',
    selling_price: '',
    sale_type: 'bought_from_shop',
    now_uzs: '',
    now_usd: '',
    deposit_received: false,
    deposit_amount: '',
    deposit_currency: 'USD',
  });

  const openDeliverySettlementModal = async (saleId) => {
    try {
      const res = await api.get(`/sales/${saleId}/`);
      setCompletePaySale(res.data);
    } catch (e) {
      console.error(e);
      showNotification(e.response?.data?.detail || e.response?.data?.error || t('notifications.errLoadSale'), 'error');
    }
  };

  const handleStatusUpdate = async (saleId, newStatus, groupSales = null) => {
    try {
      const targetSales = groupSales?.length ? groupSales : null;
      if (newStatus === 'dispatched') {
        setDispatchFormData({
          saleId: targetSales ? null : saleId,
          saleIds: targetSales ? targetSales.map((s) => s.id) : [saleId],
          delivery_cost: '',
          tracking_number: '',
          dispatch_type: 'dostavshik',
          dispatcher: '',
          is_paid: false,
          currency: 'UZS',
          dispatch_notes: '',
        });
        setShowDispatchForm(true);
      } else if (newStatus === 'completed') {
        const sale = targetSales
          ? buildCombinedSaleForGroup(targetSales)
          : sales.find((s) => s.id === saleId);
        if (!sale) {
          console.warn('Sale not found when trying to complete:', saleId);
          return;
        }
        if (canCompletePay) {
          setCompletePaySale(sale);
        } else if (canCompleteSale) {
          if (targetSales) {
            for (const s of targetSales) {
              await api.post(`/sales/${s.id}/update_status/`, { status: 'completed', notes: '' });
            }
          } else {
            await api.post(`/sales/${saleId}/update_status/`, { status: 'completed', notes: '' });
          }
          fetchSales();
          showNotification(t('notifications.saleCompleted'), 'success');
        }
      } else if (targetSales) {
        for (const s of targetSales) {
          await api.post(`/sales/${s.id}/update_status/`, { status: newStatus, notes: '' });
        }
        fetchSales();
        showNotification(t('notifications.statusUpdated', { status: tStatus(newStatus, 'sale') }), 'success');
      } else {
        await api.post(`/sales/${saleId}/update_status/`, { status: newStatus, notes: '' });
        fetchSales();
        showNotification(t('notifications.statusUpdated', { status: tStatus(newStatus, 'sale') }), 'success');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      if (newStatus !== 'completed') {
        showNotification(t('notifications.errUpdateStatus'), 'error');
      }
    }
  };

  useEffect(() => {
    if (!showDispatchForm) return;
    (async () => {
      try {
        const [dispatchersRes, balancesRes] = await Promise.all([
          api.get('/dispatchers/', { params: { is_active: true } }),
          api.get('/cash-balance/'),
        ]);
        setDispatchersList(dispatchersRes.data.results || dispatchersRes.data);
        setBalances(balancesRes.data.results || balancesRes.data);
      } catch (err) {
        console.error('Error loading dispatch form data:', err);
        setDispatchersList([]);
      }
    })();
  }, [showDispatchForm]);

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    const dn = String(dispatchFormData.dispatch_notes || '').trim();
    try {
      if (dispatchFormData.dispatch_type === 'dostavshik') {
        if (!dispatchFormData.dispatcher) {
          showNotification(t('dispatch.errSelectDispatcher'), 'error');
          return;
        }
        if (dispatchersList.length === 0) {
          showNotification(t('dispatch.errNoDispatchers'), 'error');
          return;
        }
      }

      const deliveryCost = parseFloat(dispatchFormData.delivery_cost) || 0;
      if (dispatchFormData.is_paid && deliveryCost > 0) {
        let freshBalances = balances;
        try {
          const balancesRes = await api.get('/cash-balance/');
          freshBalances = balancesRes.data.results || balancesRes.data;
          setBalances(freshBalances);
        } catch (balanceErr) {
          console.error('Error refreshing balances:', balanceErr);
        }
        const currency = dispatchFormData.currency;
        const available = cashBalanceTotalByCurrency(freshBalances, currency);
        if (available < deliveryCost) {
          showNotification(
            formatInsufficientLedgerMessage(currency, available, deliveryCost, {
              topUpSuffix: true,
            }),
            'error',
          );
          return;
        }
      }

      const dispatchData = {
        dispatch_type: dispatchFormData.dispatch_type,
        is_paid: dispatchFormData.is_paid,
        delivery_cost: dispatchFormData.currency === 'USD' ? dispatchFormData.delivery_cost : 0,
        delivery_cost_uzs: dispatchFormData.currency === 'UZS' ? dispatchFormData.delivery_cost : 0,
        tracking_number: dispatchFormData.tracking_number || '',
        status: 'dispatched',
        logistics_notes: dn || '',
      };
      if (dispatchFormData.dispatch_type === 'dostavshik' && dispatchFormData.dispatcher) {
        dispatchData.dispatcher = parseInt(dispatchFormData.dispatcher, 10);
      }

      if (dispatchFormData.currency === 'UZS') {
        dispatchData.delivery_payment_cash = dispatchFormData.delivery_cost;
        dispatchData.delivery_payment_card = 0;
      } else {
        dispatchData.delivery_payment_cash = 0;
        dispatchData.delivery_payment_card = 0;
      }

      const saleIds =
        dispatchFormData.saleIds?.length > 0
          ? dispatchFormData.saleIds
          : dispatchFormData.saleId != null
            ? [dispatchFormData.saleId]
            : [];
      for (const sid of saleIds) {
        await api.post('/dispatches/', { ...dispatchData, sale: sid });
      }
      
      setShowDispatchForm(false);
      setDispatchFormData({
        saleId: null,
        saleIds: [],
        delivery_cost: '',
        tracking_number: '',
        dispatch_type: 'dostavshik',
        dispatcher: '',
        is_paid: false,
        currency: 'UZS',
        dispatch_notes: '',
      });
      fetchSales();
      showNotification(t('dispatch.success'), 'success');
    } catch (error) {
      console.error('Error creating dispatch:', error);
      const data = error.response?.data;
      const msg =
        data?.error ||
        data?.detail ||
        (Array.isArray(data?.non_field_errors) ? data.non_field_errors[0] : null) ||
        data?.is_paid ||
        (typeof data === 'object' ? Object.values(data).flat().find(Boolean) : null) ||
        t('dispatch.errCreate');
      showNotification(typeof msg === 'string' ? msg : t('dispatch.errCreate'), 'error');
    }
  };

  const handleCompleteFromOrder = async (saleId) => {
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      const totalAmount = parseFloat(sale.selling_price) * sale.quantity;
      const advancePayment = sale.advance_payment_received || 0;
      const nowPaidAmount = totalAmount - advancePayment;
      setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
      setCompleteFromOrderData({
        saleId: saleId,
        customer: sale.customer || sale.order_detail?.customer || '',
        selling_price:
          sale.selling_price != null && sale.selling_price !== ''
            ? String(sale.selling_price)
            : '',
        sale_type: 'bought_from_shop',
        now_uzs: '',
        now_usd: nowPaidAmount > 0 ? nowPaidAmount.toFixed(2) : '0',
        deposit_received: false,
        deposit_amount: '',
        deposit_currency: 'USD',
      });
      setShowCompleteFromOrderForm(true);
    }
  };

  const handleCompleteFromOrderSubmit = async (e) => {
    e.preventDefault();
    try {
      const sellingPrice = parseFloat(completeFromOrderData.selling_price);
      
      if (!sellingPrice || sellingPrice <= 0) {
        showNotification(t('completeFromOrder.errPrice'), 'error');
        return;
      }
      
      // Validate multi-package lines for complete-from-order
      const cfoActiveLines = completeFromOrderPackageLines.filter((l) => l.package_type && l.quantity > 0);
      for (const line of cfoActiveLines) {
        const pkg = packages.find((p) => p.package_type === line.package_type);
        if (!pkg) {
          showNotification(t('notifications.errPkgNotExist', { type: line.package_type }), 'error');
          return;
        }
        const totalNeeded = cfoActiveLines
          .filter((l) => l.package_type === line.package_type)
          .reduce((s, l) => s + l.quantity, 0);
        if (pkg.quantity < totalNeeded) {
          showNotification(t('notifications.errPkgInsufficient', { type: line.package_type, need: totalNeeded, have: pkg.quantity }), 'error');
          return;
        }
      }

      const saleForComplete = sales.find((s) => s.id === completeFromOrderData.saleId);
      let paymentPayload = {
        uzs: parseFloat(completeFromOrderData.now_uzs) || 0,
        usd: parseFloat(completeFromOrderData.now_usd) || 0,
      };
      if (completeFromOrderData.sale_type !== 'reserved') {
        const flow = await runSalePaymentSubmitFlow({
          sale: saleForComplete,
          paymentFormData: {
            uzs: completeFromOrderData.now_uzs,
            usd: completeFromOrderData.now_usd,
            balance_shortfall_type: '',
          },
          exchangeRate: cfoExchangeRate,
          exchangeRateError: cfoExchangeRateError,
          showNotification,
          sellingPriceOverride: completeFromOrderData.selling_price,
          allowDiscount: false,
        });
        if (!flow.ok) return;
        paymentPayload = {
          uzs: flow.requestData.uzs,
          usd: flow.requestData.usd,
          ...(flow.requestData.exchange_rate != null
            ? { exchange_rate: flow.requestData.exchange_rate }
            : {}),
        };
      }

      const requestData = {
        customer: completeFromOrderData.customer,
        selling_price: sellingPrice,
        sale_type: completeFromOrderData.sale_type,
        package_type: null,
        package_quantity: null,
        uzs: paymentPayload.uzs,
        usd: paymentPayload.usd,
        ...(paymentPayload.exchange_rate != null
          ? { exchange_rate: paymentPayload.exchange_rate }
          : {}),
        ...(cfoActiveLines.length > 0 ? {
          package_lines: cfoActiveLines.map(({ package_type, quantity }) => ({ package_type, quantity })),
        } : {}),
      };

      // Add deposit fields if reserved sale
      if (completeFromOrderData.sale_type === 'reserved') {
        requestData.deposit_received = completeFromOrderData.deposit_received;
        if (completeFromOrderData.deposit_received && completeFromOrderData.deposit_amount) {
          requestData.deposit_amount = parseFloat(completeFromOrderData.deposit_amount);
          requestData.deposit_currency = completeFromOrderData.deposit_currency;
        }
      }
      
      await api.post(`/sales/${completeFromOrderData.saleId}/complete_from_order/`, requestData);
      
      // If delivery sale, show dispatch form instead of closing
      if (completeFromOrderData.sale_type === 'delivery') {
        setShowCompleteFromOrderForm(false);
        setDispatchFormData({
          saleId: completeFromOrderData.saleId,
          delivery_cost: '',
          tracking_number: '',
          dispatch_type: 'dostavshik',
          dispatcher: '',
          is_paid: false,
          currency: 'UZS',
          dispatch_notes: '',
        });
        setShowDispatchForm(true);
        setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
        setCompleteFromOrderData({
          saleId: null, customer: '', selling_price: '', sale_type: 'bought_from_shop',
          now_uzs: '', now_usd: '', deposit_received: false, deposit_amount: '', deposit_currency: 'USD',
        });
        fetchSales();
        showNotification(t('completeFromOrder.successDispatch'), 'success');
      } else {
        setShowCompleteFromOrderForm(false);
        setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
        setCompleteFromOrderData({
          saleId: null, customer: '', selling_price: '', sale_type: 'bought_from_shop',
          now_uzs: '', now_usd: '', deposit_received: false, deposit_amount: '', deposit_currency: 'USD',
        });
        fetchSales();
        showNotification(t('completeFromOrder.success'), 'success');
      }
    } catch (error) {
      console.error('Error completing sale from order:', error);
      showNotification(error.response?.data?.error || t('completeFromOrder.errComplete'), 'error');
    }
  };

  const handleCancelReserved = async (saleId) => {
    if (window.confirm(t('notifications.confirmCancelReserved'))) {
      try {
        await api.post(`/sales/${saleId}/cancel_reserved/`);
        fetchSales();
        fetchInventory();
        showNotification(t('notifications.cancelReservedSuccess'), 'success');
      } catch (error) {
        console.error('Error cancelling reserved sale:', error);
        showNotification(error.response?.data?.error || t('notifications.errCancelReserved'), 'error');
      }
    }
  };

  const handleSellReserved = async (saleId) => {
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      // Calculate total including package cost
      const itemTotal = parseFloat(sale.selling_price) * sale.quantity;
      const packageCost = sale.package_cost || 0;
      const totalAmount = itemTotal + parseFloat(packageCost);
      const depositAmount = sale.deposit_amount || 0;
      const remainingAmount = totalAmount - depositAmount;
      
      const remUsd = (sale.sale_currency || 'USD') === 'USD' && remainingAmount > 0 ? remainingAmount.toFixed(2) : '';
      const remUzs = (sale.sale_currency || 'USD') === 'UZS' && remainingAmount > 0 ? String(Math.round(remainingAmount)) : '';
      setSellReservedData({
        saleId: saleId,
        uzs: remUzs,
        usd: remUsd,
        balance_shortfall_type: '',
      });
      setShowSellReservedForm(true);
    }
  };

  const handleSellReservedSubmit = async (e) => {
    e.preventDefault();
    try {
      const sale = sales.find((s) => s.id === sellReservedData.saleId);
      const cbuRate = sellReservedExchangeRate?.rate ?? null;
      const meta = computeReservedPaymentMeta(
        sale,
        sellReservedData.uzs,
        sellReservedData.usd,
        cbuRate,
      );
      const uzsT = parseFloat(sellReservedData.uzs) || 0;
      const usdT = parseFloat(sellReservedData.usd) || 0;
      if (uzsT + usdT === 0) {
        showNotification(t('sellReserved.errPayment'), 'error');
        return;
      }
      if (meta.needsRate) {
        showNotification(
          sellReservedExchangeRateError || t('completePay.errRateLoading'),
          'error',
        );
        return;
      }
      if (meta.splitCurrency) {
        if (
          !window.confirm(
            buildSplitCurrencyConfirmMessage({
              sale,
              uzsAmount: uzsT,
              usdAmount: usdT,
              due: meta.due,
              sc: meta.sc,
              cbuRate,
              paidInSaleCurrency: meta.paid,
              exchangeRate: sellReservedExchangeRate,
            }),
          )
        ) {
          return;
        }
      }
      if (meta.needsDiscountChoice && sellReservedData.balance_shortfall_type !== 'discount') {
        showNotification(t('sellReserved.errDiscount'), 'error');
        return;
      }
      const payload = {
        uzs: uzsT,
        usd: usdT,
      };
      if (sellReservedExchangeRate?.rate && (meta.splitCurrency || meta.crossCurrency)) {
        payload.exchange_rate = sellReservedExchangeRate.rate;
      }
      if (meta.needsDiscountChoice) {
        payload.balance_shortfall_type = 'discount';
      }
      await api.post(`/sales/${sellReservedData.saleId}/sell_reserved/`, payload);
      setShowSellReservedForm(false);
      setSellReservedData({ saleId: null, uzs: '', usd: '', balance_shortfall_type: '' });
      fetchSales();
      showNotification(t('sellReserved.success'), 'success');
    } catch (error) {
      console.error('Error completing reserved sale:', error);
      showNotification(error.response?.data?.error || t('sellReserved.errComplete'), 'error');
    }
  };

  const sellReservedSaleForForm = showSellReservedForm
    ? sales.find((s) => s.id === sellReservedData.saleId)
    : null;
  const sellReservedPayMeta = computeReservedPaymentMeta(
    sellReservedSaleForForm,
    sellReservedData.uzs,
    sellReservedData.usd,
    sellReservedExchangeRate?.rate ?? null,
  );

  const renderSaleActionsCell = (sale, groupSales = null) => {
    const actionFor = (status) => handleStatusUpdate(sale.id, status, groupSales || undefined);
    return (
      <>
        {(sale.status === 'pending' || sale.status === 'confirmed') &&
          sale.sale_type === 'delivery' &&
          !sale.dispatch_info &&
          canDispatch && (
            <button type="button" className="btn-status" onClick={() => actionFor('dispatched')}>
              {t('rowActions.dispatch', { ns: 'sales' })}
            </button>
          )}
        {(sale.status === 'pending' || sale.status === 'confirmed') && sale.sale_type === 'bought_from_shop' && canCompletePay && (
          <button type="button" className="btn-status" onClick={() => actionFor('completed')}>
            {t('rowActions.completePay', { ns: 'sales' })}
          </button>
        )}
        {(sale.status === 'pending' || sale.status === 'confirmed') &&
          sale.sale_type === 'bought_from_shop' &&
          canCompleteWithoutPay && (
            <button
              type="button"
              className="btn-status"
              onClick={() => actionFor('completed')}
              style={{ backgroundColor: '#4caf50', color: 'white' }}
            >
              {t('rowActions.completeSale', { ns: 'sales' })}
            </button>
          )}
        {sale.status === 'dispatched' && shopDeliverySettlementRequired(sale) && canDeliverySettle && (
          <ShopDeliverySettlementButtons
            sale={sale}
            classNameButton="btn-status"
            onOpenSettlement={openDeliverySettlementModal}
          />
        )}
        {sale.status === 'dispatched' && !shopDeliverySettlementRequired(sale) && canCompletePay && (
          <button type="button" className="btn-status" onClick={() => actionFor('completed')}>
            {t('rowActions.completePay', { ns: 'sales' })}
          </button>
        )}
        {sale.status === 'pending' && sale.sale_type === 'from_order' && canCompleteFromOrder && (
          <button
            type="button"
            className="btn-status"
            onClick={() => handleCompleteFromOrder(sale.id)}
            style={{ backgroundColor: '#4caf50', color: 'white' }}
          >
            {t('rowActions.completeSale', { ns: 'sales' })}
          </button>
        )}
        {sale.status === 'reserved' && sale.sale_type === 'reserved' && (
          <>
            {canSellReserved && (
            <button
              type="button"
              className="btn-status"
              onClick={() => handleSellReserved(sale.id)}
              style={{ backgroundColor: '#4caf50', color: 'white', marginBottom: '5px' }}
            >
              {t('rowActions.sell', { ns: 'sales' })}
            </button>
            )}
            {canCancelReserved && (
            <button
              type="button"
              className="btn-edit"
              onClick={() => handleCancelReserved(sale.id)}
              style={{ backgroundColor: '#f44336', color: 'white' }}
            >
              {t('rowActions.cancelReserved', { ns: 'sales' })}
            </button>
            )}
            {sale.deposit_received && (
              <span style={{ fontSize: '0.85em', color: '#666', display: 'block', marginTop: '5px' }}>
                {t('deposit', { ns: 'sales' })}: {formatDisplayAmount(sale.deposit_amount, sale.deposit_currency || 'USD')}
              </span>
            )}
          </>
        )}
        {sale.status === 'completed' && sale.payment_currency && (
          <span style={{ fontSize: '0.9em', color: '#666', display: 'block', marginTop: '5px' }}>
            {t('paid', { ns: 'sales' })}: {sale.payment_currency}
          </span>
        )}
      </>
    );
  };

  const renderSaleProductCells = (sale, { detail = false } = {}) => {
    const detailClass = detail ? 'sale-group-detail-row__cell' : '';
    const saleTypeLabel = sale.sale_type ? t(`saleTypes.${sale.sale_type}`, { ns: 'sales' }) : '—';
    const uzsPay =
      (parseFloat(sale.payment_uzs_cash) || 0) + (parseFloat(sale.payment_uzs_card) || 0);
    const usdPay =
      (parseFloat(sale.payment_usd_cash) || 0) + (parseFloat(sale.payment_usd_card) || 0);
    return (
      <>
        <td className={detailClass}>
          <span className={`status-badge ${sale.status}`}>{tStatus(sale.status, 'sale')}</span>
        </td>
        <td className={detailClass}>
          {sale.product_detail?.category_type
            ? t(`categoryTypes.${sale.product_detail.category_type}`)
            : (
            <span style={{ color: '#999' }}>—</span>
          )}
        </td>
        <td className={detailClass}>{sale.product_detail?.category || <span style={{ color: '#999' }}>—</span>}</td>
        <td className={detailClass}>{sale.product_detail?.brand || '-'}</td>
        <td className={detailClass}>{sale.product_detail?.model || '-'}</td>
        <td className={detailClass}><strong>{sale.product_detail?.size || '-'}</strong></td>
        <td className={detailClass}><strong>{sale.product_detail?.color || '-'}</strong></td>
        <td className={detailClass}>{saleTypeLabel}</td>
        <td className={detailClass}>{renderPackageCell(sale, packages)}</td>
        <td className={detailClass}>{sale.quantity}</td>
        <td className={detailClass}>{formatDisplayAmount(sale.selling_price, sale.sale_currency || 'USD')}</td>
        <td className={detailClass}>{formatDisplayAmount(sale.total_amount, sale.sale_currency || 'USD')}</td>
        <td className={detailClass} style={{ fontSize: detail ? undefined : '0.9em' }}>
          {renderDiscountCreditCell(sale, t)}
        </td>
        <td className={detailClass}>
          {uzsPay > 0 ? (
            <span style={{ color: sale.status === 'completed' ? '#4caf50' : 'inherit' }}>
              {uzsPay.toLocaleString()} UZS
            </span>
          ) : (
            <span style={{ color: '#bbb' }}>—</span>
          )}
        </td>
        <td className={detailClass}>
          {usdPay > 0 ? (
            <span style={{ color: sale.status === 'completed' ? '#4caf50' : 'inherit' }}>${usdPay.toFixed(2)}</span>
          ) : (
            <span style={{ color: '#bbb' }}>—</span>
          )}
        </td>
        <td className={detailClass}>{sale.customer_detail?.name || '-'}</td>
        <td className={detailClass}>{sale.customer_detail?.telephone || <span style={{ color: '#bbb' }}>—</span>}</td>
        <td className={detailClass}>{sale.salesman_detail?.username || '-'}</td>
        <td className={detailClass}>{renderDispatcherCell(sale)}</td>
      </>
    );
  };

  if (loading) {
    return <div className="page-container">{t('actions.loading', { ns: 'common' })}</div>;
  }

  return (
    <div className="page-container">
      {notification.show && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: 9999,
            padding: '15px 25px',
            borderRadius: '8px',
            backgroundColor: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          <span style={{ fontSize: '20px' }}>
            {notification.type === 'success' ? '✓' : notification.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification({ show: false, message: '', type: 'success' })}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1',
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="page-header">
        <PageTitle ns="sales" />
        {canBatchCreate && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (showBatchForm) {
                setShowBatchForm(false);
                setBatchFormCategory('');
                setBatchLines([]);
              } else {
                setShowBatchForm(true);
                setBatchFormCategory('');
                setBatchCustomer('');
                setBatchDefaults({
                  sale_type: 'bought_from_shop',
                  sale_currency: 'USD',
                });
                setBatchLines([
                  {
                    key: `${Date.now()}-0`,
                    layer: '',
                    product: '',
                    inventory_batch_id: '',
                    quantity: '1',
                    list_price: '',
                    selling_price: '',
                    discount_price: '',
                    packageLines: EMPTY_PKG_LINES(),
                  },
                ]);
              }
            }}
          >
            {showBatchForm ? t('actions.cancel', { ns: 'common' }) : `+ ${t('newSale')}`}
          </button>
        )}
      </div>

      {showDispatchForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>{t('dispatch.title')}</h2>
          <form onSubmit={handleDispatchSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('dispatch.type')}</label>
                <select
                  value={dispatchFormData.dispatch_type}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDispatchFormData({
                      ...dispatchFormData,
                      dispatch_type: v,
                      dispatcher: v === 'dostavshik' ? dispatchFormData.dispatcher : '',
                    });
                  }}
                  required
                >
                  <option value="dostavshik">{t('dispatch.dostavshik')}</option>
                  <option value="bts">{t('dispatch.bts')}</option>
                </select>
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#555' }}>
                  {t('dispatch.typeHint')}
                </p>
              </div>
              {dispatchFormData.dispatch_type === 'dostavshik' && (
                <div className="form-group">
                  <label>{t('dispatch.dispatcher')}</label>
                  <select
                    value={dispatchFormData.dispatcher}
                    onChange={(e) => setDispatchFormData({ ...dispatchFormData, dispatcher: e.target.value })}
                    required
                  >
                    <option value="">{t('dispatch.selectDispatcher')}</option>
                    {dispatchersList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>{t('dispatch.currency')}</label>
                <select
                  value={dispatchFormData.currency}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, currency: e.target.value })}
                  required
                >
                  <option value="USD">{t('currency.usd', { ns: 'common' })}</option>
                  <option value="UZS">{t('currency.uzs', { ns: 'common' })}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('dispatch.deliveryCost', { currency: dispatchFormData.currency })}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dispatchFormData.delivery_cost}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, delivery_cost: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('dispatch.tracking')}</label>
                <input
                  type="text"
                  value={dispatchFormData.tracking_number}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, tracking_number: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('dispatch.notesOptional')}</label>
                <textarea
                  rows={3}
                  value={dispatchFormData.dispatch_notes}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, dispatch_notes: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dispatchFormData.is_paid}
                    onChange={(e) => setDispatchFormData({ ...dispatchFormData, is_paid: e.target.checked })}
                  />
                  {t('dispatch.paymentMade')}
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('dispatch.create')}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowDispatchForm(false);
                  setDispatchFormData({
                    saleId: null,
                    delivery_cost: '',
                    tracking_number: '',
                    dispatch_type: 'dostavshik',
                    dispatcher: '',
                    is_paid: false,
                    currency: 'UZS',
                    dispatch_notes: '',
                  });
                }}
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCompleteFromOrderForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>{t('completeFromOrder.title', { id: completeFromOrderData.saleId })}</h2>
          <form onSubmit={handleCompleteFromOrderSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('completeFromOrder.saleType')}</label>
                <select
                  value={completeFromOrderData.sale_type}
                  onChange={(e) => {
                    const newSaleType = e.target.value;
                    setCompleteFromOrderData({
                      ...completeFromOrderData,
                      sale_type: newSaleType,
                      // Reset deposit fields if not reserved
                      deposit_received: newSaleType === 'reserved' ? completeFromOrderData.deposit_received : false,
                      deposit_amount: newSaleType === 'reserved' ? completeFromOrderData.deposit_amount : '',
                    });
                  }}
                  required
                >
                  <option value="bought_from_shop">{t('saleTypes.bought_from_shop')}</option>
                  <option value="delivery">{t('saleTypes.delivery')}</option>
                  <option value="reserved">{t('saleTypes.reserved')}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('completeFromOrder.sellingPrice')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={completeFromOrderData.selling_price ?? ''}
                  onChange={(e) => {
                    const sellingPrice = parseFloat(e.target.value) || 0;
                    const sale = sales.find(s => s.id === completeFromOrderData.saleId);
                    const advancePayment = sale?.advance_payment_received || 0;
                    const depositAmount = parseFloat(completeFromOrderData.deposit_amount || 0);
                    const totalAmount = sellingPrice * (sale?.quantity || 1);
                    // For reserved sales, calculate remaining after deposit
                    const nowPaid = completeFromOrderData.sale_type === 'reserved' 
                      ? totalAmount - advancePayment - depositAmount
                      : totalAmount - advancePayment;
                    setCompleteFromOrderData({
                      ...completeFromOrderData,
                      selling_price: e.target.value,
                      now_paid_amount: nowPaid > 0 ? nowPaid.toFixed(2) : '0',
                    });
                  }}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('completeFromOrder.advanceAuto')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={(() => {
                    const adv = sales.find((s) => s.id === completeFromOrderData.saleId)?.advance_payment_received;
                    if (adv == null || adv === '') return '';
                    return String(adv);
                  })()}
                  readOnly
                  style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                />
              </div>
              {/* Deposit fields for Reserved sales */}
              {completeFromOrderData.sale_type === 'reserved' && (
                <>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={completeFromOrderData.deposit_received}
                        onChange={(e) => {
                          const depositReceived = e.target.checked;
                          const sale = sales.find(s => s.id === completeFromOrderData.saleId);
                          const sellingPrice = parseFloat(completeFromOrderData.selling_price) || 0;
                          const advancePayment = sale?.advance_payment_received || 0;
                          const depositAmount = depositReceived ? parseFloat(completeFromOrderData.deposit_amount || 0) : 0;
                          const totalAmount = sellingPrice * (sale?.quantity || 1);
                          const nowPaid = totalAmount - advancePayment - depositAmount;
                          setCompleteFromOrderData({
                            ...completeFromOrderData,
                            deposit_received: depositReceived,
                            now_paid_amount: nowPaid > 0 ? nowPaid.toFixed(2) : '0',
                          });
                        }}
                      />
                      {' '}{t('completeFromOrder.customerDeposited')}
                    </label>
                  </div>
                  {completeFromOrderData.deposit_received && (
                    <>
                      <div className="form-group">
                        <label>{t('completeFromOrder.depositAmount')}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={completeFromOrderData.deposit_amount ?? ''}
                          onChange={(e) => {
                            const depositAmount = parseFloat(e.target.value) || 0;
                            const sale = sales.find(s => s.id === completeFromOrderData.saleId);
                            const sellingPrice = parseFloat(completeFromOrderData.selling_price) || 0;
                            const advancePayment = sale?.advance_payment_received || 0;
                            const totalAmount = sellingPrice * (sale?.quantity || 1);
                            const nowPaid = totalAmount - advancePayment - depositAmount;
                            setCompleteFromOrderData({
                              ...completeFromOrderData,
                              deposit_amount: e.target.value,
                              now_paid_amount: nowPaid > 0 ? nowPaid.toFixed(2) : '0',
                            });
                          }}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('completeFromOrder.depositCurrency')}</label>
                        <select
                          value={completeFromOrderData.deposit_currency}
                          onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, deposit_currency: e.target.value })}
                          required
                        >
                          <option value="USD">{t('currency.usd', { ns: 'common' })}</option>
                          <option value="UZS">{t('currency.uzs', { ns: 'common' })}</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="form-group">
                <label>{t('completeFromOrder.packagesOptional')}</label>
                <PackageLinesSelector
                  lines={completeFromOrderPackageLines}
                  onChange={setCompleteFromOrderPackageLines}
                  packages={packages}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1', borderTop: '1px solid #eee', paddingTop: '12px', marginTop: '4px' }}>
                <p style={{ margin: '0 0 10px 0', color: '#555', fontSize: '0.9em', fontWeight: 600 }}>
                  {t('completeFromOrder.paymentHint')}
                </p>
                {cfoExchangeRate?.label && (
                  <p style={{ margin: '0 0 8px', color: '#4a5568', fontSize: '0.85em' }}>{cfoExchangeRate.label}</p>
                )}
                {cfoExchangeRateError && (
                  <p style={{ margin: '0 0 8px', color: '#b45309', fontSize: '0.85em' }}>{cfoExchangeRateError}</p>
                )}
              </div>
              <div className="form-group">
                <label>{t('currency.uzs', { ns: 'common' })}</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={completeFromOrderData.now_uzs ?? ''}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, now_uzs: e.target.value })} />
              </div>
              <div className="form-group">
                <label>{t('currency.usd', { ns: 'common' })}</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={completeFromOrderData.now_usd ?? ''}
                  onChange={(e) => setCompleteFromOrderData({ ...completeFromOrderData, now_usd: e.target.value })} />
              </div>
              {(() => {
                const saleRow = sales.find((s) => s.id === completeFromOrderData.saleId);
                if (!saleHasOrderAdvance(saleRow)) return null;
                const remaining = computeAdvanceRemainingDue(saleRow, completeFromOrderData.selling_price);
                const sc = (saleRow?.sale_currency || 'USD').toUpperCase();
                const otherCurrency = sc === 'USD' ? t('currency.uzs', { ns: 'common' }) : t('currency.usd', { ns: 'common' });
                return (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <p style={{ margin: 0, fontSize: '0.9em', color: '#444' }}>
                      <strong>{t('completeFromOrder.remainingDue')}</strong>{' '}
                      {formatDisplayAmount(remaining, sc)}
                      {' '}
                      {t('completeFromOrder.remainingHint', { currency: sc, otherCurrency })}
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('completeSale')}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowCompleteFromOrderForm(false);
                  setCompleteFromOrderPackageLines(EMPTY_PKG_LINES());
                  setCompleteFromOrderData({
                    saleId: null, customer: '', selling_price: '', sale_type: 'bought_from_shop',
                    now_uzs: '', now_usd: '', deposit_received: false, deposit_amount: '', deposit_currency: 'USD',
                  });
                }}
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
            </div>
          </form>
        </div>
      )}

      {completePaySale && shopDeliverySettlementRequired(completePaySale) && (
        <SaleDeliverySettlementForm
          sale={completePaySale}
          onClose={() => setCompletePaySale(null)}
          onAfterStepRecorded={() => fetchSales()}
          onSuccess={() => {
            setCompletePaySale(null);
            fetchSales();
          }}
          showNotification={showNotification}
        />
      )}
      {completePaySale && !shopDeliverySettlementRequired(completePaySale) && (
        <SaleCompletePayForm
          sale={completePaySale}
          onClose={() => setCompletePaySale(null)}
          onSuccess={() => {
            setCompletePaySale(null);
            fetchSales();
          }}
          showNotification={showNotification}
        />
      )}

      {showSellReservedForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>{t('sellReserved.title', { id: sellReservedData.saleId })}</h2>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.9em' }}>
            {t('sellReserved.intro')}
          </p>
          <form onSubmit={handleSellReservedSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('currency.uzs', { ns: 'common' })}</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={sellReservedData.uzs ?? ''}
                  onChange={(e) => setSellReservedData({ ...sellReservedData, uzs: e.target.value })} />
              </div>
              <div className="form-group">
                <label>{t('currency.usd', { ns: 'common' })}</label>
                <input type="number" step="0.01" min="0" placeholder="0"
                  value={sellReservedData.usd ?? ''}
                  onChange={(e) => setSellReservedData({ ...sellReservedData, usd: e.target.value })} />
              </div>
              {sellReservedPayMeta.needsRate && (
                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.9em', color: '#c05621' }}>
                  {sellReservedExchangeRateError || t('sellReserved.loadingCbu')}
                </p>
              )}
              {sellReservedSaleForForm && !sellReservedPayMeta.needsRate && (
                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.9em', color: '#444' }}>
                  <strong>{t('sellReserved.balanceDue')}</strong>{' '}
                  {formatDisplayAmount(
                    (sellReservedSaleForForm.deposit_received
                      ? parseFloat(sellReservedSaleForForm.total_amount || 0) -
                        parseFloat(sellReservedSaleForForm.deposit_amount || 0)
                      : parseFloat(sellReservedSaleForForm.total_amount || 0)),
                    sellReservedPayMeta.sc,
                  )}
                  {sellReservedPayMeta.paid != null &&
                  (parseFloat(sellReservedData.uzs) || parseFloat(sellReservedData.usd)) ? (
                    <>
                      {' '}
                      ·{' '}
                      <strong>
                        {sellReservedPayMeta.splitCurrency || sellReservedPayMeta.crossCurrency
                          ? t('sellReserved.totalAtCbu', { currency: sellReservedPayMeta.sc })
                          : t('sellReserved.entered', { currency: sellReservedPayMeta.sc })}
                      </strong>{' '}
                      {formatDisplayAmount(sellReservedPayMeta.paid, sellReservedPayMeta.sc)}
                    </>
                  ) : null}
                </p>
              )}
              {sellReservedPayMeta.needsDiscountChoice && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: '#555', lineHeight: 1.45 }}>
                    {t('sellReserved.discountHint')}
                  </p>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="sell_reserved_shortfall"
                      checked={sellReservedData.balance_shortfall_type === 'discount'}
                      onChange={() =>
                        setSellReservedData({ ...sellReservedData, balance_shortfall_type: 'discount' })
                      }
                    />
                    <span>{t('sellReserved.discountOption')}</span>
                  </label>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('completeSale')}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowSellReservedForm(false);
                  setSellReservedData({ saleId: null, uzs: '', usd: '', balance_shortfall_type: '' });
                }}
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
            </div>
          </form>
        </div>
      )}


      {showBatchForm && canBatchCreate && (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h2>{t('batch.title')}</h2>
          <p style={{ color: '#555', fontSize: '0.9em', marginTop: 0, marginBottom: 16 }}>
            {t('batch.intro')}
          </p>
          <form onSubmit={handleBatchSubmit}>
            <div className="sales-batch-header-row">
              <div className="form-group">
                <label>{t('batch.filterCategory')}</label>
                <select
                  value={batchFormCategory}
                  onChange={(e) => setBatchFormCategory(e.target.value)}
                >
                  <option value="">{t('batch.allCategories')}</option>
                  {[...new Set(productsAvailableForSale.map((p) => p.category).filter(Boolean))].sort().map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('batch.customerRequired')}</label>
                <div className="sales-batch-header-row__customer">
                  <div style={{ flex: 1 }}>
                    <CustomerSearchableSelect
                      asyncSearch
                      customers={customers}
                      value={batchCustomer}
                      onChange={setBatchCustomer}
                      placeholder={t('batch.selectCustomer')}
                      emptyLabel={t('batch.selectCustomer')}
                      aria-label={t('batch.customerRequired')}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-edit"
                    onClick={() => setShowCustomerForm(true)}
                    style={{ whiteSpace: 'nowrap', padding: '10px 14px', fontSize: '14px', borderRadius: '5px' }}
                  >
                    + {t('actions.add', { ns: 'common' })}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>{t('batch.saleTypeAll')}</label>
                <select
                  value={batchDefaults.sale_type}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, sale_type: e.target.value })}
                >
                  <option value="bought_from_shop">{t('batch.boughtFromShop')}</option>
                  <option value="delivery">{t('saleTypes.delivery')}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('batch.currencyAll')}</label>
                <select
                  value={batchDefaults.sale_currency}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, sale_currency: e.target.value })}
                >
                  <option value="USD">{t('currency.usd', { ns: 'common' })}</option>
                  <option value="UZS">{t('currency.uzs', { ns: 'common' })}</option>
                </select>
              </div>
            </div>
            <div className="batch-sale-lines-block">
              <div className="batch-sale-lines-block__label" id="batch-line-items-label">
                {t('batch.lineItems')}
              </div>
              <div className="batch-sale-lines-wrap batch-sale-lines-wrap--scroll">
                <table
                  className="batch-sale-lines"
                  role="table"
                  aria-labelledby="batch-line-items-label"
                >
                  <colgroup>
                    <col className="batch-col-product" />
                    <col className="batch-col-stock" />
                    <col className="batch-col-qty" />
                    <col className="batch-col-price" />
                    <col className="batch-col-price" />
                    <col className="batch-col-package" />
                    <col className="batch-col-row" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">{t('batch.product')}</th>
                      <th className="batch-sale-lines__th--num" title={t('batch.stock')}>
                        {t('batch.stock')}
                      </th>
                      <th className="batch-sale-lines__th--num">{t('batch.qty')}</th>
                      <th className="batch-sale-lines__th--num">{t('batch.sellingPrice')}</th>
                      <th className="batch-sale-lines__th--num">{t('batch.discountPrice')}</th>
                      <th>{t('batch.packages')}</th>
                      <th className="batch-sale-lines__th--action" aria-label={t('actions.delete', { ns: 'common' })} />
                    </tr>
                  </thead>
                  <tbody>
                    {batchLines.map((line) => {
                      const layer = line.layer ? findInventoryLayer(inventory, line.layer) : null;
                      const stock = layer ? Number(layer.quantity) || 0 : null;
                      return (
                        <tr key={line.key}>
                          <td>
                            <ProductSearchableSelect
                              pickerItems={batchLayerPickerItems}
                              value={line.layer ?? ''}
                              onChange={(id) => updateBatchLine(line.key, 'layer', id)}
                              triggerClassName="batch-sale-lines__control"
                              placeholder={t('batch.productPlaceholder')}
                              aria-label={t('batch.product')}
                            />
                          </td>
                          <td className="batch-sale-lines__td--num">
                            {line.layer ? stock : <span className="batch-sale-lines__empty" aria-hidden>—</span>}
                          </td>
                          <td className="batch-sale-lines__td--num">
                            <input
                              className="batch-sale-lines__control"
                              type="number"
                              min="1"
                              value={line.quantity ?? ''}
                              onChange={(e) => updateBatchLine(line.key, 'quantity', e.target.value)}
                              title={t('batch.qty')}
                              aria-label={t('batch.qty')}
                            />
                          </td>
                          <td className="batch-sale-lines__td--num">
                            <input
                              className="batch-sale-lines__control"
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.selling_price ?? ''}
                              onChange={(e) => updateBatchLine(line.key, 'selling_price', e.target.value)}
                              title={t('batch.sellingPrice')}
                              placeholder="0.00"
                              aria-label={t('batch.sellingPrice')}
                            />
                          </td>
                          <td className="batch-sale-lines__td--num">
                            <input
                              className="batch-sale-lines__control"
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.discount_price ?? ''}
                              onChange={(e) => updateBatchLine(line.key, 'discount_price', e.target.value)}
                              title={t('batch.discountPrice')}
                              placeholder="0.00"
                              aria-label={t('batch.discountPrice')}
                            />
                          </td>
                          <td style={{ minWidth: '260px', verticalAlign: 'top', paddingTop: '6px' }}>
                            <PackageLinesSelector
                              lines={line.packageLines || EMPTY_PKG_LINES()}
                              onChange={(newLines) => updateBatchLine(line.key, 'packageLines', newLines)}
                              packages={packages}
                            />
                          </td>
                          <td className="batch-sale-lines__td--action">
                            {batchLines.length > 1 ? (
                              <button
                                type="button"
                                className="batch-sale-lines__remove"
                                onClick={() => removeBatchLine(line.key)}
                                title={t('actions.delete', { ns: 'common' })}
                                aria-label={t('actions.delete', { ns: 'common' })}
                              >
                                ×
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="form-actions batch-sale-lines-actions">
              <button type="button" className="btn-edit" onClick={addBatchLine}>
                + {t('batch.addLine')}
              </button>
              <button type="submit" className="btn-primary">
                {t('batch.createCount', { count: batchLines.filter((l) => l.layer).length })}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCustomerForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>{t('customer.addTitle')}</h2>
          <form onSubmit={handleCreateCustomer}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('customer.name')} *</label>
                <input
                  type="text"
                  value={newCustomerData.name}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('customer.telephone')} *</label>
                <input
                  type="text"
                  value={newCustomerData.telephone}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, telephone: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('customer.instagram')}</label>
                <input
                  type="text"
                  value={newCustomerData.instagram}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, instagram: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('customer.region')}</label>
                <select
                  value={newCustomerData.region}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, region: e.target.value })}
                >
                  {regionChoices.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('customer.addButton')}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowCustomerForm(false);
                  setNewCustomerData({ name: '', telephone: '+998', instagram: '', region: 'tashkent_city' });
                }}
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showBatchForm && !showCustomerForm && !showDispatchForm && !completePaySale && !showCompleteFromOrderForm && !showSellReservedForm && (
        <div className="form-card filter-card" style={{ marginBottom: '16px' }}>
          <h3 className="filter-card__title">{t('filters.title', { ns: 'common' })}</h3>
        <div className="filter-toolbar">
          <div className="filter-field">
            <label>{t('table.categoryType')}</label>
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
                  sales
                    .filter(
                      (s) =>
                        !filters.category_type ||
                        s.product_detail?.category_type === filters.category_type,
                    )
                    .map((s) => s.product_detail?.category)
                    .filter(Boolean),
                ),
              ].sort(),
              brands: getUniqueValues(sales, 'brand'),
              models: getUniqueValues(sales, 'model'),
              sizes: getUniqueValues(sales, 'size'),
              colors: getUniqueValues(sales, 'color'),
            }}
            t={t}
            fieldLabels={{
              category: t('table.category'),
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
            <label>{t('table.status', { ns: 'common' })}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">{t('filters.allStatuses')}</option>
              {['pending', 'reserved', 'confirmed', 'dispatched', 'completed', 'cancelled'].map((st) => (
                <option key={st} value={st}>
                  {tStatus(st, 'sale')}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('table.saleType')}</label>
            <select
              value={filters.sale_type}
              onChange={(e) => setFilters({ ...filters, sale_type: e.target.value })}
            >
              <option value="">{t('filters.allSaleTypes')}</option>
              {['bought_from_shop', 'delivery', 'reserved', 'from_order'].map((st) => (
                <option key={st} value={st}>
                  {t(`saleTypes.${st}`, { ns: 'sales' })}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('table.customer')}</label>
            <CustomerSearchableSelect
              variant="filter"
              customers={customerFilterOptions}
              value={filters.customer}
              allowEmpty
              emptyLabel={t('filters.allCustomers')}
              placeholder={t('filters.allCustomers')}
              extraOptions={[{ value: '__none__', label: t('filters.noCustomer') }]}
              aria-label={t('table.customer')}
              onChange={(customerId) => setFilters({ ...filters, customer: customerId })}
            />
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
              {monthOptions.map((mo) => (
                <option key={mo.value || 'all'} value={mo.value}>
                  {mo.label}
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
                  sale_type: '',
                  customer: '',
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
              <SortableTh columnId="id" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.id', { ns: 'common' })}</SortableTh>
              <SortableTh columnId="sale_date" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.date', { ns: 'common' })}</SortableTh>
              <th>{t('table.actions', { ns: 'sales' })}</th>
              <SortableTh columnId="status" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.status', { ns: 'common' })}</SortableTh>
              <SortableTh columnId="category_type" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.categoryType')}</SortableTh>
              <SortableTh columnId="category" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.category')}</SortableTh>
              <SortableTh columnId="brand" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.brand')}</SortableTh>
              <SortableTh columnId="model" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.model')}</SortableTh>
              <SortableTh columnId="size" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.size')}</SortableTh>
              <SortableTh columnId="color" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.color')}</SortableTh>
              <SortableTh columnId="sale_type" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.saleType')}</SortableTh>
              <SortableTh columnId="package" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.package')}</SortableTh>
              <SortableTh columnId="quantity" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.quantity')}</SortableTh>
              <SortableTh columnId="selling_price" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.price')}</SortableTh>
              <SortableTh columnId="total_amount" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.total')}</SortableTh>
              <SortableTh columnId="discount_credit" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.discountCredit')}</SortableTh>
              <SortableTh columnId="uzs_pay" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('currency.uzs', { ns: 'common' })}</SortableTh>
              <SortableTh columnId="usd_pay" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('currency.usd', { ns: 'common' })}</SortableTh>
              <SortableTh columnId="customer" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.customer')}</SortableTh>
              <SortableTh columnId="phone" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.phone')}</SortableTh>
              <SortableTh columnId="salesman" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.salesman')}</SortableTh>
              <SortableTh columnId="dispatcher" sortCol={saleSort.sortCol} sortDir={saleSort.sortDir} onSort={saleSort.onHeaderClick}>{t('table.dispatcher')}</SortableTh>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan={SALES_TABLE_COLUMN_COUNT} style={{ textAlign: 'center' }}>
                  {t('noSales', { ns: 'sales' })}
                </td>
              </tr>
            ) : (
              sortedDisplayRows.map((row) => {
                if (row.type === 'single') {
                  const sale = row.sale;
                  return (
                    <tr key={row.key} style={{ backgroundColor: saleRowBackground(sale) }}>
                      <td>#{sale.id}</td>
                      <td>{new Date(sale.display_date || sale.sale_date).toLocaleString()}</td>
                      <td>{renderSaleActionsCell(sale)}</td>
                      {renderSaleProductCells(sale)}
                    </tr>
                  );
                }

                const agg = aggregateGroupSales(row.sales);
                const sale = agg.first;
                const expanded = expandedSaleGroups.has(row.groupId);
                const saleTypeLabel = sale?.sale_type ? t(`saleTypes.${sale.sale_type}`, { ns: 'sales' }) : '—';
                const flagged = row.sales.find((s) => saleRowBackground(s));
                const groupBg = flagged ? saleRowBackground(flagged) : undefined;

                return (
                  <React.Fragment key={row.key}>
                    <tr
                      className="sale-group-row"
                      style={{ backgroundColor: groupBg, cursor: 'pointer' }}
                      onClick={(e) => {
                        if (e.target.closest('button')) return;
                        toggleSaleGroup(row.groupId);
                      }}
                    >
                      <td>{agg.idsLabel}</td>
                      <td>{sale ? new Date(sale.sale_date).toLocaleString() : '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>{renderSaleActionsCell(sale, row.sales)}</td>
                      <td>
                        <span className={`status-badge ${agg.hasMixedStatus ? 'pending' : agg.statuses[0]}`}>
                          {agg.hasMixedStatus ? t('mixed') : tStatus(agg.statuses[0], 'sale')}
                        </span>
                      </td>
                      <td><span style={{ color: '#999' }}>—</span></td>
                      <td>
                        <strong>{t('multipleItems')}</strong>
                        <span style={{ color: '#666', fontSize: '0.85em' }}> ({row.sales.length})</span>
                      </td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td>{saleTypeLabel}</td>
                      <td><span style={{ color: '#bbb' }}>—</span></td>
                      <td>{agg.quantity}</td>
                      <td>—</td>
                      <td>
                        {agg.saleCurrency
                          ? formatDisplayAmount(agg.totalAmount, agg.saleCurrency)
                          : formatPlainAmount(agg.totalAmount)}
                      </td>
                      <td style={{ fontSize: '0.9em' }}>
                        {renderDiscountCreditCell(
                          {
                            total_discount_amount: agg.totalDiscount,
                            balance_shortfall_type:
                              agg.completionDiscount > 0 ? 'discount' : sale?.balance_shortfall_type,
                            balance_shortfall_amount: agg.completionDiscount || null,
                            balance_shortfall_currency: agg.saleCurrency || sale?.sale_currency,
                            sale_currency: agg.saleCurrency || sale?.sale_currency || 'USD',
                          },
                          t,
                        )}
                      </td>
                      <td>
                        {agg.uzsPay > 0 ? (
                          <span style={{ color: agg.statuses.every((s) => s === 'completed') ? '#4caf50' : 'inherit' }}>
                            {agg.uzsPay.toLocaleString()} UZS
                          </span>
                        ) : (
                          <span style={{ color: '#bbb' }}>—</span>
                        )}
                      </td>
                      <td>
                        {agg.usdPay > 0 ? (
                          <span style={{ color: agg.statuses.every((s) => s === 'completed') ? '#4caf50' : 'inherit' }}>
                            ${agg.usdPay.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: '#bbb' }}>—</span>
                        )}
                      </td>
                      <td>{sale?.customer_detail?.name || '-'}</td>
                      <td>{sale?.customer_detail?.telephone || <span style={{ color: '#bbb' }}>—</span>}</td>
                      <td>{sale?.salesman_detail?.username || '-'}</td>
                      <td>{renderDispatcherCell(sale)}</td>
                    </tr>
                    {expanded &&
                      row.sales.map((item) => (
                        <tr key={`${row.key}-item-${item.id}`} className="sale-group-detail-row">
                          <td colSpan="3" aria-hidden />
                          {renderSaleProductCells(item, { detail: true })}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={SALES_FOOTER_LABEL_COL_SPAN} style={{ textAlign: 'right' }}>
                {t('table.totalFooter', { ns: 'sales' })}
              </td>
              <td style={{ fontWeight: 600 }}>{salesColumnTotals.quantity.toLocaleString()}</td>
              <td>—</td>
              <td style={{ fontWeight: 600 }}>
                {!filteredSales.length
                  ? '—'
                  : salesColumnTotals.totalAmountCurrency
                    ? formatDisplayAmount(
                        salesColumnTotals.totalAmount,
                        salesColumnTotals.totalAmountCurrency,
                      )
                    : formatPlainAmount(salesColumnTotals.totalAmount)}
              </td>
              <td style={{ fontWeight: 600 }}>
                {!filteredSales.length
                  ? '—'
                  : salesColumnTotals.totalDiscount > 0
                    ? salesColumnTotals.totalDiscountCurrency
                      ? formatDisplayAmount(
                          salesColumnTotals.totalDiscount,
                          salesColumnTotals.totalDiscountCurrency,
                        )
                      : formatPlainAmount(salesColumnTotals.totalDiscount)
                    : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {salesColumnTotals.uzs > 0 ? `${salesColumnTotals.uzs.toLocaleString()} UZS` : '—'}
              </td>
              <td style={{ fontWeight: 600 }}>
                {salesColumnTotals.usd > 0 ? `$${salesColumnTotals.usd.toFixed(2)}` : '—'}
              </td>
              <td colSpan={SALES_TABLE_COLUMN_COUNT - SALES_FOOTER_LABEL_COL_SPAN - 6}>—</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

export default Sales;

