import { usePermissions } from '../hooks/usePermissions';

/**
 * Renders children only when the user has the required permission(s).
 */
const PermissionGate = ({ permission, permissionAny, permissionAll, children, fallback = null }) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let allowed = true;
  if (permission) allowed = hasPermission(permission);
  if (allowed && permissionAny?.length) allowed = hasAnyPermission(permissionAny);
  if (allowed && permissionAll?.length) allowed = hasAllPermissions(permissionAll);

  if (!allowed) return fallback;
  return children;
};

export default PermissionGate;
