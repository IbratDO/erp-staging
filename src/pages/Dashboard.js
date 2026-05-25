import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './Dashboard.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats/');
      setStats(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="page-container">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="page-container error">{error}</div>;
  }

  if (!stats) {
    return <div className="page-container">No data available</div>;
  }

  const { business_metrics, user_metrics, time_based_metrics, trends, status_distribution, expense_metrics, shared_dashboard, ceo_dashboard, role_code } = stats;

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      {/* Business Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Sales (Units)</div>
          <div className="metric-value">{business_metrics.total_sales_units}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Revenue (USD booked)</div>
          <div className="metric-value">${(business_metrics.sales_revenue_usd ?? business_metrics.total_sales_revenue ?? 0).toLocaleString()}</div>
          <div className="metric-subvalue" style={{ fontSize: '0.82em', color: '#777' }}>
            Confirmed · dispatched · completed
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Revenue (UZS booked)</div>
          <div className="metric-value">
            {(business_metrics.sales_revenue_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
          </div>
          <div className="metric-subvalue" style={{ fontSize: '0.82em', color: '#777' }}>
            Same pipeline
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Orders</div>
          <div className="metric-value">{business_metrics.total_orders}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Returns</div>
          <div className="metric-value">{business_metrics.total_returns}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Inventory cost (USD)</div>
          <div className="metric-value">${(business_metrics.inventory_value_usd ?? business_metrics.inventory_value).toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Inventory cost (UZS)</div>
          <div className="metric-value">
            {(business_metrics.inventory_value_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Expenses (USD)</div>
          <div className="metric-value" style={{ color: '#e74c3c' }}>
            ${(business_metrics.total_expenses_usd ?? business_metrics.total_expenses ?? 0).toLocaleString()}
          </div>
          <div className="metric-subvalue" style={{ fontSize: '0.82em', color: '#777' }}>
            All completed expense records (USD‑denominated)
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Expenses (UZS)</div>
          <div className="metric-value" style={{ color: '#e74c3c' }}>
            {(business_metrics.total_expenses_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Profit estimate (USD)</div>
          <div
            className="metric-value"
            style={{
              color: (business_metrics.profit_estimation_usd ?? business_metrics.profit_estimation ?? 0) >= 0
                ? '#27ae60'
                : '#e74c3c',
            }}
          >
            ${(business_metrics.profit_estimation_usd ?? business_metrics.profit_estimation ?? 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="metric-subvalue" style={{ fontSize: '0.82em', color: '#777' }}>
            USD revenue − USD order COGS − USD expenses (no FX)
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Profit estimate (UZS)</div>
          <div
            className="metric-value"
            style={{ color: (business_metrics.profit_estimation_uzs ?? 0) >= 0 ? '#27ae60' : '#e74c3c' }}
          >
            {(business_metrics.profit_estimation_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
          </div>
          <div className="metric-subvalue" style={{ fontSize: '0.82em', color: '#777' }}>
            UZS revenue − supplier UZS (paid or planned) − UZS expenses
          </div>
        </div>
      </div>

      {/* Expense Breakdown */}
      {expense_metrics && (
        <div className="section">
          <h2>Expense Breakdown</h2>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Delivery (USD)</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                ${(expense_metrics.delivery_costs_usd ?? expense_metrics.delivery_costs ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Delivery (UZS)</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                {(expense_metrics.delivery_costs_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Manual (USD)</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                ${(expense_metrics.manual_expenses_usd ?? expense_metrics.manual_expenses ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Manual (UZS)</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                {(expense_metrics.manual_expenses_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Order COGS (USD)</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                ${(business_metrics.total_cost || 0).toLocaleString()}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Order COGS (UZS)</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                {(business_metrics.total_order_cost_uzs ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} UZS
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expenses by Type Chart */}
      {expense_metrics && expense_metrics.expenses_by_type && expense_metrics.expenses_by_type.length > 0 && (
        <div className="section">
          <h2>Expenses by Type</h2>
          <div className="chart-card">
            <h3>Expense Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expense_metrics.expenses_by_type.map(item => ({
                name: item.expense_type ? item.expense_type.replace('_', ' ') : 'Other',
                amount: parseFloat(item.total || 0),
                count: item.count || 0,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="amount" fill="#e74c3c" name="Amount ($)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Time-based Metrics */}
      <div className="section">
        <h2>Time-Based Sales</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Daily Sales</div>
            <div className="metric-value">{time_based_metrics.daily.units} units</div>
            <div className="metric-subvalue">${time_based_metrics.daily.revenue.toLocaleString()}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Weekly Sales</div>
            <div className="metric-value">{time_based_metrics.weekly.units} units</div>
            <div className="metric-subvalue">${time_based_metrics.weekly.revenue.toLocaleString()}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Monthly Sales</div>
            <div className="metric-value">{time_based_metrics.monthly.units} units</div>
            <div className="metric-subvalue">${time_based_metrics.monthly.revenue.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Sales Trends (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends.sales_trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="units" stroke="#8884d8" name="Units Sold" />
              <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Revenue ($)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Return Trends (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends.return_trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#ff8042" name="Returns" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Sales by Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={status_distribution.sales_by_status}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {status_distribution.sales_by_status.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Orders by Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={status_distribution.orders_by_status}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {user_metrics.sales_per_salesman.length > 0 && (
          <div className="chart-card">
            <h3>Sales per Salesman</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={user_metrics.sales_per_salesman}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="salesman__username" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="units_sold" fill="#00C49F" name="Units Sold" />
                <Bar dataKey="revenue" fill="#0088FE" name="Revenue ($)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {shared_dashboard && (
        <section className="dashboard-section">
          <h2>Manager insights</h2>
          {shared_dashboard.my_performance && (
            <div className="metrics-grid" style={{ marginBottom: 16 }}>
              <div className="metric-card">
                <div className="metric-label">Your sales (30d)</div>
                <div className="metric-value">{shared_dashboard.my_performance.sales_count}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Your units (30d)</div>
                <div className="metric-value">{shared_dashboard.my_performance.units}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Your revenue (30d)</div>
                <div className="metric-value">{shared_dashboard.my_performance.revenue?.toLocaleString()}</div>
              </div>
            </div>
          )}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">New customers (30d)</div>
              <div className="metric-value">{shared_dashboard.new_customers}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Returning customers</div>
              <div className="metric-value">{shared_dashboard.returning_customers}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Your bonus (accumulated)</div>
              <div className="metric-value">{shared_dashboard.bonus_accumulated?.toLocaleString()}</div>
            </div>
          </div>
          {shared_dashboard.category_donut?.length > 0 && (
            <div className="chart-card">
              <h3>Sales by category</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={shared_dashboard.category_donut.map((r) => ({
                      name: r.product__category || 'Uncategorized',
                      value: Number(r.revenue) || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {shared_dashboard.category_donut.map((_, index) => (
                      <Cell key={`cat-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {ceo_dashboard && role_code === 'ceo' && (
        <section className="dashboard-section ceo-dashboard">
          <h2>CEO analytics</h2>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Daily net profit (USD)</div>
              <div className="metric-value">${ceo_dashboard.daily_net_profit_usd?.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Monthly net profit (USD)</div>
              <div className="metric-value">${ceo_dashboard.monthly_net_profit_usd?.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">UZS free cash</div>
              <div className="metric-value">
                {ceo_dashboard.cash_availability?.uzs_free_cash?.toLocaleString()} UZS
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">USD free cash</div>
              <div className="metric-value">${ceo_dashboard.cash_availability?.usd_free_cash?.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Inventory turnover</div>
              <div className="metric-value">{ceo_dashboard.inventory_turnover_ratio?.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Sales acquisition cost</div>
              <div className="metric-value">${ceo_dashboard.marketing_metrics?.sales_acquisition_cost?.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Customer acquisition cost (CAC)</div>
              <div className="metric-value">${ceo_dashboard.marketing_metrics?.cac?.toFixed(2)}</div>
            </div>
          </div>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Inventory aging 3–5 mo (units)</div>
              <div className="metric-value">{ceo_dashboard.inventory_aging_units?.['3_5_months']}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Inventory aging 5–8 mo (units)</div>
              <div className="metric-value">{ceo_dashboard.inventory_aging_units?.['5_8_months']}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Inventory aging 8+ mo (units)</div>
              <div className="metric-value">{ceo_dashboard.inventory_aging_units?.['8_plus_months']}</div>
            </div>
          </div>
          {ceo_dashboard.gross_profit_by_manager?.length > 0 && (
            <div className="chart-card">
              <h3>Gross profit by manager</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ceo_dashboard.gross_profit_by_manager}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="manager" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="estimated_gross_profit" fill="#00C49F" name="Est. gross profit" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {ceo_dashboard.shop_vs_delivery?.length > 0 && (
            <div className="chart-card">
              <h3>Shop vs delivery sales</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ceo_dashboard.shop_vs_delivery}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sale_type" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#0088FE" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default Dashboard;

