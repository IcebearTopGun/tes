import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  Settings, 
  LogOut, 
  Bell, 
  Search,
  User,
  GraduationCap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { name: "Overview", href: user?.role === "teacher" ? "/teacher-dashboard" : "/student-dashboard", icon: LayoutDashboard },
    { name: "Analytics", href: "#", icon: GraduationCap },
    { name: "Resources", href: "#", icon: BookOpen },
    { name: "Community", href: "#", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-mesh flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/40 bg-card/30 backdrop-blur-xl hidden md:flex flex-col sticky top-0 h-screen">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-xl tracking-tight">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
              S
            </div>
            <span>ScholarFlow</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <a className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-premium" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}>
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/40">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive rounded-xl"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Nav */}
        <header className="h-16 border-b border-border/40 bg-background/50 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-50">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md w-full hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search analytics..." 
                className="w-full bg-muted/50 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button size="icon" variant="ghost" className="rounded-xl text-muted-foreground relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full border-2 border-background"></span>
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="p-0 h-9 w-9 rounded-xl overflow-hidden ring-offset-background transition-all hover:ring-2 hover:ring-primary/20">
                  <Avatar className="h-9 w-9 rounded-xl">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {user?.user?.name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-premium">
                <div className="p-4 border-b border-border/40 mb-2">
                  <p className="text-sm font-bold truncate">{user?.user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate uppercase tracking-widest mt-0.5">{user?.role}</p>
                </div>
                <DropdownMenuItem className="rounded-lg gap-2">
                  <User className="h-4 w-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg gap-2 text-destructive focus:text-destructive" onClick={() => logout()}>
                  <LogOut className="h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}