/**
 * Who sees Sozlamalar, and who can reach /settings by typing it.
 *
 * The mirror of `test_shop_settings.OnlyAnAdminCanChangeIt` on the server. Both halves are needed
 * and for different reasons: the server is what actually refuses, and this is what stops a menu item
 * appearing for somebody who would then be told 403 by a page they were invited to open.
 *
 * Founder is the interesting case. It is the top role and holds nearly everything, so "the Founder
 * cannot" is the assertion most likely to be quietly undone — by a change to the withheld set, or by
 * somebody adding `/settings` to a role's visible list to fix an unrelated menu bug.
 *
 * These build users the way `/users/me/` does, from a flat list of permission codes.
 */
import { canAccessRoute, filterMenuItems, ROUTE_PERMISSIONS } from './permissions';

const userWith = (roleCode, permissions) => ({
  username: `${roleCode}_user`,
  role_code: roleCode,
  permissions,
});

// What the server actually sends each of these roles for this code. Founder is withheld it; Admin
// holds it; nobody else is granted it at all.
//
// The codes read the way they are spelled since the 2026-09-27 swap: `founder` is Founder and `admin`
// is Admin. Before it, Founder was coded `admin`, which is what this file would have had to explain.
const admin = userWith('admin', ['settings.manage', 'sales.view', 'dashboard.view']);
const founder = userWith('founder', ['sales.view', 'dashboard.view', 'users.view']);
const ceo = userWith('ceo', ['sales.view', 'dashboard.view']);
const cashier = userWith('sales_manager', ['sales.view', 'dashboard.view']);

const menuPaths = (user) => filterMenuItems(user).map((item) => item.path);

describe('the route is gated on the code the server gates on', () => {
  it('asks for settings.manage', () => {
    // If these two ever disagree, the page loads for someone the API then refuses.
    expect(ROUTE_PERMISSIONS['/settings']).toBe('settings.manage');
  });
});

describe('the Admin', () => {
  it('sees Sozlamalar in the menu', () => {
    expect(menuPaths(admin)).toContain('/settings');
  });

  it('can open the page', () => {
    expect(canAccessRoute(admin, '/settings')).toBe(true);
  });
});

describe('the Founder', () => {
  it('does not see Sozlamalar in the menu', () => {
    // The owner asked for this: naming the shop is the Admin's job.
    expect(menuPaths(founder)).not.toContain('/settings');
  });

  it('cannot open the page by typing the URL', () => {
    expect(canAccessRoute(founder, '/settings')).toBe(false);
  });

  it('still sees the rest of what it holds', () => {
    // Guards against a change that hid the item by breaking the menu rather than the permission.
    expect(menuPaths(founder)).toContain('/sales');
  });
});

describe('everybody else', () => {
  it.each([
    ['ceo', ceo],
    ['sales_manager', cashier],
  ])('%s sees no Sozlamalar and cannot open it', (_label, user) => {
    expect(menuPaths(user)).not.toContain('/settings');
    expect(canAccessRoute(user, '/settings')).toBe(false);
  });

  it('refuses a user with no permissions at all', () => {
    expect(canAccessRoute(userWith('sales_manager', []), '/settings')).toBe(false);
  });

  it('refuses nobody signed in', () => {
    expect(canAccessRoute(null, '/settings')).toBe(false);
  });
});
