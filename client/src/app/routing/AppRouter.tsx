import { Route, Switch } from "wouter";
import AuthPage from "@/pages/auth/AuthPage";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import NcertChapters from "@/pages/NcertChapters";
import AdminDashboard from "@/pages/dashboard/AdminDashboard";
import PrincipalDashboard from "@/pages/dashboard/PrincipalDashboard";
import StudentDashboard from "@/pages/dashboard/StudentDashboard";
import StudentEvaluationsPage from "@/pages/dashboard/StudentEvaluationsPage";
import StudentHomeworkPage from "@/pages/dashboard/StudentHomeworkPage";
import TeacherDashboard from "@/pages/dashboard/TeacherDashboard";
import { ProtectedRoute } from "./ProtectedRoute";

export function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login">{() => <AuthPage mode="login" />}</Route>

      <Route path="/teacher-dashboard">
        {() => <ProtectedRoute component={TeacherDashboard} allowedRole="teacher" />}
      </Route>
      <Route path="/student-dashboard">
        {() => <ProtectedRoute component={StudentDashboard} allowedRole="student" />}
      </Route>
      <Route path="/student-dashboard/homework">
        {() => <ProtectedRoute component={StudentHomeworkPage} allowedRole="student" />}
      </Route>
      <Route path="/student-dashboard/evaluations">
        {() => <ProtectedRoute component={StudentEvaluationsPage} allowedRole="student" />}
      </Route>
      <Route path="/ncert-chapters">{() => <ProtectedRoute component={NcertChapters} allowedRole="teacher" />}</Route>
      <Route path="/admin-dashboard">{() => <ProtectedRoute component={AdminDashboard} allowedRole="admin" />}</Route>
      <Route path="/principal-dashboard">{() => <ProtectedRoute component={PrincipalDashboard} allowedRole="principal" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}
