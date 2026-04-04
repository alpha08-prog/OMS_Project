import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Search, Sun, Cloud, LogOut, FileText, Users, Train, Calendar } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { grievanceApi, visitorApi, statsApi } from "../../lib/api";
import type { Grievance, Visitor } from "../../lib/api";

type User = {
  name: string;
  email: string;
  role: string;
};

export function DashboardHeader() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{ grievances: Grievance[]; visitors: Visitor[] }>({ grievances: [], visitors: [] });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState<{ grievances: { open: number }; trainRequests: { pending: number }; tourPrograms: { pending: number } } | null>(null);

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

  // Fetch pending counts for notification badge (admin/super admin)
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const data = await statsApi.getSummary();
        const count =
          (data?.grievances?.open ?? 0) +
          (data?.trainRequests?.pending ?? 0) +
          (data?.tourPrograms?.pending ?? 0);
        setPendingCount(count);
        setStats({
          grievances: { open: data?.grievances?.open ?? 0 },
          trainRequests: { pending: data?.trainRequests?.pending ?? 0 },
          tourPrograms: { pending: data?.tourPrograms?.pending ?? 0 },
        });
      } catch {
        setPendingCount(0);
      }
    };
    fetchPending();
  }, []);

  const openGrievanceDetail = async (g: Grievance) => {
    setSearchOpen(false);
    setSelectedVisitor(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const full = await grievanceApi.getById(g.id);
      setSelectedGrievance(full);
    } catch {
      setSelectedGrievance(g);
    } finally {
      setDetailLoading(false);
    }
  };

  const openVisitorDetail = async (v: Visitor) => {
    setSearchOpen(false);
    setSelectedGrievance(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const full = await visitorApi.getById(v.id);
      setSelectedVisitor(full);
    } catch {
      setSelectedVisitor(v);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedGrievance(null);
    setSelectedVisitor(null);
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchOpen(true);
    try {
      const [gRes, vRes] = await Promise.all([
        grievanceApi.getAll({ search: q, limit: "5" }),
        visitorApi.getAll({ search: q, limit: "5" }),
      ]);
      const grievances = Array.isArray(gRes?.data) ? gRes.data : [];
      const visitors = Array.isArray(vRes?.data) ? vRes.data : [];
      setSearchResults({ grievances, visitors });
    } catch {
      setSearchResults({ grievances: [], visitors: [] });
    } finally {
      setSearchLoading(false);
    }
  };

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
    <>
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
            {getGreeting()}, {user?.name || 'User'}
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
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <div className="relative hidden md:block w-[280px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search grievances, visitors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  className="
                    w-full pl-10 pr-4
                    bg-secondary/60
                    border border-border
                    focus-visible:ring-1 focus-visible:ring-primary
                    rounded-xl
                  "
                />
              </div>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] p-0">
              <div className="p-2 border-b">
                <p className="text-xs text-muted-foreground px-2">Press Enter to search</p>
              </div>
              {searchLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Searching...</div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto">
                  {searchResults.grievances.length > 0 && (
                    <div className="p-2">
                      <p className="text-xs font-medium text-muted-foreground px-2 mb-1 flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> Grievances
                      </p>
                      {searchResults.grievances.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => openGrievanceDetail(g)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm"
                        >
                          <span className="font-medium">{g.petitionerName}</span>
                          <span className="text-muted-foreground ml-1">· {g.grievanceType}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.visitors.length > 0 && (
                    <div className="p-2">
                      <p className="text-xs font-medium text-muted-foreground px-2 mb-1 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> Visitors
                      </p>
                      {searchResults.visitors.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => openVisitorDetail(v)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm"
                        >
                          <span className="font-medium">{v.name}</span>
                          <span className="text-muted-foreground ml-1">· {v.purpose}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!searchLoading && searchResults.grievances.length === 0 && searchResults.visitors.length === 0 && searchQuery.trim() && (
                    <div className="p-6 text-center text-sm text-muted-foreground">No results</div>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Notifications (pending actions) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-saffron/10"
              >
                <Bell className="h-5 w-5 text-indigo-700" />
                {pendingCount > 0 && (
                  <Badge
                    className="
                      absolute -top-1 -right-1 min-w-[20px] h-5
                      px-1 flex items-center justify-center
                      bg-amber-500 text-black font-semibold text-xs
                    "
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Pending actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/grievances/verify")}>
                <FileText className="mr-2 h-4 w-4" />
                <span>{stats?.grievances?.open ?? 0} pending grievances</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/train-eq/queue")}>
                <Train className="mr-2 h-4 w-4" />
                <span>{stats?.trainRequests?.pending ?? 0} train EQ requests</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/tour-program/pending")}>
                <Calendar className="mr-2 h-4 w-4" />
                <span>{stats?.tourPrograms?.pending ?? 0} tour invitations</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

    {/* Search result detail – Super Admin style, no redirect */}
    <Dialog open={detailOpen} onOpenChange={(open) => !open && closeDetail()}>
      <DialogContent className="max-w-lg rounded-2xl border-2 border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white">
        <DialogHeader className="pb-4 border-b border-indigo-100">
          <DialogTitle className="text-indigo-900 flex items-center gap-2">
            {selectedGrievance && <FileText className="h-5 w-5 text-indigo-600" />}
            {selectedVisitor && <Users className="h-5 w-5 text-indigo-600" />}
            {selectedGrievance ? "Grievance details" : selectedVisitor ? "Visitor details" : "Search result"}
          </DialogTitle>
        </DialogHeader>
        {detailLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : selectedGrievance ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl bg-white border border-indigo-100 p-4 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-indigo-900 text-lg">{selectedGrievance.petitionerName}</h3>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                  {selectedGrievance.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm text-indigo-700 font-medium mb-2">{selectedGrievance.grievanceType.replace("_", " ")}</p>
              <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <span>Constituency</span>
                <span className="font-medium text-foreground">{selectedGrievance.constituency}</span>
                <span>Mobile</span>
                <span className="font-medium text-foreground">{selectedGrievance.mobileNumber}</span>
                {selectedGrievance.monetaryValue != null && (
                  <>
                    <span>Amount</span>
                    <span className="font-medium text-foreground">
                      ₹{selectedGrievance.monetaryValue.toLocaleString("en-IN")}
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-indigo-50">
                {selectedGrievance.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Submitted {new Date(selectedGrievance.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </div>
          </div>
        ) : selectedVisitor ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl bg-white border border-indigo-100 p-4 shadow-sm">
              <h3 className="font-semibold text-indigo-900 text-lg mb-3">{selectedVisitor.name}</h3>
              <p className="text-sm text-indigo-700 font-medium mb-3">{selectedVisitor.designation}</p>
              <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <span>Purpose</span>
                <span className="font-medium text-foreground">{selectedVisitor.purpose}</span>
                {selectedVisitor.phone && (
                  <>
                    <span>Phone</span>
                    <span className="font-medium text-foreground">{selectedVisitor.phone}</span>
                  </>
                )}
                <span>Visit date</span>
                <span className="font-medium text-foreground">
                  {new Date(selectedVisitor.visitDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </span>
                {selectedVisitor.referencedBy && (
                  <>
                    <span>Referenced by</span>
                    <span className="font-medium text-foreground">{selectedVisitor.referencedBy}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-indigo-50">
                Recorded {new Date(selectedVisitor.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}
