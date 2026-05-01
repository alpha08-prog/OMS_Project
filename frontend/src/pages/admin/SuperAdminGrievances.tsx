import { useEffect, useState } from "react";
import {
  FileText,
  RefreshCw,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { grievanceApi, type Grievance, type GrievanceStatus } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Super Admin — Grievances overview.
 *
 * Read-only. No verify/assign, no PDF download. Resolved grievances
 * are filtered out — those live in Action History. Admin's own
 * GrievanceView page is untouched; this is a separate page so
 * shared admin/staff code paths don't acquire role flags.
 */
/**
 * Inner content (no DashboardSidebar / page-chrome wrapper). Reused by
 * the standalone /super-admin/grievances page AND by the dashboard popup
 * on the SUPER_ADMIN home screen.
 */
export function SuperAdminGrievancesContent() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Grievance | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const fetchGrievances = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await grievanceApi.getAll({ limit: '200' });
      let arr: Grievance[] = [];
      if (res) {
        if (Array.isArray(res)) arr = res as unknown as Grievance[];
        else if (Array.isArray(res.data)) arr = res.data;
      }
      // Strip RESOLVED entries — Super Admin's overview is for active cases.
      setGrievances(arr.filter((g) => g.status !== 'RESOLVED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grievances');
      setGrievances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrievances();
  }, []);

  const formatCurrency = (value?: number) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: GrievanceStatus, isVerified: boolean) => {
    if (status === 'REJECTED') return <Badge variant="destructive">Rejected</Badge>;
    if (isVerified) return <Badge className="bg-blue-100 text-blue-800">Verified</Badge>;
    if (status === 'IN_PROGRESS') return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  const getStatusIcon = (status: GrievanceStatus, isVerified: boolean) => {
    if (status === 'REJECTED') return <XCircle className="h-4 w-4 text-red-600" />;
    if (isVerified) return <CheckCircle className="h-4 w-4 text-blue-600" />;
    if (status === 'IN_PROGRESS') return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <Clock className="h-4 w-4 text-gray-600" />;
  };

  const filtered = grievances.filter((g) => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'verified' && !g.isVerified) return false;
      if (filterStatus === 'pending' && g.isVerified) return false;
      if (filterStatus !== 'verified' && filterStatus !== 'pending' && g.status !== filterStatus) return false;
    }
    if (startDate || endDate) {
      const c = new Date(g.createdAt).getTime();
      if (startDate) {
        const f = new Date(startDate).getTime();
        if (Number.isFinite(f) && c < f) return false;
      }
      if (endDate) {
        const t = new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (Number.isFinite(t) && c > t) return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        g.petitionerName.toLowerCase().includes(q) ||
        g.mobileNumber.includes(q) ||
        g.constituency.toLowerCase().includes(q) ||
        g.grievanceType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pager = usePagination(filtered, 10);

  return (
    <div className="space-y-6">

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">Grievances</h1>
                <p className="text-sm text-muted-foreground">Active grievances across the system (read-only)</p>
              </div>
              <Button variant="outline" onClick={fetchGrievances} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <Input
                  placeholder="Search by name, phone, constituency..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                {(filterStatus !== 'all' || searchQuery || startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus('all');
                      setSearchQuery('');
                      setStartDate('');
                      setEndDate('');
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Grievances ({filtered.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading grievances...</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No active grievances</p>
                  </div>
                ) : (
                  pager.pageItems.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-4 rounded-xl border bg-white hover:shadow-md transition"
                    >
                      <div className="flex gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          {getStatusIcon(g.status, g.isVerified)}
                        </div>
                        <div>
                          <div className="font-medium flex flex-wrap items-center gap-2">
                            <span>{g.petitionerName}</span>
                            {getStatusBadge(g.status, g.isVerified)}
                            {g.source === 'OFFICE' && (
                              <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white">Office</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {g.grievanceType} • {g.constituency} • {formatCurrency(g.monetaryValue)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            📞 {g.mobileNumber} • Created: {formatDate(g.createdAt)}
                          </p>
                          {g.description && (
                            <p className="text-sm mt-2 line-clamp-2">{g.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(g);
                          setDetailsOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  ))
                )}
                <Pagination
                  page={pager.page}
                  totalPages={pager.totalPages}
                  total={pager.total}
                  rangeStart={pager.rangeStart}
                  rangeEnd={pager.rangeEnd}
                  onChange={pager.setPage}
                />
              </CardContent>
            </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Grievance Details
              </DialogTitle>
              <DialogDescription>Full details of the grievance</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(selected.status, selected.isVerified)}
                  {selected.source === 'OFFICE' && (
                    <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white">Office</Badge>
                  )}
                  {selected.isVerified && (
                    <span className="text-sm text-green-600">
                      ✓ Verified by {selected.verifiedBy?.name || 'Admin'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Petitioner Name" value={selected.petitionerName} />
                  <Field label="Mobile Number" value={selected.mobileNumber} />
                  <Field label="Constituency" value={selected.constituency} />
                  <Field label="Grievance Type" value={selected.grievanceType} />
                  <Field label="Monetary Value" value={formatCurrency(selected.monetaryValue)} />
                  <Field label="Created" value={formatDate(selected.createdAt)} />
                </div>
                {selected.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 rounded bg-slate-50 text-sm whitespace-pre-wrap">
                      {selected.description}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
    </div>
  );
}

/** Standalone page (route /super-admin/grievances). Wraps the content
 *  with the dashboard sidebar + page chrome. */
export default function SuperAdminGrievances() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <SuperAdminGrievancesContent />
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}
