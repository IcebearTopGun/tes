import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import type { AppRole } from "./types";

interface ProtectedRouteProps {
  component: React.ComponentType;
  allowedRole: AppRole;
}

export function ProtectedRoute({ component: Component, allowedRole }: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (role !== allowedRole) {
        if (role === "teacher") setLocation("/teacher-dashboard");
        else if (role === "admin") setLocation("/admin-dashboard");
        else if (role === "principal") setLocation("/principal-dashboard");
        else setLocation("/student-dashboard");
      }
    }
  }, [user, role, isLoading, allowedRole, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || role !== allowedRole) {
    return null;
  }

  return <Component />;
}
