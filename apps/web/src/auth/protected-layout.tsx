import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth-context";

export function ProtectedLayout() {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-screen"><div className="auth-card"><div className="loading-line" /><p>Opening the private workspace…</p></div></div>;
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
