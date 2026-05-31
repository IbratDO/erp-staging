import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

const PrivateRoute = ({ children }) => {
  const { t } = useTranslation('common');
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>{t('actions.loadingPage')}</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default PrivateRoute;
