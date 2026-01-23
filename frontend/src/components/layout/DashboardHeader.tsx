import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Search, Sun, Cloud, LogOut } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

type User = {
  name: string;
  email: string;
  role: string;
};

export function DashboardHeader() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Get user from sessionStorage first (tab-specific), then localStorage
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'Super Administrator';
      case 'ADMIN': return 'Administrator';
      case 'STAFF': return 'Staff Member';
      default: return role;
    }
  };

  const handleLogout = () => {
    // Clear sessionStorage (tab-specific)
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_session');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('user_name');
    sessionStorage.removeItem('user_id');
    
    // Clear localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('remember_token');
    localStorage.removeItem('user');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_id');
    
    navigate('/auth/login');
  };

  return (
    <header className="
      sticky top-0 z-50 w-full
      border-b border-border
      bg-white/80 backdrop-blur
      supports-[backdrop-filter]:bg-white/60
    ">
      <div className="flex h-16 items-center justify-between px-6 max-w-7xl mx-auto">
        
        {/* Left */}
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold text-indigo-900 tracking-tight">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'User'}
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{currentDate}</span>
            <span className="flex items-center gap-1">
              <Sun className="h-4 w-4 text-warning" />
              <span className="font-medium text-foreground">28°C</span>
              <Cloud className="h-4 w-4 text-muted-foreground" />
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search grievances, visitors..."
              className="
                w-[280px] pl-10
                bg-secondary/60
                border border-border
                focus-visible:ring-1 focus-visible:ring-primary
                rounded-xl
              "
            />
          </div>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-saffron/10"
          >
            <Bell className="h-5 w-5 text-indigo-700" />
            <Badge
              className="
                absolute -top-1 -right-1 h-5 w-5
                p-0 flex items-center justify-center
                bg-saffron text-black font-semibold
              "
            >
              3
            </Badge>
          </Button>

          {/* User Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 pl-4 border-l border-border cursor-pointer hover:opacity-80">
                <Avatar className="h-9 w-9 bg-gradient-to-br from-indigo-600 to-indigo-500">
                  <AvatarFallback className="text-white font-semibold text-sm">
                    {user ? getInitials(user.name) : 'U'}
                  </AvatarFallback>
                </Avatar>

                <div className="hidden lg:block leading-tight">
                  <p className="text-sm font-medium text-indigo-900">
                    {user?.name || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user ? getRoleLabel(user.role) : ''}
                  </p>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </header>
  );
}
