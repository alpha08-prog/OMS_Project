import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Search, RefreshCw, ShieldCheck, ShieldAlert, Mail, Phone } from "lucide-react";
import { authApi, type User } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

function roleBadgeClass(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "bg-purple-100 text-purple-800 hover:bg-purple-100";
    case "ADMIN":
      return "bg-indigo-100 text-indigo-800 hover:bg-indigo-100";
    case "STAFF":
      return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-100";
  }
}

function formatDate(value: string | undefined | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type ExtendedUser = User & {
  isActive?: boolean;
  createdAt?: string;
};

export default function UserList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ExtendedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.getUsers();
      setUsers(data as ExtendedUser[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!s) return true;
      const haystack = [u.name, u.email, u.phone ?? ""].join(" ").toLowerCase();
      return haystack.includes(s);
    });
  }, [users, search, roleFilter]);

  // Per-role counts (computed before role filter is applied — these are
  // global counts, not filtered counts).
  const counts = useMemo(() => {
    const total = users.length;
    const staff = users.filter((u) => u.role === "STAFF").length;
    const admin = users.filter((u) => u.role === "ADMIN").length;
    const superAdmin = users.filter((u) => u.role === "SUPER_ADMIN").length;
    const active = users.filter((u) => u.isActive !== false).length;
    return { total, staff, admin, superAdmin, active };
  }, [users]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  All Users
                </h1>
                <p className="text-sm text-muted-foreground">
                  Every account in the system, across staff, admin, and super-admin roles.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchUsers} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  onClick={() => navigate("/admin/users/create")}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create User
                </Button>
              </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="rounded-xl bg-indigo-50 border-indigo-100">
                <CardContent className="p-4">
                  <p className="text-2xl font-bold text-indigo-900">{counts.total}</p>
                  <p className="text-xs text-indigo-700">Total Accounts</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-emerald-50 border-emerald-100">
                <CardContent className="p-4">
                  <p className="text-2xl font-bold text-emerald-900">{counts.staff}</p>
                  <p className="text-xs text-emerald-700">Staff</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-purple-50 border-purple-100">
                <CardContent className="p-4">
                  <p className="text-2xl font-bold text-purple-900">{counts.admin + counts.superAdmin}</p>
                  <p className="text-xs text-purple-700">Admin / Super Admin</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-amber-50 border-amber-100">
                <CardContent className="p-4">
                  <p className="text-2xl font-bold text-amber-900">{counts.active}</p>
                  <p className="text-xs text-amber-700">Active</p>
                </CardContent>
              </Card>
            </div>

            {/* Filter bar */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex items-center flex-wrap gap-3 py-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email, or phone"
                    className="pl-9"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Users table */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-base">
                  {loading
                    ? "Loading users…"
                    : `${filtered.length} of ${users.length} users`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading…</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {users.length === 0
                        ? "No users yet. Click 'Create User' to add the first one."
                        : "No users match the current search/filter."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-3 px-3 font-medium">Name</th>
                          <th className="py-3 px-3 font-medium">Email</th>
                          <th className="py-3 px-3 font-medium">Phone</th>
                          <th className="py-3 px-3 font-medium">Role</th>
                          <th className="py-3 px-3 font-medium">Status</th>
                          <th className="py-3 px-3 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((u) => {
                          const active = u.isActive !== false;
                          return (
                            <tr key={u.id} className="border-b last:border-b-0 hover:bg-indigo-50/30">
                              <td className="py-3 px-3 font-medium text-indigo-900">{u.name}</td>
                              <td className="py-3 px-3">
                                <span className="inline-flex items-center gap-1.5 text-gray-700">
                                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                  {u.email}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                {u.phone ? (
                                  <span className="inline-flex items-center gap-1.5 text-gray-700">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                    {u.phone}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <Badge className={roleBadgeClass(u.role)}>
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  {u.role.replace("_", " ")}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                {active ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-gray-700">
                                    <ShieldAlert className="h-3 w-3 mr-1" />
                                    Inactive
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-3 text-muted-foreground">
                                {formatDate(u.createdAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
