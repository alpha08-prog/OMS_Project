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
  Building2,
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
        "sticky top-0 h-screen flex flex-col transition-all duration-300",
        "bg-indigo-900 text-white border-r border-indigo-800",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-indigo-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-black" />
          </div>

          {!collapsed && (
            <div>
              <h2 className="text-lg font-bold text-white">OMS</h2>
              <p className="text-xs text-indigo-200">
                Office Management
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            className={cn(
              "w-full h-11 flex items-center gap-3 rounded-xl",
              "text-indigo-100 hover:text-white",
              "hover:bg-indigo-800 transition-colors",
              item.active &&
                "bg-amber-400 text-black hover:bg-amber-400",
              collapsed && "justify-center px-0"
            )}
          >
            <item.icon className="h-5 w-5" />
            {!collapsed && <span>{item.label}</span>}
          </Button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-indigo-800">
        <Button
          variant="ghost"
          className={cn(
            "w-full h-11 flex items-center gap-3 rounded-xl",
            "text-indigo-300 hover:text-red-400",
            "hover:bg-red-500/15 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Logout</span>}
        </Button>
      </div>

      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(!collapsed)}
        className="
          absolute -right-3 top-20
          h-7 w-7 rounded-full
          bg-indigo-800 text-white
          border border-indigo-700
          shadow-md
          hover:bg-indigo-700
        "
      >
        <ChevronLeft
          className={cn(
            "h-4 w-4 transition-transform",
            collapsed && "rotate-180"
          )}
        />
      </Button>
    </aside>
  );
}
