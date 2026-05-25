import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccessRoute, hasPermission } from '../utils/permissions';

/**
 * Route guard — requires auth and optional permission code(s).
 * @param {string} [permission] - single permission code
 * @param {string[]} [permissionAny] - any of these permissions
 * @param {string} [redirectTo] - redirect path when denied (default /dashboard)
 */
const ProtectedRoute = ({
  children,
  permission,
  permissionAny,
  redirectTo = '/dashboard',
}) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const pathPerm = canAccessRoute(user, location.pathname);
  if (!pathPerm) {
    return <Navigate to={redirectTo} replace />;
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to={redirectTo} replace />;
  }

  if (permissionAny?.length) {
    const ok = permissionAny.some((p) => hasPermission(user, p));
    if (!ok) return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default ProtectedRoute;
