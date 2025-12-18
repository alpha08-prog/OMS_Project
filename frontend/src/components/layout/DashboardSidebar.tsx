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
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", route: "/home" },

  // Core citizen services
  { icon: FileText, label: "Grievances", route: "/grievances/new" },
  { icon: Users, label: "Visitors", route: "/visitors/new" },

  // Office operations
  { icon: Train, label: "Train EQ", route: "/train-eq/new" },
  { icon: Calendar, label: "Tour Program", route: "/tour-program" },
  { icon: Camera, label: "Photo Booth", route: "/photo-booth" },

  // Information & admin
  { icon: Newspaper, label: "News & Intel", route: "/news" },
  { icon: Settings, label: "Settings", route: "/settings" },
];

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

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
              <h2 className="text-lg font-bold">OMS</h2>
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
          <NavLink
            key={item.label}
            to={item.route}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 h-11 rounded-xl px-3 transition-colors",
                "text-indigo-100 hover:text-white hover:bg-indigo-800",
                isActive &&
                  "bg-amber-400 text-black font-semibold hover:bg-amber-400",
                collapsed && "justify-center px-0"
              )
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-indigo-800">
        <button
          onClick={() => navigate("/auth/login")}
          className={cn(
            "w-full h-11 flex items-center gap-3 rounded-xl px-3",
            "text-indigo-300 hover:text-red-400",
            "hover:bg-red-500/15 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="
          absolute -right-3 top-20
          h-7 w-7 rounded-full
          bg-indigo-800 text-white
          border border-indigo-700
          shadow-md
          hover:bg-indigo-700
          flex items-center justify-center
        "
      >
        <ChevronLeft
          className={cn(
            "h-4 w-4 transition-transform",
            collapsed && "rotate-180"
          )}
        />
      </button>
    </aside>
  );
}
