import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { canAccessRoute, getDefaultHomePath, hasPermission } from '../utils/permissions';

/**
 * Route guard — requires auth and optional permission code(s).
 * @param {string} [permission] - single permission code
 * @param {string[]} [permissionAny] - any of these permissions
 * @param {string} [redirectTo] - redirect path when denied (default: role home)
 */
const ProtectedRoute = ({
  children,
  permission,
  permissionAny,
  redirectTo,
}) => {
  const { t } = useTranslation('common');
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading-screen">{t('actions.loadingPage')}</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const deniedRedirect = redirectTo ?? getDefaultHomePath(user);

  const pathPerm = canAccessRoute(user, location.pathname);
  if (!pathPerm) {
    return <Navigate to={deniedRedirect} replace />;
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to={deniedRedirect} replace />;
  }

  if (permissionAny?.length) {
    const ok = permissionAny.some((p) => hasPermission(user, p));
    if (!ok) return <Navigate to={deniedRedirect} replace />;
  }

  return children;
};

export default ProtectedRoute;
