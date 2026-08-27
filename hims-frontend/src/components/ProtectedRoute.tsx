import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { SystemRole } from "@/types/common.types";

/** Gates an entire route subtree behind authentication and, optionally, an allowed-roles list — mirrors the backend's protect -> authorizeRoles chain on the client. */
export function ProtectedRoute({ roles }: { roles?: SystemRole[] }) {
  const { status, isAuthenticated, hasRole } = useAuth();
  const location = useLocation();

  if (status === "idle" || status === "loading") {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !hasRole(...roles)) {
    return (
      <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold text-slate-900">Not authorized</p>
        <p className="text-sm text-slate-500">Your role doesn&apos;t have access to this page.</p>
      </div>
    );
  }

  return <Outlet />;
}
