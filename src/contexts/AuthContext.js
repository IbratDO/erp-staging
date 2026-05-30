import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { hasPermission, getRoleCode } from '../utils/permissions';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userResponse = await api.get('/users/me/');
      setUser(userResponse.data);
      localStorage.setItem('user', JSON.stringify(userResponse.data));
      return userResponse.data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('access_token');
      if (token) {
        const fresh = await refreshUser();
        if (!fresh && storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } else if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      setLoading(false);
    };
    init();
  }, [refreshUser]);

  const login = async (username, password) => {
    try {
      const response = await api.post('/token/', {
        username,
        password,
      });

      const { access, refresh } = response.data;
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);

      let userData;
      try {
        const userResponse = await api.get('/users/me/');
        userData = userResponse.data;
      } catch {
        userData = { username, role_code: 'sales_manager', permissions: [] };
      }
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));

      return { success: true, user: userData };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    loading,
    refreshUser,
    isAuthenticated: !!user,
    roleCode: getRoleCode(user),
    isAdmin: hasPermission(user, 'finance.create_manual'),
    hasPermission: (code) => hasPermission(user, code),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
