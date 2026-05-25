import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  canAccessRoute,
  filterMenuItems,
  getRoleCode,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isCEO,
} from '../utils/permissions';

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(
    () => ({
      user,
      roleCode: getRoleCode(user),
      isCEO: isCEO(user),
      hasPermission: (code) => hasPermission(user, code),
      hasAnyPermission: (codes) => hasAnyPermission(user, codes),
      hasAllPermissions: (codes) => hasAllPermissions(user, codes),
      canAccessRoute: (path) => canAccessRoute(user, path),
      menuItems: filterMenuItems(user),
    }),
    [user]
  );
}

export default usePermissions;
