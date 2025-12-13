import { Bell, Search, User, Sun, Cloud } from "lucide-react";
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
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold font-display text-foreground">
              Good Morning, Admin
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{currentDate}</span>
              <span className="flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-warning" />
                28°C
                <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search grievances, visitors..."
              className="w-[300px] pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
            />
          </div>

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive">
              3
            </Badge>
          </Button>

          <div className="flex items-center gap-3 pl-4 border-l">
            <Avatar className="h-9 w-9 bg-gradient-to-br from-primary to-accent">
              <AvatarFallback className="text-white text-sm font-semibold">
                AD
              </AvatarFallback>
            </Avatar>
            <div className="hidden lg:block">
              <p className="text-sm font-medium">Admin User</p>
              <p className="text-xs text-muted-foreground">Manager</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
