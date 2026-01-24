import {
  LayoutDashboard,
  FileText,
  Train,
  Calendar,
  Camera,
  Newspaper,
  Users,
  LogOut,
  ChevronLeft,
  Building2,
  CheckCircle,
  Printer,
  ClipboardList,
  Cake,
  History,
  Gift,
  Zap,
  TrendingUp,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";


type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  route: string;
  roles?: string[];  // If specified, only show for these roles
  submenu?: { label: string; route: string; icon?: React.ComponentType<{ className?: string }> }[];
};

const allMenuItems: MenuItem[] = [
  // Dashboard - route based on role
  { icon: LayoutDashboard, label: "Dashboard", route: "/home", roles: ['SUPER_ADMIN'] },
  { icon: LayoutDashboard, label: "Dashboard", route: "/admin/home", roles: ['ADMIN'] },
  { icon: LayoutDashboard, label: "Dashboard", route: "/staff/home", roles: ['STAFF'] },

  // Staff - Data Entry
  { icon: ClipboardList, label: "My Tasks", route: "/staff/tasks", roles: ['STAFF'] },
  { icon: History, label: "My History", route: "/staff/history", roles: ['STAFF'] },
  { 
    icon: FileText, 
    label: "Grievances", 
    route: "/grievances/new", 
    roles: ['STAFF'],
    submenu: [
      { label: "New Grievance", route: "/grievances/new", icon: Plus },
      { label: "Old Grievances", route: "/grievances/view", icon: Search },
    ]
  },
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
  
  { icon: Newspaper, label: "News Feed", route: "/news/view", roles: ['ADMIN'] },
  { icon: Printer, label: "Print Center", route: "/admin/print-center", roles: ['ADMIN'] },
  { icon: History, label: "Action History", route: "/admin/history", roles: ['ADMIN'] },
  { icon: Gift, label: "View Birthdays", route: "/admin/birthdays", roles: ['ADMIN', 'SUPER_ADMIN'] },

  // Super Admin - Overview
  { icon: FileText, label: "All Grievances", route: "/grievances/new", roles: ['SUPER_ADMIN'] },
  { icon: Users, label: "Visitor Log", route: "/visitors/view", roles: ['SUPER_ADMIN'] },
  { icon: Calendar, label: "Tour Program", route: "/tour-program/new", roles: ['SUPER_ADMIN'] },
  { icon: Newspaper, label: "News Feed", route: "/news/view", roles: ['SUPER_ADMIN'] },
  { icon: History, label: "Action History", route: "/admin/history", roles: ['SUPER_ADMIN'] },

  // Common
  { icon: Camera, label: "Photo Booth", route: "/photo-booth" },
];

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Get user role from sessionStorage first (tab-specific), then localStorage
    let role = sessionStorage.getItem('user_role');
    if (!role) {
      role = localStorage.getItem('user_role');
    }
    if (!role) {
      // Try parsing from user object
      const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          role = user.role;
        } catch {
          console.error('Failed to parse user');
        }
      }
    }
    setUserRole(role);
  }, []);

  // Close submenu when route changes
  useEffect(() => {
    setHoveredItem(null);
  }, [location.pathname]);

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => {
    if (!item.roles) return true;  // Show items without role restriction
    if (!userRole) return false;
    return item.roles.includes(userRole);
  });

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
    
    // Navigate to login
    navigate('/auth/login', { replace: true });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen flex flex-col transition-all duration-300 z-50",
        "bg-indigo-900 text-white border-r border-indigo-800",
        "overflow-visible",
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
      <nav className="flex-1 p-3 space-y-1 relative overflow-visible">
        {menuItems.map((item) => {
          const hasSubmenu = item.submenu && item.submenu.length > 0 && !collapsed;
          const isHovered = hoveredItem === item.label;
          
          return (
            <div
              key={item.label}
              className="relative group"
              onMouseEnter={() => hasSubmenu && setHoveredItem(item.label)}
              onMouseLeave={() => {
                // Longer delay to allow mouse to move to submenu
                setTimeout(() => {
                  setHoveredItem((current) => current === item.label ? null : current);
                }, 300);
              }}
            >
              <NavLink
                to={item.route}
                onClick={(e) => {
                  // If has submenu, prevent navigation on parent click
                  if (hasSubmenu) {
                    e.preventDefault();
                    setHoveredItem(isHovered ? null : item.label);
                    return;
                  }
                  // Prevent navigation if user doesn't have access to this route
                  if (item.roles && userRole && !item.roles.includes(userRole)) {
                    e.preventDefault();
                    console.warn(`Access denied: User role ${userRole} cannot access ${item.route}`);
                    const correctDashboard = userRole === 'STAFF' ? '/staff/home' : 
                                           userRole === 'ADMIN' ? '/admin/home' : '/home';
                    navigate(correctDashboard, { replace: true });
                    return;
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 h-11 rounded-xl px-3 transition-colors",
                    "text-indigo-100 hover:text-white hover:bg-indigo-800",
                    (isActive || (hasSubmenu && item.submenu?.some(sub => location.pathname === sub.route))) &&
                      "bg-amber-400 text-black font-semibold hover:bg-amber-400",
                    collapsed && "justify-center px-0"
                  )
                }
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {hasSubmenu && (
                      <ChevronRight className={cn(
                        "h-4 w-4 transition-transform",
                        isHovered && "rotate-90"
                      )} />
                    )}
                  </>
                )}
              </NavLink>
              
              {/* Submenu - positioned right next to parent with no gap */}
              {hasSubmenu && isHovered && (
                <div 
                  className="absolute left-full top-0 pl-1" 
                  style={{ zIndex: 9999 }}
                  onMouseEnter={() => setHoveredItem(item.label)}
                  onMouseLeave={() => {
                    setTimeout(() => {
                      setHoveredItem(null);
                    }, 100);
                  }}
                >
                  {/* Submenu panel */}
                  <div
                    ref={submenuRef}
                    className="w-52 bg-indigo-800 rounded-xl shadow-2xl border border-indigo-700 py-2"
                  >
                    {item.submenu!.map((subItem) => (
                      <NavLink
                        key={subItem.route}
                        to={subItem.route}
                        onClick={(e) => {
                          // Close submenu after click
                          setHoveredItem(null);
                          // Prevent navigation if user doesn't have access to this route
                          if (item.roles && userRole && !item.roles.includes(userRole)) {
                            e.preventDefault();
                            console.warn(`Access denied: User role ${userRole} cannot access ${subItem.route}`);
                            const correctDashboard = userRole === 'STAFF' ? '/staff/home' : 
                                                   userRole === 'ADMIN' ? '/admin/home' : '/home';
                            navigate(correctDashboard, { replace: true });
                            return;
                          }
                        }}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 h-11 px-4 mx-2 rounded-lg transition-colors",
                            "text-indigo-100 hover:text-white hover:bg-indigo-700",
                            isActive && "bg-amber-400 text-black font-semibold hover:bg-amber-400"
                          )
                        }
                      >
                        {subItem.icon && <subItem.icon className="h-4 w-4" />}
                        <span>{subItem.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
