import { Navigate, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  hasAuth,
  getUserRole,
  getRoleBasedDashboard,
} from "@/components/auth/ProtectedRoute";

/**
 * Friendly 404 page.
 *
 * Logged-out visitors keep the previous behavior (bounce to the login page).
 * Authenticated users get a real "page not found" with a link back to their
 * role dashboard, instead of the confusing login → dashboard round-trip the
 * old catch-all produced.
 */
export default function NotFound() {
  const navigate = useNavigate();

  if (!hasAuth()) {
    return <Navigate to="/auth/login" replace />;
  }

  const dashboard = getRoleBasedDashboard(getUserRole());

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50/60 to-white px-6 text-center">
      <p className="text-6xl font-bold text-indigo-900">404</p>
      <h1 className="mt-2 text-xl font-semibold text-indigo-900">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist or may have been moved.
      </p>
      <Button
        className="mt-6 bg-indigo-600 hover:bg-indigo-700"
        onClick={() => navigate(dashboard)}
      >
        <Home className="mr-1.5 h-4 w-4" /> Back to dashboard
      </Button>
    </div>
  );
}
