import type { Request, Response, NextFunction } from "express";
import { SystemRole, PermissionAction } from "../types/common.types.js";
import { Role, type PermissionGrant } from "../models/admin/Role.model.js";
import { redis } from "../config/redis.js";

/**
 * Coarse-grained gate: "only these system roles may reach this route".
 * Mount after `authenticate`. This is the RBAC check named in the build
 * spec (`authorizeRoles(...roles)`); for resource/action-level checks
 * driven by the editable permission matrix, see `authorizePermission`
 * below instead.
 */
export function authorizeRoles(...allowedRoles: SystemRole[]) {
  return function authorizeRolesMiddleware(req: Request, res: Response, next: NextFunction): void {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Must be authenticated to access this resource",
      });
      return;
    }

    // SUPER_ADMIN always passes: it is the platform's break-glass role and
    // must never be locked out by an allowlist a route author forgot to
    // extend, so it bypasses both the static allowlist and the permission
    // matrix below rather than needing to be enumerated on every route.
    const isAuthorized =
      user.roles.includes(SystemRole.SUPER_ADMIN) || user.roles.some((role) => allowedRoles.includes(role));
    if (!isAuthorized) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: `Access denied. Requires one of: ${allowedRoles.join(", ")}`,
      });
      return;
    }

    next();
  };
}

const PERMISSION_CACHE_TTL_SECONDS = 300;

function permissionCacheKey(role: SystemRole): string {
  return `rbac:permissions:${role}`;
}

/**
 * Reads a role's permission grants from Redis, falling back to Mongo (and
 * repopulating the cache) on a miss. `Role` documents are edited rarely
 * relative to how often permission checks run, so a short TTL cache turns
 * "hit the Role collection on every request" into a cache hit on all but
 * the first request per role per TTL window.
 */
async function getPermissionGrants(role: SystemRole): Promise<PermissionGrant[]> {
  const cacheKey = permissionCacheKey(role);

  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as PermissionGrant[];
  }

  const roleDoc = await Role.findOne({ systemRole: role }).select("permissions").lean();
  const grants = roleDoc?.permissions ?? [];
  await redis.set(cacheKey, JSON.stringify(grants), "EX", PERMISSION_CACHE_TTL_SECONDS);
  return grants;
}

/** Call after mutating a Role's permissions so the next request sees the change immediately instead of waiting out the TTL. */
export async function invalidatePermissionCache(role: SystemRole): Promise<void> {
  await redis.del(permissionCacheKey(role));
}

async function hasPermission(roles: SystemRole[], resource: string, action: PermissionAction): Promise<boolean> {
  if (roles.includes(SystemRole.SUPER_ADMIN)) {
    return true;
  }
  for (const role of roles) {
    const grants = await getPermissionGrants(role);
    const grant = grants.find((g) => g.resource === resource);
    if (grant?.actions.includes(action)) {
      return true;
    }
  }
  return false;
}

/**
 * Fine-grained gate driven by the editable `Role.permissions` matrix
 * (resource → allowed actions), e.g.
 * `authorizePermission("Prescription", PermissionAction.DISPENSE)`.
 * Use this over `authorizeRoles` wherever the access rule is really about
 * "can this role do X to Y", not "is this role in an allowlist" — it lets
 * an admin regrant access without a code change or redeploy.
 */
export function authorizePermission(resource: string, action: PermissionAction) {
  return async function authorizePermissionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Must be authenticated to access this resource",
        });
        return;
      }

      const allowed = await hasPermission(user.roles, resource, action);
      if (!allowed) {
        res.status(403).json({
          error: "FORBIDDEN",
          message: `Access denied. Missing permission: ${action} on ${resource}`,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
