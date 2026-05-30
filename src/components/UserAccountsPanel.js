import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import useAppTranslation from '../hooks/useAppTranslation';
import PageTitle from './PageTitle';

const emptyUser = () => ({
  username: '',
  phone: '+998',
  first_name: '',
  last_name: '',
  role: '',
  password: '',
  is_active: true,
});

/**
 * Manage ERP login accounts. Dispatcher / sales roles sync to Dispatchers & Workers tabs.
 */
const UserAccountsPanel = () => {
  const { t } = useAppTranslation(['users', 'common']);
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('users.manage');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyUser());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/users/'),
        api.get('/roles/'),
      ]);
      setUsers(usersRes.data.results || usersRes.data);
      setRoles(rolesRes.data.results || rolesRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyUser());
    setShowForm(true);
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    const roleId = user.role ?? user.role_id ?? '';
    setFormData({
      username: user.username,
      phone: user.phone || '+998',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: roleId ? String(roleId) : '',
      password: '',
      is_active: user.is_active !== false,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const phone = String(formData.phone || '').trim();
    if (!phone || phone === '+998') {
      alert(t('errPhone'));
      return;
    }
    const username = String(formData.username || '').trim();
    if (!username) {
      alert(t('errUsername'));
      return;
    }
    const payload = {
      username,
      phone,
      first_name: String(formData.first_name || '').trim(),
      last_name: String(formData.last_name || '').trim(),
      role: formData.role ? Number(formData.role) : null,
      is_active: formData.is_active,
      email: '',
    };
    if (formData.password) payload.password = formData.password;
    try {
      if (editingId) {
        await api.patch(`/users/${editingId}/`, payload);
      } else {
        if (!formData.password) {
          alert(t('errPasswordNew'));
          return;
        }
        await api.post('/users/', { ...payload, password: formData.password });
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || JSON.stringify(err.response?.data) || t('errSave'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await api.delete(`/users/${id}/`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || t('errDelete'));
    }
  };

  if (loading) {
    return <div className="page-container">{t('actions.loading', { ns: 'common' })}</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <PageTitle ns="users" titleKey="titleFull" />
        {canManage && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            + {t('newLogin')}
          </button>
        )}
      </div>

      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.95em' }}>{t('intro')}</p>

      {showForm && canManage && (
        <div className="form-card">
          <h2>{editingId ? t('editLogin') : t('newLogin')}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('firstName')}</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder={t('firstNamePlaceholder')}
                />
              </div>
              <div className="form-group">
                <label>{t('lastName')}</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('loginUsername')} *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>
                  {t('password')} {editingId ? t('passwordKeepBlank') : '*'}
                </label>
                <input
                  type="password"
                  required={!editingId}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>{t('role')} *</label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="">{t('selectRole')}</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('phoneNumber')} *</label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+998901234567"
                />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  {t('activeCanLogin')}
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {t('actions.save', { ns: 'common' })}
              </button>
              <button type="button" className="btn-edit" onClick={() => setShowForm(false)}>
                {t('actions.cancel', { ns: 'common' })}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-card">
        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('colLogin')}</th>
                <th>{t('role')}</th>
                <th>{t('colName')}</th>
                <th>{t('colPhone')}</th>
                <th>{t('colActive')}</th>
                {canManage && <th>{t('table.actions', { ns: 'common' })}</th>}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} style={{ textAlign: 'center' }}>
                    {t('emptyAccounts')}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.username}</strong>
                    </td>
                    <td>{u.role_name || u.role_code || '—'}</td>
                    <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td>{u.phone || '—'}</td>
                    <td>{u.is_active !== false ? t('yes', { ns: 'common' }) : t('no', { ns: 'common' })}</td>
                    {canManage && (
                      <td>
                        <button type="button" className="btn-edit" onClick={() => openEdit(u)}>
                          {t('actions.edit', { ns: 'common' })}
                        </button>{' '}
                        <button type="button" className="btn-delete" onClick={() => handleDelete(u.id)}>
                          {t('actions.delete', { ns: 'common' })}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserAccountsPanel;
