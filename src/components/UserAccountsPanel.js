import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

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
      alert('Please enter a phone number.');
      return;
    }
    const username = String(formData.username || '').trim();
    if (!username) {
      alert('Please enter a login (username).');
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
    if (!window.confirm('Delete this login account? Linked dispatcher/worker rows will be deactivated.')) return;
    try {
      await api.delete(`/users/${id}/`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not delete user');
    }
  };

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Users &amp; Roles</h1>
        {canManage && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            + New login account
          </button>
        )}
      </div>

      <p style={{ color: '#666', marginBottom: 16, fontSize: '0.95em' }}>
        Create login accounts here. Accounts with Dispatcher role appear in Dispatchers; Sales Manager and
        Senior Sales Manager appear in Workers.
      </p>

      {showForm && canManage && (
        <div className="form-card">
          <h2>{editingId ? 'Edit login account' : 'New login account'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>First name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="Shown in Workers / Dispatchers"
                />
              </div>
              <div className="form-group">
                <label>Last name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Login (username) *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>Password {editingId ? '(leave blank to keep)' : '*'}</label>
                <input
                  type="password"
                  required={!editingId}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
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
              </div>
              <div className="form-group">
                <label>Phone number *</label>
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
                  Active (can log in)
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">Save</button>
              <button type="button" className="btn-edit" onClick={() => setShowForm(false)}>
                Cancel
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
                <th>Login</th>
                <th>Role</th>
                <th>Name</th>
                <th>Phone</th>
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
                    <td>{u.phone || '—'}</td>
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
