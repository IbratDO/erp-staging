import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { formatDisplayAmount, formatPlainAmount } from '../utils/currencyFormat';
import SortableTh from '../components/SortableTh';
import { useClientTableSort } from '../utils/tableSort';
import './TablePage.css';

const WORKERS_SORT = {
  id: (w) => Number(w.id) || 0,
  name: (w) => String(w.name ?? '').toLowerCase(),
  telephone: (w) => String(w.telephone ?? '').toLowerCase(),
  notes: (w) => String(w.notes ?? '').toLowerCase(),
};

const WORKER_PERF_SALES_SORT = {
  date: (s) => new Date(s.sale_date).getTime() || 0,
  product: (s) =>
    s.product_detail
      ? `${s.product_detail.brand} ${s.product_detail.model}`.toLowerCase()
      : String(s.product ?? ''),
  quantity: (s) => Number(s.quantity) || 0,
  price: (s) => Number(s.selling_price) || 0,
  total: (s) => Number(s.total_amount) || 0,
  type: (s) => String(s.sale_type ?? '').toLowerCase(),
  status: (s) => String(s.status ?? '').toLowerCase(),
  customer: (s) => String(s.customer_detail?.name ?? '').toLowerCase(),
};

const WORKER_TX_SORT = {
  date: (r) => new Date(r.transaction_date).getTime() || 0,
  type: (r) => String(r.expense_type ?? '').toLowerCase(),
  amount: (r) => Number(r.amount) || 0,
  currency: (r) => String(r.currency ?? '').toLowerCase(),
  notes: (r) => String(r.notes ?? '').toLowerCase(),
};

const Workers = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerPerformance, setWorkerPerformance] = useState(null);
  const [workerTransactions, setWorkerTransactions] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    telephone: '+998',
    notes: '',
  });

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const response = await api.get('/workers/');
      setWorkers(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching workers:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Refetch workers after creating/updating
  useEffect(() => {
    if (!showForm) {
      fetchWorkers();
    }
  }, [showForm]);

  const handleViewPerformance = async (worker) => {
    try {
      const response = await api.get(`/workers/${worker.id}/performance/`, {
        params: { year: selectedYear, month: selectedMonth }
      });
      setWorkerPerformance(response.data);
      setSelectedWorker(worker);
      setWorkerTransactions(null);
    } catch (error) {
      console.error('Error fetching worker performance:', error);
      alert('Error fetching worker performance');
    }
  };

  const handleViewTransactions = async (worker) => {
    try {
      const response = await api.get(`/workers/${worker.id}/transactions/`);
      setWorkerTransactions(response.data);
      setSelectedWorker(worker);
      setWorkerPerformance(null);
    } catch (error) {
      console.error('Error fetching worker transactions:', error);
      alert('Error fetching worker transactions');
    }
  };

  const handleEdit = (worker) => {
    setFormData({
      id: worker.id,
      name: worker.name || '',
      telephone: worker.telephone || '+998',
      notes: worker.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.notes || '').trim()) {
      alert('Please enter notes.');
      return;
    }
    try {
      if (formData.id) {
        await api.put(`/workers/${formData.id}/`, formData);
      } else {
        await api.post('/workers/', formData);
      }
      setShowForm(false);
      setFormData({ name: '', telephone: '+998', notes: '' });
      fetchWorkers();
    } catch (error) {
      console.error('Error saving worker:', error);
      alert(error.response?.data?.error || error.response?.data?.detail || 'Error saving worker');
    }
  };

  const handleDelete = async (workerId) => {
    if (window.confirm('Are you sure you want to delete this worker?')) {
      try {
        await api.delete(`/workers/${workerId}/`);
        fetchWorkers();
        if (selectedWorker?.id === workerId) {
          setSelectedWorker(null);
          setWorkerTransactions(null);
        }
      } catch (error) {
        console.error('Error deleting worker:', error);
        alert(error.response?.data?.error || 'Error deleting worker');
      }
    }
  };

  const workerSort = useClientTableSort(WORKERS_SORT);
  const perfSaleSort = useClientTableSort(WORKER_PERF_SALES_SORT);
  const workerTxSort = useClientTableSort(WORKER_TX_SORT);

  const displayWorkers = useMemo(
    () => workerSort.sortRows(workers),
    [workers, workerSort]
  );
  const displayPerfSales = useMemo(
    () => perfSaleSort.sortRows(workerPerformance?.sales || []),
    [workerPerformance?.sales, perfSaleSort]
  );
  const displayWorkerTx = useMemo(
    () => workerTxSort.sortRows(workerTransactions?.finance_records || []),
    [workerTransactions?.finance_records, workerTxSort]
  );

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Workers</h1>
        <button className="btn-primary" onClick={() => {
          setShowForm(!showForm);
          if (!showForm) {
            setFormData({ name: '', telephone: '+998', notes: '' });
          }
        }}>
          {showForm ? 'Cancel' : '+ New Worker'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="form-card" style={{ marginBottom: '20px' }}>
          <h2>{formData.id ? 'Edit Worker' : 'Add New Worker'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Telephone</label>
                <input
                  type="text"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes *</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  required
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {formData.id ? 'Update Worker' : 'Add Worker'}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ name: '', telephone: '+998', notes: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Workers List */}
      <div className="table-card">
        <h2>Sales Team</h2>
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh columnId="id" sortCol={workerSort.sortCol} sortDir={workerSort.sortDir} onSort={workerSort.onHeaderClick}>
                ID
              </SortableTh>
              <SortableTh columnId="name" sortCol={workerSort.sortCol} sortDir={workerSort.sortDir} onSort={workerSort.onHeaderClick}>
                Name
              </SortableTh>
              <SortableTh columnId="telephone" sortCol={workerSort.sortCol} sortDir={workerSort.sortDir} onSort={workerSort.onHeaderClick}>
                Telephone
              </SortableTh>
              <SortableTh columnId="notes" sortCol={workerSort.sortCol} sortDir={workerSort.sortDir} onSort={workerSort.onHeaderClick}>
                Notes
              </SortableTh>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center' }}>
                  No workers found
                </td>
              </tr>
            ) : (
              displayWorkers.map((worker) => (
                <tr key={worker.id}>
                  <td>#{worker.id}</td>
                  <td>{worker.name}</td>
                  <td>{worker.telephone || '-'}</td>
                  <td>{worker.notes ? (worker.notes.length > 50 ? worker.notes.substring(0, 50) + '...' : worker.notes) : '-'}</td>
                  <td>
                    <button
                      className="btn-edit"
                      onClick={() => handleEdit(worker)}
                      style={{ marginRight: '10px' }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-edit"
                      onClick={() => handleViewPerformance(worker)}
                      style={{ marginRight: '10px' }}
                    >
                      View Performance
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => handleViewTransactions(worker)}
                      style={{ marginRight: '10px' }}
                    >
                      View Transactions
                    </button>
                    <button
                      className="btn-edit"
                      onClick={() => handleDelete(worker.id)}
                      style={{ backgroundColor: '#e74c3c', color: 'white' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3" style={{ textAlign: 'right' }}>
                Total
              </td>
              <td colSpan="2" style={{ textAlign: 'right' }}>
                {workers.length} {workers.length === 1 ? 'worker' : 'workers'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Performance View */}
      {workerPerformance && selectedWorker && (
        <div className="table-card" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>
              Performance: {selectedWorker.name}
            </h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label>
                Year:
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(parseInt(e.target.value));
                    handleViewPerformance(selectedWorker);
                  }}
                  style={{ marginLeft: '5px', padding: '5px' }}
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Month:
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(parseInt(e.target.value));
                    handleViewPerformance(selectedWorker);
                  }}
                  style={{ marginLeft: '5px', padding: '5px' }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>
                      {new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {workerPerformance.salesman ? (
            <>
              {/* Performance Statistics */}
              <div className="metrics-grid" style={{ marginBottom: '20px' }}>
                <div className="metric-card">
                  <div className="metric-label">Period</div>
                  <div className="metric-value">{workerPerformance.period.month_name}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Sales</div>
                  <div className="metric-value" style={{ color: '#3498db' }}>
                    {workerPerformance.statistics.total_sales}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Completed Sales</div>
                  <div className="metric-value" style={{ color: '#27ae60' }}>
                    {workerPerformance.statistics.completed_sales}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Reserved Sales</div>
                  <div className="metric-value" style={{ color: '#9b59b6' }}>
                    {workerPerformance.statistics.reserved_sales || 0}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Pending Sales</div>
                  <div className="metric-value" style={{ color: '#f39c12' }}>
                    {workerPerformance.statistics.pending_sales || 0}
                  </div>
                </div>
                <div className="metric-card" title="May mix UZS and USD">
                  <div className="metric-label">Total Amount (Completed)</div>
                  <div className="metric-value" style={{ color: '#27ae60' }}>
                    {formatPlainAmount(workerPerformance.statistics.total_amount || 0)}
                  </div>
                </div>
                <div className="metric-card" title="May mix UZS and USD">
                  <div className="metric-label">Reserved Amount</div>
                  <div className="metric-value" style={{ color: '#9b59b6' }}>
                    {formatPlainAmount(workerPerformance.statistics.reserved_amount || 0)}
                  </div>
                </div>
                <div className="metric-card" title="May mix UZS and USD">
                  <div className="metric-label">Deposits Received</div>
                  <div className="metric-value" style={{ color: '#9b59b6' }}>
                    {formatPlainAmount(workerPerformance.statistics.reserved_deposits || 0)}
                  </div>
                </div>
              </div>

              {/* Sales List */}
              <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Sales Details</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh columnId="date" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Date
                    </SortableTh>
                    <SortableTh columnId="product" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Product
                    </SortableTh>
                    <SortableTh columnId="quantity" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Quantity
                    </SortableTh>
                    <SortableTh columnId="price" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Price
                    </SortableTh>
                    <SortableTh columnId="total" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Total
                    </SortableTh>
                    <SortableTh columnId="type" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Type
                    </SortableTh>
                    <SortableTh columnId="status" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Status
                    </SortableTh>
                    <SortableTh columnId="customer" sortCol={perfSaleSort.sortCol} sortDir={perfSaleSort.sortDir} onSort={perfSaleSort.onHeaderClick}>
                      Customer
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {workerPerformance.sales.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center' }}>
                        No sales found for this period
                      </td>
                    </tr>
                  ) : (
                    displayPerfSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{new Date(sale.sale_date).toLocaleString()}</td>
                        <td>
                          {sale.product_detail
                            ? `${sale.product_detail.brand} ${sale.product_detail.model} - Size ${sale.product_detail.size} (${sale.product_detail.color})`
                            : `Product #${sale.product}`}
                        </td>
                        <td>{sale.quantity}</td>
                        <td>{formatDisplayAmount(sale.selling_price, sale.sale_currency || 'USD')}</td>
                        <td>{formatDisplayAmount(sale.total_amount, sale.sale_currency || 'USD')}</td>
                        <td>
                          {sale.sale_type === 'bought_from_shop' ? 'Shop' :
                           sale.sale_type === 'from_order' ? 'From Order' : 'Delivery'}
                        </td>
                        <td>
                          <span className={`status-badge ${sale.status}`}>
                            {sale.status}
                          </span>
                        </td>
                        <td>
                          {sale.customer_detail ? sale.customer_detail.name : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              <p>No salesman found matching this worker name. Performance statistics are only available for salesmen.</p>
            </div>
          )}
        </div>
      )}

      {/* Transactions View */}
      {workerTransactions && selectedWorker && (
        <div className="table-card" style={{ marginTop: '20px' }}>
          <h2>
            Transactions: {selectedWorker.name}
          </h2>

          {/* Transaction Summary */}
          <div className="metrics-grid" style={{ marginBottom: '20px' }}>
            <div className="metric-card">
              <div className="metric-label">Total Salary</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                ${parseFloat(workerTransactions.summary.total_salary || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Lunch Expenses</div>
              <div className="metric-value" style={{ color: '#e74c3c' }}>
                ${parseFloat(workerTransactions.summary.total_lunch || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Prepayments</div>
              <div className="metric-value" style={{ color: '#f39c12' }}>
                ${parseFloat(workerTransactions.summary.total_prepayments || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Transactions</div>
              <div className="metric-value">
                {workerTransactions.summary.total_transactions}
              </div>
            </div>
          </div>

          {/* Transaction History */}
          <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Transaction History</h3>
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh columnId="date" sortCol={workerTxSort.sortCol} sortDir={workerTxSort.sortDir} onSort={workerTxSort.onHeaderClick}>
                  Date
                </SortableTh>
                <SortableTh columnId="type" sortCol={workerTxSort.sortCol} sortDir={workerTxSort.sortDir} onSort={workerTxSort.onHeaderClick}>
                  Type
                </SortableTh>
                <SortableTh columnId="amount" sortCol={workerTxSort.sortCol} sortDir={workerTxSort.sortDir} onSort={workerTxSort.onHeaderClick}>
                  Amount
                </SortableTh>
                <SortableTh columnId="currency" sortCol={workerTxSort.sortCol} sortDir={workerTxSort.sortDir} onSort={workerTxSort.onHeaderClick}>
                  Currency
                </SortableTh>
                <SortableTh columnId="notes" sortCol={workerTxSort.sortCol} sortDir={workerTxSort.sortDir} onSort={workerTxSort.onHeaderClick}>
                  Notes
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {workerTransactions.finance_records.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center' }}>
                    No transactions found
                  </td>
                </tr>
              ) : (
                displayWorkerTx.map((record) => (
                  <tr key={record.id}>
                    <td>{new Date(record.transaction_date).toLocaleString()}</td>
                    <td>
                      <span className={`status-badge ${record.expense_type === 'salary' ? 'confirmed' : 'pending'}`}>
                        {record.expense_type === 'salary' ? 'Salary' : 'Lunch'}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600', color: '#e74c3c' }}>
                      -{formatDisplayAmount(record.amount, record.currency || 'USD')}
                    </td>
                    <td>{record.currency || 'USD'}</td>
                    <td>{record.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Workers;

