import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import PrivateRoute from './components/PrivateRoute';
import ProtectedRoute from './components/ProtectedRoute';
import DefaultHomeRedirect from './components/DefaultHomeRedirect';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Packages from './pages/Packages';
import StockCounts from './pages/StockCounts';
import Reports from './pages/Reports';
import Orders from './pages/Orders';
import Sales from './pages/Sales';
import Pos from './pages/Pos';
import Returns from './pages/Returns';
import Finance from './pages/Finance';
import ReceivablesPayables from './pages/ReceivablesPayables';
import CreditSales from './pages/CreditSales';
import GatewayPayments from './pages/GatewayPayments';
import TransferPayments from './pages/TransferPayments';
// The group's landing path only redirects; the two pages above are what the sidebar points at.
import PaymentsControl from './pages/PaymentsControl';
import Equity from './pages/Equity';
import FixedAssets from './pages/FixedAssets';
import ProfitLoss from './pages/ProfitLoss';
import BalanceSheet from './pages/BalanceSheet';
import MoneyBalance from './pages/MoneyBalance';
import AuditLogs from './pages/AuditLogs';
import BonusRules from './pages/BonusRules';
import Users from './pages/Users';
import ChangePassword from './pages/ChangePassword';
import Customers from './pages/Customers';
import Dispatchers from './pages/Dispatchers';
import Workers from './pages/Workers';
import Jarimalar from './pages/Jarimalar';
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    // `SettingsProvider` wraps `AuthProvider`, not the other way round: the login screen shows the
    // shop's name and sits outside authentication, so the settings have to be readable without a
    // signed-in user. It reads `/settings/public/`, which answers anonymously.
    <SettingsProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Outside `Layout` on purpose: the till is full screen with no sidebar, so it cannot
                be a child route of the shell that draws one. */}
            <Route
              path="/kassa"
              element={
                <PrivateRoute>
                  <ProtectedRoute permission="sales.complete_pay">
                    <Pos />
                  </ProtectedRoute>
                </PrivateRoute>
              }
            />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<DefaultHomeRedirect />} />
              <Route
                path="dashboard"
                element={
                  <ProtectedRoute permission="dashboard.view">
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="products"
                element={
                  <ProtectedRoute permission="products.view">
                    <Products />
                  </ProtectedRoute>
                }
              />
              <Route
                path="inventory/products"
                element={
                  <ProtectedRoute permission="inventory.view">
                    <Inventory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="inventory/packages"
                element={
                  <ProtectedRoute permission="packages.view">
                    <Packages />
                  </ProtectedRoute>
                }
              />
              <Route
                path="inventory/stock-counts"
                element={
                  <ProtectedRoute permission="inventory.count">
                    <StockCounts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="reports"
                element={
                  <ProtectedRoute permission="dashboard.ceo">
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="orders"
                element={
                  <ProtectedRoute permission="orders.view">
                    <Orders />
                  </ProtectedRoute>
                }
              />
              <Route
                path="sales"
                element={
                  <ProtectedRoute permission="sales.view">
                    <Sales />
                  </ProtectedRoute>
                }
              />
              <Route
                path="returns"
                element={
                  <ProtectedRoute permission="returns.view">
                    <Returns />
                  </ProtectedRoute>
                }
              />
              <Route
                path="finance"
                element={
                  <ProtectedRoute permission="finance.view">
                    <Finance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="receivables-payables"
                element={
                  <ProtectedRoute permission="receivables.view">
                    <ReceivablesPayables />
                  </ProtectedRoute>
                }
              />
              <Route
                path="credit-sales"
                element={
                  <ProtectedRoute permission="credit_sales.view">
                    <CreditSales />
                  </ProtectedRoute>
                }
              />
              {/* To'lovlar nazorati: money promised by a third party, as two pages under one
                  sidebar group -- the Ombor shape. **Each page is gated on its own single
                  permission**, which is the whole gain over the tab shell: the accountant holds
                  `transfer.view` alone and whoever watches the gateways holds
                  `gateway.view_pending` alone, and neither route has to be opened to the other's
                  code to let its own reader in. */}
              <Route
                path="payments-control/online"
                element={
                  <ProtectedRoute permission="gateway.view_pending">
                    <GatewayPayments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payments-control/billing"
                element={
                  <ProtectedRoute permission="transfer.view">
                    <TransferPayments />
                  </ProtectedRoute>
                }
              />
              {/* The group's own path and the older `/gateway-payments`, both kept: they are in
                  bookmarks and in the deploy notes, and a dead link is a support call. Neither is
                  in any menu; both redirect to whichever page the reader may open. */}
              <Route
                path="payments-control"
                element={
                  <ProtectedRoute permissionAny={['gateway.view_pending', 'transfer.view']}>
                    <PaymentsControl />
                  </ProtectedRoute>
                }
              />
              <Route
                path="gateway-payments"
                element={
                  <ProtectedRoute permissionAny={['gateway.view_pending', 'transfer.view']}>
                    <PaymentsControl />
                  </ProtectedRoute>
                }
              />
              <Route
                path="equity"
                element={
                  <ProtectedRoute permission="equity.view">
                    <Equity />
                  </ProtectedRoute>
                }
              />
              <Route
                path="fixed-assets"
                element={
                  <ProtectedRoute permission="fixed_assets.view">
                    <FixedAssets />
                  </ProtectedRoute>
                }
              />
              <Route
                path="profit-loss"
                element={
                  <ProtectedRoute permission="finance.profit_loss">
                    <ProfitLoss />
                  </ProtectedRoute>
                }
              />
              <Route
                path="balance-sheet"
                element={
                  <ProtectedRoute permission="finance.balance_sheet">
                    <BalanceSheet />
                  </ProtectedRoute>
                }
              />
              <Route
                path="money-balance"
                element={
                  <ProtectedRoute permission="cash.view">
                    <MoneyBalance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="bonus-rules"
                element={
                  <ProtectedRoute permission="bonus.manage">
                    <BonusRules />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute permission="users.view">
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route
                path="change-password"
                element={
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <ProtectedRoute permission="audit_logs.view">
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="customers"
                element={
                  <ProtectedRoute permission="customers.view">
                    <Customers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dispatchers"
                element={
                  <ProtectedRoute permission="dispatch.view">
                    <Dispatchers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="workers"
                element={
                  <ProtectedRoute permission="workers.view">
                    <Workers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="jarimalar"
                element={
                  <ProtectedRoute permission="penalties.manage">
                    <Jarimalar />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute permission="settings.manage">
                    <Settings />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
