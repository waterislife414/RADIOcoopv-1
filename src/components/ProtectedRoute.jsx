import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/" replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { currentUser, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!currentUser || !isAdmin) return <Navigate to="/admin/login" replace />;
  return children;
}
