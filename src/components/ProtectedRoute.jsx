import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ApprovalPopup from "./admin/ApprovalPopup";

export function RequireAuth({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/" replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { currentUser, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!currentUser || !isAdmin) return <Navigate to="/admin/login" replace />;
  // Driver permission requests pop up over every dispatcher page.
  return (
    <>
      {children}
      <ApprovalPopup />
    </>
  );
}

// Driver area: any signed-in account can open it — the page itself shows
// "application pending" until Malcolm approves and the driver role is set.
export function RequireDriverSignIn({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/driver/sign-in" replace />;
  return children;
}
