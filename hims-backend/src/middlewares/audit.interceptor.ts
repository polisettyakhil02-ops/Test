import type { Request, Response, NextFunction } from "express";
import { AuditLog } from "../models/audit/AuditLog.model.js";
import { AuditAction } from "../types/common.types.js";

/** Liveness/readiness probes fire constantly and touch no patient data — logging them would just be noise in the compliance trail. */
const AUDIT_EXCLUDED_PATHS = new Set(["/healthz", "/readyz"]);

function methodToAction(method: string): AuditAction {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return AuditAction.READ;
    case "POST":
      return AuditAction.CREATE;
    case "PUT":
    case "PATCH":
      return AuditAction.UPDATE;
    case "DELETE":
      return AuditAction.DELETE;
    default:
      return AuditAction.READ;
  }
}

/** Picks the record id out of the route params: `:id` first, then anything shaped like `...Id`, e.g. `:patientId`. */
function extractTargetResourceId(params: Request["params"]): string | undefined {
  if (typeof params.id === "string") {
    return params.id;
  }
  const idKey = Object.keys(params).find((key) => /Id$/.test(key));
  return idKey ? (params[idKey] as string) : undefined;
}

/** Falls back to the first non-version path segment after `/api`, e.g. `/api/v1/patients/64f.../admit` -> "patients". */
function inferResourceType(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  const relevant = apiIndex >= 0 ? segments.slice(apiIndex + 1) : segments;
  const firstNonVersionSegment = relevant.find((segment) => !/^v\d+$/i.test(segment));
  return firstNonVersionSegment ?? "unknown";
}

/**
 * Immutable audit-trail writer for HIPAA/DPDP compliance. Mount as
 * `app.use(auditInterceptor())` globally, or per-router with an explicit
 * resource name — `router.use(auditInterceptor("Patient"))` — when the
 * URL shape doesn't cleanly imply the resource. Hooks `res.on("finish")`
 * so the write happens only after headers are flushed to the client
 * (i.e. after the response is "successfully sent"), and never blocks the
 * response: the AuditLog insert runs fire-and-forget on the event loop,
 * with failures caught and logged rather than surfaced to the caller.
 */
export function auditInterceptor(resourceTypeOverride?: string) {
  return function auditInterceptorMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (AUDIT_EXCLUDED_PATHS.has(req.path)) {
      next();
      return;
    }

    res.on("finish", () => {
      void writeAuditLog(req, res, resourceTypeOverride);
    });

    next();
  };
}

async function writeAuditLog(req: Request, res: Response, resourceTypeOverride?: string): Promise<void> {
  try {
    const statusCode = res.statusCode;
    const status: "SUCCESS" | "FAILED" = statusCode < 400 ? "SUCCESS" : "FAILED";
    const action = statusCode === 403 ? AuditAction.PERMISSION_DENIED : methodToAction(req.method);

    await AuditLog.create({
      action,
      resourceType: resourceTypeOverride ?? inferResourceType(req.path),
      resourceId: extractTargetResourceId(req.params),
      performedByUserId: req.user?.id,
      performedByUsername: req.user?.username,
      performedByRoles: req.user?.roles,
      ipAddress: req.ip ?? req.socket.remoteAddress ?? "unknown",
      userAgent: req.headers["user-agent"],
      requestMethod: req.method,
      requestPath: req.originalUrl,
      statusCode,
      status,
      reasonDenied: statusCode === 403 ? "Insufficient permissions" : undefined,
      occurredAt: new Date(),
    });
  } catch (err) {
    // Audit logging must never take down the request pipeline or mask the
    // real response — log-and-swallow rather than propagate.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write audit log entry", err);
  }
}
