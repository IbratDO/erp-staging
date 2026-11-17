/**
 * What an Order viewer sees, and where it lands.
 *
 * The mirror of `test_order_viewer_role` on the server, and both halves are needed for different
 * reasons: the server is what actually refuses, and this is what stops a menu item appearing for
 * somebody who would then be told 403 by a page they were invited to open.
 *
 * The landing path is the half most likely to break unnoticed. This role has no `dashboard.view`,
 * so `getDefaultHomePath` must not hand it `/dashboard` — that would put every login on a page
 * the API refuses, which reads as "the account is broken" rather than "the account has one page".
 *
 * Users are built the way `/users/me/` sends them: a role code plus a flat list of codes.
 */
import {
  canAccessRoute,
  filterMenuItems,
  getDefaultHomePath,
  hasPermission,
  isOperationalSenior,
  ROUTE_PERMISSIONS,
} from './permissions';

/** Exactly what the server grants this role — one code. Asserted there, mirrored here. */
const orderViewer = {
  username: 'order_viewer_1',
  role_code: 'order_viewer',
  permissions: ['orders.view'],
};

const menuPaths = (user) => filterMenuItems(user).map((item) => item.path);

describe('the gate matches the server', () => {
  it('asks for orders.view, the one code the role holds', () => {
    // If these disagree the page loads for someone the API then refuses, or the other way round.
    expect(ROUTE_PERMISSIONS['/orders']).toBe('orders.view');
  });
});

describe('the sidebar', () => {
  it('offers Buyurtmalar', () => {
    expect(menuPaths(orderViewer)).toContain('/orders');
  });

  it('offers the password page, which is the only other thing it may open', () => {
    // It never reaches the Users tab, so without this nobody but an Admin could change it.
    expect(menuPaths(orderViewer)).toContain('/change-password');
  });

  it('offers nothing else at all', () => {
    expect(menuPaths(orderViewer).sort()).toEqual(['/change-password', '/orders']);
  });
});

describe('typing a URL', () => {
  it('reaches Buyurtmalar', () => {
    expect(canAccessRoute(orderViewer, '/orders')).toBe(true);
  });

  it.each([
    '/dashboard',
    '/sales',
    '/kassa',
    '/products',
    '/inventory/products',
    '/customers',
    '/finance',
    '/money-balance',
    '/balance-sheet',
    '/users',
    '/settings',
    '/audit-logs',
    '/credit-sales',
    '/payments-control/billing',
  ])('is refused %s', (path) => {
    expect(canAccessRoute(orderViewer, path)).toBe(false);
  });
});

describe('after logging in', () => {
  it('lands on Buyurtmalar, not on a dashboard it cannot open', () => {
    expect(getDefaultHomePath(orderViewer)).toBe('/orders');
  });

  it('still lands there if a dashboard grant is ever added by mistake', () => {
    // The visible-path list is the gate, not the grant: a stray `dashboard.view` must not move
    // this account's home to a page its sidebar does not show.
    const withStrayGrant = { ...orderViewer, permissions: ['orders.view', 'dashboard.view'] };
    expect(getDefaultHomePath(withStrayGrant)).toBe('/orders');
  });
});

/**
 * The buttons on the Buyurtmalar page.
 *
 * `Orders.js` derives eight booleans from permission codes and hangs every write control off
 * them, so these are the exact expressions the page evaluates — asserted here rather than by
 * rendering a four-thousand-line component. The server refuses all of this anyway
 * (`EveryWriteOnTheOrdersApiIsRefused`); the point of this half is that the viewer is never
 * *offered* an action, because a button that answers 403 reads as a broken page.
 */
describe('the write controls', () => {
  it.each([
    'orders.create',
    'orders.pay_order',
    'orders.pay_cargo',
    'orders.move_to_inventory',
    'orders.sell_product',
    'orders.update_status',
    'orders.mark_as_ordered',
    'orders.cancel',
    'orders.batch_create',
  ])('%s is not held, so its control does not render', (code) => {
    expect(hasPermission(orderViewer, code)).toBe(false);
  });

  it('is not an operational senior either', () => {
    // `canManageStockOrders` is `canUpdateStatus || isOperationalSenior(user)` — a role check, so
    // the permission list alone would not have answered it.
    expect(isOperationalSenior(orderViewer)).toBe(false);
  });
});
