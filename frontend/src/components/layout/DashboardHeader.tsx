import { Bell, Search, Sun, Cloud } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";

export function DashboardHeader() {
  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
            Good Morning, Admin
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

          {/* User */}
          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <Avatar className="h-9 w-9 bg-gradient-to-br from-primary-600 to-primary-500">
              <AvatarFallback className="text-white font-semibold text-sm">
                AD
              </AvatarFallback>
            </Avatar>

            <div className="hidden lg:block leading-tight">
              <p className="text-sm font-medium text-indigo-900">
                Admin User
              </p>
              <p className="text-xs text-muted-foreground">
                Office Manager
              </p>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
