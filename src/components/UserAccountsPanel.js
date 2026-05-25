import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

const emptyUser = () => ({
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  role: '',
  password: '',
  is_active: true,
});

/**
 * Manage ERP login accounts: username, password, role (CEO / Senior / Sales Manager / Dispatcher).
 * Used on /users and as a tab under Workers for admins.
 */
const UserAccountsPanel = ({ embedded = false }) => {
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
    setFormData({
      username: user.username,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || '',
      password: '',
      is_active: user.is_active !== false,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      username: formData.username,
      email: formData.email,
      first_name: formData.first_name,
      last_name: formData.last_name,
      role: formData.role ? Number(formData.role) : null,
      is_active: formData.is_active,
    };
    if (formData.password) payload.password = formData.password;
    try {
      if (editingId) {
        await api.patch(`/users/${editingId}/`, payload);
      } else {
        if (!formData.password) {
          alert('Password is required for new users');
          return;
        }
        await api.post('/users/', { ...payload, password: formData.password });
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Could not save user');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this login account?')) return;
    try {
      await api.delete(`/users/${id}/`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not delete user');
    }
  };

  if (loading) {
    return embedded
      ? <div>Loading accounts…</div>
      : <div className="page-container">Loading...</div>;
  }

  return (
    <div className={embedded ? '' : 'page-container'}>
      {!embedded && (
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Users &amp; Roles</h1>
          {canManage && (
            <button type="button" className="btn-primary" onClick={openCreate}>+ New login account</button>
          )}
        </div>
      )}

      {embedded && canManage && (
        <>
          <p style={{ color: '#666', marginBottom: 12, fontSize: '0.95em' }}>
            Create ERP login accounts and assign roles: CEO, Senior Sales Manager, Sales Manager, or Dispatcher.
          </p>
          <div style={{ marginBottom: 16 }}>
            <button type="button" className="btn-primary" onClick={openCreate}>+ New login account</button>
          </div>
        </>
      )}

      {showForm && canManage && (
        <div className="form-card" style={{ display: 'block', marginBottom: 16 }}>
          <h2>{editingId ? 'Edit login account' : 'New login account'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              <label>
                Login (username) *
                <input
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={!!editingId}
                  autoComplete="off"
                />
              </label>
              <label>
                Password {editingId ? '(leave blank to keep)' : '*'}
                <input
                  type="password"
                  required={!editingId}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Role *
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="">Select role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Email
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </label>
              <label>
                First name
                <input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
              </label>
              <label>
                Last name
                <input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Active (can log in)
              </label>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary">Save</button>
              <button type="button" className="btn-edit" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-card" style={{ display: 'block' }}>
        <div className="data-table-scroll" style={{ display: 'block' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Login</th>
                <th>Role</th>
                <th>Name</th>
                <th>Email</th>
                <th>Active</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} style={{ textAlign: 'center' }}>
                    No login accounts yet
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.username}</strong></td>
                    <td>{u.role_name || u.role_code || '—'}</td>
                    <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td>{u.email || '—'}</td>
                    <td>{u.is_active !== false ? 'Yes' : 'No'}</td>
                    {canManage && (
                      <td>
                        <button type="button" className="btn-edit" onClick={() => openEdit(u)}>Edit</button>
                        {' '}
                        <button type="button" className="btn-delete" onClick={() => handleDelete(u.id)}>Delete</button>
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
