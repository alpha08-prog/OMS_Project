import { 
  LayoutDashboard, 
  FileText, 
  Train, 
  Calendar, 
  Camera, 
  Newspaper, 
  Users, 
  Settings,
  LogOut,
  ChevronLeft,
  Building2
} from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: FileText, label: "Grievances" },
  { icon: Train, label: "Train EQ" },
  { icon: Calendar, label: "Tour Program" },
  { icon: Camera, label: "Photo Booth" },
  { icon: Newspaper, label: "News & Intel" },
  { icon: Users, label: "Visitors" },
  { icon: Settings, label: "Settings" },
];

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex flex-col",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="font-bold text-lg text-sidebar-foreground leading-tight">OMS</h2>
              <p className="text-xs text-sidebar-foreground/60">Office Management</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 h-11 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              item.active && "bg-sidebar-accent text-sidebar-foreground font-medium",
              collapsed && "justify-center px-0"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 h-11 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </Button>
      </div>

      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-card shadow-md hover:bg-muted"
      >
        <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
      </Button>
    </aside>
  );
}
