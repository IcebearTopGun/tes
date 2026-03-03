import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BookOpen, LogOut, LayoutDashboard } from "lucide-react";

export function Navbar() {
  const { user, role, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="h-8 w-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">EduSync</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href={role === "teacher" ? "/teacher-dashboard" : "/student-dashboard"}>
                <Button variant="ghost" size="sm" className="hidden sm:flex font-medium">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-border/50">
                <div className="hidden md:block text-sm text-right">
                  <p className="font-medium text-foreground leading-none">{user.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">{role}</p>
                </div>
                <Button variant="outline" size="icon" onClick={() => logout()} className="rounded-full shadow-sm hover:shadow transition-all">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" className="font-medium">Log in</Button>
              </Link>
              <Link href="/login">
                <Button className="font-medium rounded-full shadow-premium hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
