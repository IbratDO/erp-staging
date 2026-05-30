import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';

export default function PenaltyDashboardCard() {
  const { t } = useAppTranslation(['penalties', 'common']);
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
        <div className="dash-kpi-label">{t('title')}</div>
        <div className="dash-kpi-value">…</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="table-card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>
        {t('title')} — {t('yourPenalties')}
      </h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>{t('totalPoints')}</div>
          <strong>{Number(data.total_points || 0).toLocaleString()}</strong>
        </div>
        <div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>{t('totalAmount')}</div>
          <strong>{Number(data.total_amount || 0).toLocaleString()}</strong>
        </div>
        <div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>{t('records')}</div>
          <strong>{data.count ?? 0}</strong>
        </div>
      </div>
      {data.recent?.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('table.date', { ns: 'common' })}</th>
              <th>{t('points', { ns: 'common' })}</th>
              <th>{t('totalAmount')}</th>
              <th>{t('reason')}</th>
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
        <p style={{ color: '#666', margin: 0 }}>{t('noPenalties')}</p>
      )}
    </div>
  );
}
