import {
  LayoutDashboard,
  FileText,
  Train,
  Calendar,
  Newspaper,
  Users,
  LogOut,
  ChevronLeft,
  Building2,
  Printer,
  ClipboardList,
  ListChecks,
  History,
  Gift,
  TrendingUp,
  ChevronRight,
  Plus,
  Search,
  Star,
  UserCircle,
  UserPlus,
  UserCheck,
  CalendarClock,
  Briefcase,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { NotificationBell } from "../common/NotificationBell";


type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  route: string;
  roles?: string[];  // If specified, only show for these roles
  submenu?: { label: string; route: string; icon?: React.ComponentType<{ className?: string }> }[];
};

const allMenuItems: MenuItem[] = [
  // Dashboard - route based on role. SUPER_ADMIN's dashboard is a popup
  // launched from the header instead of a sidebar entry, so it's omitted here.
  { icon: LayoutDashboard, label: "Dashboard", route: "/admin/home", roles: ['ADMIN'] },
  { icon: LayoutDashboard, label: "Dashboard", route: "/staff/home", roles: ['STAFF'] },

  // Shared task board — everyone sees ALL tasks (pending work) here, with
  // filters + inline edit. Replaces the verification/assignment workflow.
  { icon: ListChecks, label: "All Tasks", route: "/tasks/all", roles: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },

  // Staff - Data Entry
  { icon: ClipboardList, label: "My Tasks", route: "/staff/tasks", roles: ['STAFF'] },
  { icon: History, label: "My History", route: "/staff/history", roles: ['STAFF'] },
  { icon: UserCheck, label: "My Attendance", route: "/staff/attendance", roles: ['STAFF'] },
  {
    icon: FileText,
    label: "Grievance",
    route: "/grievances",
    roles: ['STAFF', 'ADMIN'],
    submenu: [
      { label: "New Grievance", route: "/grievances/new", icon: Plus },
      { label: "Old Grievance", route: "/grievances/view", icon: Search },
      { label: "Office Grievance", route: "/grievances/office", icon: Plus }
    ]
  },
  // Merged module: one single-page form logs a person's details (incl. an
  // optional DOB that flows into View Birthdays + the dashboard popup).
  // (Old /visitors/new and /birthday/new still resolve.)
  { icon: Users, label: "Add Visitor/Birthday", route: "/people/new", roles: ['STAFF', 'ADMIN'] },
  { icon: Train, label: "Train EQ Request", route: "/train-eq/new", roles: ['STAFF', 'ADMIN'] },
  { icon: Calendar, label: "Add Invitation", route: "/tour-program/new", roles: ['STAFF', 'ADMIN'] },
  { icon: Star, label: "Event Reports", route: "/events/report", roles: ['STAFF', 'ADMIN'] },
  { icon: Newspaper, label: "Add News", route: "/news-intelligence/new", roles: ['STAFF', 'ADMIN'] },

  // Admin - Main Actions
  // Verification removed: grievances + Train EQ go active on creation and
  // surface on the shared "All Tasks" board, so the Action Center and
  // "Verify Grievances" queue are retired (routes/pages kept for rollback).
  { icon: TrendingUp, label: "Task Tracker", route: "/admin/task-tracker", roles: ['ADMIN'] },
  { icon: Briefcase, label: "Office Tasks", route: "/admin/office-tasks", roles: ['ADMIN'] },
  { icon: Train, label: "Train EQ Queue", route: "/train-eq/queue", roles: ['ADMIN'] },
  { icon: ClipboardList, label: "Tour Invitations", route: "/tour-program/pending", roles: ['ADMIN'] },
  { icon: Star, label: "Events", route: "/admin/events", roles: ['ADMIN'] },
  { icon: Calendar, label: "Calendar", route: "/admin/calendar", roles: ['ADMIN'] },
  { icon: CalendarClock, label: "Meetings", route: "/admin/meetings", roles: ['ADMIN'] },
  { icon: Users, label: "View Visitors", route: "/admin/visitors", roles: ["ADMIN"] },
  { icon: UserCheck, label: "Staff Attendance", route: "/admin/attendance", roles: ['ADMIN', 'SUPER_ADMIN'] },
  {
    icon: UserPlus,
    label: "Manage Users",
    route: "/admin/users",
    roles: ['ADMIN', 'SUPER_ADMIN'],
    submenu: [
      { label: "All Users", route: "/admin/users", icon: Users },
      { label: "Create User", route: "/admin/users/create", icon: UserPlus },
    ],
  },


  { icon: Newspaper, label: "News Feed", route: "/news/view", roles: ['ADMIN'] },
  { icon: Printer, label: "Print Center", route: "/admin/print-center", roles: ['ADMIN'] },
  { icon: Printer, label: "Print Center", route: "/staff/print-center", roles: ['STAFF'] },
  { icon: History, label: "Action History", route: "/admin/history", roles: ['ADMIN'] },
  { icon: Activity, label: "Activity Log", route: "/admin/activity", roles: ['ADMIN', 'SUPER_ADMIN'] },
  { icon: Gift, label: "View Birthdays", route: "/admin/birthdays", roles: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },

  // Super Admin — these don't navigate to separate pages. They stay on
  // /home and trigger an in-page popup via the ?popup= search param.
  // Home.tsx watches the param and renders the matching dialog.
  { icon: FileText, label: "Grievances", route: "/home?popup=grievances", roles: ['SUPER_ADMIN'] },
  { icon: Calendar, label: "Tour Program", route: "/home?popup=tour", roles: ['SUPER_ADMIN'] },
  { icon: Newspaper, label: "News", route: "/home?popup=news", roles: ['SUPER_ADMIN'] },
  { icon: Star, label: "Events", route: "/home?popup=events", roles: ['SUPER_ADMIN'] },

  // Common
  { icon: UserCircle, label: "My Profile", route: "/profile", roles: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
  { icon: Users, label: "About Team", route: "/about" },
];

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    // Auto-collapse on mobile screens
    return typeof window !== 'undefined' && window.innerWidth < 768;
  });
  const [userRole] = useState<string | null>(() => {
    // Get user role from sessionStorage first (tab-specific), then localStorage
    let role = sessionStorage.getItem('user_role');
    if (!role) role = localStorage.getItem('user_role');
    if (!role) {
      const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr) as { role?: string };
          role = user.role || null;
        } catch {
          // ignore
        }
      }
    }
    return role;
  });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-collapse on small screens when resizing
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setCollapsed(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close submenu when route changes
  useEffect(() => {
    const t = setTimeout(() => setHoveredItem(null), 0);
    return () => clearTimeout(t);
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
            <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">OMS</h2>
                <p className="text-xs text-indigo-200 truncate">
                  Office Management
                </p>
              </div>
              <div className="bg-white rounded-full">
                <NotificationBell />
              </div>
            </div>
          )}
          {collapsed && (
            <div className="bg-white rounded-full">
              <NotificationBell />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 relative overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-indigo-400/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-indigo-400/50 [scrollbar-width:thin] [scrollbar-color:rgba(129,140,248,0.3)_transparent]">
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
              
              {/* Submenu - inline accordion */}
              {hasSubmenu && isHovered && (
                <div className="pt-1 pb-1 w-full">
                  <div className="flex flex-col gap-1 border-l-2 border-indigo-700/50 pl-2 ml-5">
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
                            "flex items-center gap-3 h-10 px-3 rounded-lg transition-colors text-sm",
                            "text-indigo-200 hover:text-white hover:bg-indigo-800",
                            isActive && "bg-amber-400 text-black font-semibold hover:bg-amber-500 hover:text-black"
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
