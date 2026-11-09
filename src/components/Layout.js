import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { resolveShopName } from '../utils/shopIdentity';
import { usePermissions } from '../hooks/usePermissions';
import { getRoleDisplayName } from '../utils/permissions';
import { translateMenuItems } from '../utils/i18nMenu';
import NotificationBell from './NotificationBell';
import './Layout.css';
import LanguageToggle from './LanguageToggle';

const MOBILE_BREAKPOINT = 768;

const Layout = () => {
  const { user, logout } = useAuth();
  const { menuItems } = usePermissions();
  const { t } = useTranslation('common');
  const { settings } = useSettings();
  // The shop's own name above the menu, falling back to the product name until one is set.
  const brand = resolveShopName(settings, null, t('app.title'));
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // **Which sidebar groups are expanded, keyed by the group's `basePath`.** This was a single
  // `inventoryOpen` boolean, which was fine while Ombor was the only group and silently wrong
  // the moment a second one existed: both would have opened and closed together, and both would
  // have highlighted whenever either was the current page.
  const [openGroups, setOpenGroups] = useState({});
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  );

  const translatedMenu = useMemo(
    () => translateMenuItems(menuItems, t),
    [menuItems, t],
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setMobileNavOpen(false);
      } else {
        setSidebarOpen(true);
        setMobileNavOpen(false);
      }
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Open the group the current page lives in, and never close one the reader opened by hand --
  // landing on a page inside a collapsed group would otherwise leave the sidebar with no sign of
  // where you are.
  useEffect(() => {
    const open = {};
    for (const item of translatedMenu) {
      if (item.isDropdown && item.basePath && location.pathname.startsWith(item.basePath)) {
        open[item.basePath] = true;
      }
    }
    if (Object.keys(open).length) {
      setOpenGroups((prev) => ({ ...prev, ...open }));
    }
    if (isMobile) {
      setMobileNavOpen(false);
    }
  }, [location.pathname, isMobile, translatedMenu]);

  const isActive = (path) => location.pathname === path;
  const isGroupActive = (item) => Boolean(item.basePath) && location.pathname.startsWith(item.basePath);
  const isGroupOpen = (item) => Boolean(openGroups[item.basePath]);
  const toggleGroup = (item) =>
    setOpenGroups((prev) => ({ ...prev, [item.basePath]: !prev[item.basePath] }));

  const displayRole = getRoleDisplayName(user, t);

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileNavOpen((prev) => !prev);
    } else {
      setSidebarOpen((prev) => !prev);
    }
  };

  const sidebarClass = [
    'sidebar',
    isMobile ? (mobileNavOpen ? 'open' : 'closed') : sidebarOpen ? 'open' : 'closed',
  ].join(' ');

  return (
    <div className={`layout ${isMobile ? 'layout--mobile' : ''}`}>
      {isMobile && mobileNavOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t('actions.close')}
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <h2>{brand}</h2>
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            type="button"
            aria-label={sidebarOpen || mobileNavOpen ? t('actions.close') : t('actions.view')}
          >
            {isMobile ? (mobileNavOpen ? '✕' : '☰') : sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        <nav className="sidebar-nav">
          {translatedMenu.map((item, index) =>
            item.isDropdown ? (
              <div key={item.basePath || index} className="nav-dropdown">
                <div
                  className={`nav-item ${isGroupActive(item) ? 'active' : ''}`}
                  onClick={() => toggleGroup(item)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isGroupOpen(item)}
                  onKeyDown={(e) => e.key === 'Enter' && toggleGroup(item)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {(sidebarOpen || mobileNavOpen) && (
                    <>
                      <span className="nav-label">{item.label}</span>
                      <span className="dropdown-arrow">{isGroupOpen(item) ? '▼' : '▶'}</span>
                    </>
                  )}
                </div>
                {isGroupOpen(item) && (sidebarOpen || mobileNavOpen) && (
                  <div className="submenu">
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.path}
                        to={subItem.path}
                        className={`nav-item submenu-item ${isActive(subItem.path) ? 'active' : ''}`}
                      >
                        <span className="nav-icon">{subItem.icon}</span>
                        <span className="nav-label">{subItem.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {(sidebarOpen || mobileNavOpen) && <span className="nav-label">{item.label}</span>}
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            {(sidebarOpen || mobileNavOpen) && (
              <>
                <div className="user-name">{user?.username}</div>
                <div className="user-role">{displayRole}</div>
              </>
            )}
          </div>
          <button className="logout-btn" type="button" onClick={logout}>
            {sidebarOpen || mobileNavOpen ? t('auth.logout') : '🚪'}
          </button>
        </div>
      </aside>
      <main className="main-content">
        {isMobile && (
          <button
            type="button"
            className="mobile-menu-fab"
            onClick={() => setMobileNavOpen(true)}
            aria-label={t('actions.view')}
          >
            ☰
          </button>
        )}
        {/*
          A top bar rather than another nav entry, because a reminder is only useful when it is
          in front of you whatever page you are on. The left nav is deliberately untouched.
          It holds only the bell for now; it is the place anything else app-wide would go.
        */}
        <header className="app-topbar">
          <LanguageToggle />
          <NotificationBell />
        </header>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
