/**
 * Centralized frontend permission utilities.
 * Backend is source of truth; this mirrors /users/me/ permissions for UX only.
 */

export const ROUTE_PERMISSIONS = {
  '/dashboard': 'dashboard.view',
  '/products': 'products.view',
  '/inventory/products': 'inventory.view',
  '/inventory/packages': 'packages.view',
  '/orders': 'orders.view',
  '/sales': 'sales.view',
  '/returns': 'returns.view',
  '/finance': 'finance.view',
  '/receivables-payables': 'receivables.view',
  '/equity': 'equity.view',
  '/fixed-assets': 'fixed_assets.view',
  '/profit-loss': 'finance.profit_loss',
  '/balance-sheet': 'finance.balance_sheet',
  '/money-balance': 'cash.view',
  '/audit-logs': 'audit_logs.view',
  '/bonus-rules': 'bonus.manage',
  '/users': 'users.view',
  '/customers': 'customers.view',
  '/dispatchers': 'dispatchers.view',
  '/workers': 'workers.view',
};

/** Sidebar menu definitions with required permission codes */
export const MENU_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', permission: 'dashboard.view' },
  { path: '/products', label: 'Products', icon: '👟', permission: 'products.view' },
  {
    label: 'Inventory',
    icon: '📦',
    isDropdown: true,
    permissionAny: ['inventory.view', 'packages.view'],
    subItems: [
      { path: '/inventory/products', label: 'Products', icon: '📦', permission: 'inventory.view' },
      { path: '/inventory/packages', label: 'Packages', icon: '📮', permission: 'packages.view' },
    ],
  },
  { path: '/orders', label: 'Orders', icon: '🛒', permission: 'orders.view' },
  { path: '/sales', label: 'Sales', icon: '💰', permission: 'sales.view' },
  { path: '/returns', label: 'Returns', icon: '↩️', permission: 'returns.view' },
  { path: '/receivables-payables', label: 'Receivables / Payables', icon: '📑', permission: 'receivables.view' },
  { path: '/finance', label: 'Other Financial Records', icon: '💵', permission: 'finance.view' },
  { path: '/equity', label: 'Equity', icon: '🏛️', permission: 'equity.view' },
  { path: '/fixed-assets', label: 'Fixed Assets', icon: '🏢', permission: 'fixed_assets.view' },
  { path: '/profit-loss', label: 'Profit / Loss', icon: '📈', permission: 'finance.profit_loss' },
  { path: '/balance-sheet', label: 'Balance Sheet', icon: '📊', permission: 'finance.balance_sheet' },
  { path: '/money-balance', label: 'Money Balance', icon: '💳', permission: 'cash.view' },
  { path: '/customers', label: 'Customers', icon: '👥', permission: 'customers.view' },
  { path: '/dispatchers', label: 'Dispatchers', icon: '🚚', permission: 'dispatchers.view' },
  { path: '/workers', label: 'Workers', icon: '👷', permission: 'workers.view' },
  { path: '/audit-logs', label: 'Audit Logs', icon: '📝', permission: 'audit_logs.view' },
  { path: '/bonus-rules', label: 'Bonus Rules', icon: '🎁', permission: 'bonus.manage' },
  { path: '/users', label: 'Users', icon: '👤', permission: 'users.view' },
];

export function normalizePermissions(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  return [];
}

export function hasPermission(user, code) {
  if (!user || !code) return false;
  const perms = normalizePermissions(user);
  return perms.includes(code);
}

export function hasAnyPermission(user, codes = []) {
  if (!codes.length) return true;
  return codes.some((c) => hasPermission(user, c));
}

export function hasAllPermissions(user, codes = []) {
  if (!codes.length) return true;
  return codes.every((c) => hasPermission(user, c));
}

export function canAccessRoute(user, path) {
  const permission = ROUTE_PERMISSIONS[path];
  if (!permission) return true;
  return hasPermission(user, permission);
}

export function filterMenuItems(user, items = MENU_ITEMS) {
  return items
    .map((item) => {
      if (item.isDropdown) {
        const subItems = (item.subItems || []).filter(
          (sub) => !sub.permission || hasPermission(user, sub.permission)
        );
        if (!subItems.length) return null;
        const parentOk = item.permissionAny
          ? hasAnyPermission(user, item.permissionAny)
          : true;
        if (!parentOk && !subItems.length) return null;
        return { ...item, subItems };
      }
      if (item.permission && !hasPermission(user, item.permission)) return null;
      return item;
    })
    .filter(Boolean);
}

export function getRoleCode(user) {
  return user?.role_code || user?.role?.code || user?.role || 'sales_manager';
}

export function isCEO(user) {
  return getRoleCode(user) === 'ceo';
}
