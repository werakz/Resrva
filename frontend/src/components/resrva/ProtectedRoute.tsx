import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { LoadingState } from "./LoadingState";

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingState label="Checking manager session" />;
  }

  if (!user || user.role !== "manager") {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
}
