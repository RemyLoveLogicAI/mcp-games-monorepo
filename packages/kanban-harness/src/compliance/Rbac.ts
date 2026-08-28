export type Role = "viewer" | "operator" | "auditor" | "admin";
export type Permission = "task:read" | "task:write" | "task:claim" | "task:transition" | "audit:read" | "admin:manage";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ["task:read"],
  operator: ["task:read", "task:write", "task:claim", "task:transition"],
  auditor: ["task:read", "audit:read"],
  admin: ["task:read", "task:write", "task:claim", "task:transition", "audit:read", "admin:manage"],
};

export interface AuthPrincipal { readonly subject: string; readonly roles: readonly Role[]; readonly correlationId: string; }

export const hasPermission = (principal: AuthPrincipal, permission: Permission): boolean =>
  principal.roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));

export class ForbiddenError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Forbidden: ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export const requirePermission = (principal: AuthPrincipal, permission: Permission): void => {
  if (!hasPermission(principal, permission)) throw new ForbiddenError(permission);
};

export const permissionsFor = (role: Role): readonly Permission[] => ROLE_PERMISSIONS[role];
