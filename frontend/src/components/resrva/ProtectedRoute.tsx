import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { LoadingState } from "./LoadingState";

export function ProtectedRoute() {
  const { user, loading, supportMode } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState label="Checking manager session" />;
  }

  if (!user || user.role !== "manager") {
    return <Navigate to="/signin" replace />;
  }

  const isPlatformAdmin = user.is_platform_admin === true || user.is_platform_admin === 1;
  const isPlatformAdminRoute = location.pathname.startsWith("/app/resrva-admin");
  const isProfileRoute = location.pathname.startsWith("/app/profile");

  if (isPlatformAdmin && !supportMode && !isPlatformAdminRoute && !isProfileRoute) {
    return <Navigate to="/app/resrva-admin/clients" replace />;
  }

  return <Outlet />;
}

export function PlatformAdminRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingState label="Checking Resrva owner access" />;
  }

  if (!user || user.role !== "manager") {
    return <Navigate to="/signin" replace />;
  }

  if (user.is_platform_admin !== true && user.is_platform_admin !== 1) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
