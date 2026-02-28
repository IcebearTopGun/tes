import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";

// Pages
import Home from "./pages/Home";
import AuthPage from "./pages/auth/AuthPage";
import TeacherDashboard from "./pages/dashboard/TeacherDashboard";
import StudentDashboard from "./pages/dashboard/StudentDashboard";
import NotFound from "./pages/not-found";

/**
 * A wrapper that enforces authentication and correct roles.
 */
function ProtectedRoute({ 
  component: Component, 
  allowedRole 
}: { 
  component: React.ComponentType, 
  allowedRole: "teacher" | "student" 
}) {
  const { user, role, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (role !== allowedRole) {
        setLocation(role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");
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
    return null; // Will redirect via useEffect
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login">
        {() => <AuthPage mode="login" />}
      </Route>
      <Route path="/signup">
        {() => <AuthPage mode="signup" />}
      </Route>
      
      {/* Protected Routes */}
      <Route path="/teacher-dashboard">
        {() => <ProtectedRoute component={TeacherDashboard} allowedRole="teacher" />}
      </Route>
      <Route path="/student-dashboard">
        {() => <ProtectedRoute component={StudentDashboard} allowedRole="student" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
