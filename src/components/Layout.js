import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import './Layout.css';

const Layout = () => {
  const { user, logout } = useAuth();
  const { menuItems, roleCode } = usePermissions();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith('/inventory')) {
      setInventoryOpen(true);
    }
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;
  const isInventoryActive = () => location.pathname.startsWith('/inventory');

  const displayRole =
    user?.role_name ||
    (roleCode ? roleCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h2>ERP System</h2>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            type="button"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map((item, index) =>
            item.isDropdown ? (
              <div key={index} className="nav-dropdown">
                <div
                  className={`nav-item ${isInventoryActive() ? 'active' : ''}`}
                  onClick={() => setInventoryOpen(!inventoryOpen)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setInventoryOpen(!inventoryOpen)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {sidebarOpen && (
                    <>
                      <span className="nav-label">{item.label}</span>
                      <span className="dropdown-arrow">{inventoryOpen ? '▼' : '▶'}</span>
                    </>
                  )}
                </div>
                {inventoryOpen && sidebarOpen && (
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
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
              </Link>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            {sidebarOpen && (
              <>
                <div className="user-name">{user?.username}</div>
                <div className="user-role">{displayRole}</div>
              </>
            )}
          </div>
          <button className="logout-btn" type="button" onClick={logout}>
            {sidebarOpen ? 'Logout' : '🚪'}
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
