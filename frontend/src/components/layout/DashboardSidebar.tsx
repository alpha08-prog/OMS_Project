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
  CheckCircle,
  Printer,
  ClipboardList,
  Cake,
  History,
  Zap,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  route: string;
  roles?: string[];  // If specified, only show for these roles
};

const allMenuItems: MenuItem[] = [
  // Dashboard - route based on role
  { icon: LayoutDashboard, label: "Dashboard", route: "/home", roles: ['SUPER_ADMIN'] },
  { icon: LayoutDashboard, label: "Dashboard", route: "/admin/home", roles: ['ADMIN'] },
  { icon: LayoutDashboard, label: "Dashboard", route: "/staff/home", roles: ['STAFF'] },

  // Staff - Data Entry
  { icon: ClipboardList, label: "My Tasks", route: "/staff/tasks", roles: ['STAFF'] },
  { icon: FileText, label: "New Grievance", route: "/grievances/new", roles: ['STAFF'] },
  { icon: Users, label: "Log Visitor", route: "/visitors/new", roles: ['STAFF'] },
  { icon: Cake, label: "Add Birthday", route: "/birthday/new", roles: ['STAFF'] },
  { icon: Train, label: "Train EQ Request", route: "/train-eq/new", roles: ['STAFF'] },
  { icon: Calendar, label: "Add Invitation", route: "/tour-program/new", roles: ['STAFF'] },
  { icon: Newspaper, label: "Add News", route: "/news-intelligence/new", roles: ['STAFF'] },

  // Admin - Main Actions
  { icon: Zap, label: "Action Center", route: "/admin/action-center", roles: ['ADMIN'] },
  { icon: TrendingUp, label: "Task Tracker", route: "/admin/task-tracker", roles: ['ADMIN'] },
  { icon: CheckCircle, label: "Verify Grievances", route: "/grievances/verify", roles: ['ADMIN'] },
  { icon: Train, label: "Train EQ Queue", route: "/train-eq/queue", roles: ['ADMIN'] },
  { icon: ClipboardList, label: "Tour Invitations", route: "/tour-program/pending", roles: ['ADMIN'] },
  { icon: Users, label: "Visitor Log", route: "/visitors/view", roles: ['ADMIN'] },
  { icon: Newspaper, label: "News Feed", route: "/news/view", roles: ['ADMIN'] },
  { icon: Printer, label: "Print Center", route: "/admin/print-center", roles: ['ADMIN'] },
  { icon: History, label: "Action History", route: "/admin/history", roles: ['ADMIN'] },

  // Super Admin - Overview
  { icon: FileText, label: "All Grievances", route: "/grievances/new", roles: ['SUPER_ADMIN'] },
  { icon: Users, label: "Visitor Log", route: "/visitors/view", roles: ['SUPER_ADMIN'] },
  { icon: Calendar, label: "Tour Program", route: "/tour-program/new", roles: ['SUPER_ADMIN'] },
  { icon: Newspaper, label: "News Feed", route: "/news/view", roles: ['SUPER_ADMIN'] },
  { icon: History, label: "Action History", route: "/admin/history", roles: ['SUPER_ADMIN'] },

  // Common
  { icon: Camera, label: "Photo Booth", route: "/photo-booth" },
  { icon: Settings, label: "Settings", route: "/settings" },
];

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Get user role from localStorage (try direct key first, then from user object)
    let role = localStorage.getItem('user_role');
    if (!role) {
      // Fallback: try to get from user object
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          role = user.role;
          // Also set it directly for future use
          if (role) localStorage.setItem('user_role', role);
        } catch (e) {
          console.error('Failed to parse user from localStorage');
        }
      }
    }
    setUserRole(role);
    console.log('User role:', role); // Debug log
  }, []);

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => {
    if (!item.roles) return true;  // Show items without role restriction
    if (!userRole) return false;
    return item.roles.includes(userRole);
  });

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('remember_token');
    localStorage.removeItem('user');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
    sessionStorage.removeItem('auth_session');
    
    // Navigate to login with replace to clear history
    // This prevents back button from accessing protected pages
    navigate('/auth/login', { replace: true });
  };

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
          onClick={handleLogout}
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
