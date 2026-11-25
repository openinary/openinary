import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * The admin plugin's view of our roles: who may call its user management
 * endpoints (/admin/list-users, /admin/set-role, ...). Only admins may; member
 * and viewer get no statements. Media permissions live in permissions.ts,
 * which the API enforces; this only covers Better Auth's own routes.
 *
 * Browser-safe, so the dashboard's auth client can share it.
 */
export const accessControl = createAccessControl(defaultStatements);

export const roles = {
  admin: adminAc,
  member: accessControl.newRole({ user: [], session: [] }),
  viewer: accessControl.newRole({ user: [], session: [] }),
};
