import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultHomePath } from '../utils/permissions';

/** Index route — sends each role to its primary screen (dispatchers → /dispatchers). */
const DefaultHomeRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={getDefaultHomePath(user)} replace />;
};

export default DefaultHomeRedirect;
