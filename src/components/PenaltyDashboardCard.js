import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

export default function PenaltyDashboardCard() {
  const { hasPermission, isAdmin } = usePermissions();
  const canViewOwn = hasPermission('penalties.view_own') && !isAdmin;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewOwn) {
      setLoading(false);
      return;
    }
    api
      .get('/penalties/summary/')
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [canViewOwn]);

  if (!canViewOwn) return null;
  if (loading) {
    return (
      <div className="dash-kpi-card" style={{ marginBottom: 16 }}>
        <div className="dash-kpi-label">Jarimalar (penalties)</div>
        <div className="dash-kpi-value">…</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="table-card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Jarimalar — your penalties</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>Total points</div>
          <strong>{Number(data.total_points || 0).toLocaleString()}</strong>
        </div>
        <div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>Total amount</div>
          <strong>{Number(data.total_amount || 0).toLocaleString()}</strong>
        </div>
        <div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>Records</div>
          <strong>{data.count ?? 0}</strong>
        </div>
      </div>
      {data.recent?.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Points</th>
              <th>Amount</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((p) => (
              <tr key={p.id}>
                <td>{p.penalty_date}</td>
                <td>{p.points}</td>
                <td>
                  {p.amount} {p.currency}
                </td>
                <td style={{ maxWidth: 280 }}>{p.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#666', margin: 0 }}>No penalties on record.</p>
      )}
    </div>
  );
}
