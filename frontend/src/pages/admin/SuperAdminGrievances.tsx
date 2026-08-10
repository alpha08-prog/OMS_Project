import { useEffect, useState } from "react";
import {
  FileText,
  RefreshCw,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { TruncationNotice } from "@/components/common/TruncationNotice";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { SearchBar } from "@/components/common/SearchBar";
import type { CsvColumn } from "@/lib/exportCsv";
import { grievanceApi, type Grievance, type GrievanceStatus, type GrievancePriority } from "@/lib/api";
import { CONSTITUENCY_OPTIONS } from "@/lib/constituencies";
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
  // Rows the server actually sent, kept apart from `grievances` because that
  // list is already thinned client-side. Compared against meta.total to tell
  // the user when the 50-row window is hiding data.
  const [loaded, setLoaded] = useState(0);
  const [meta, setMeta] = useState<{ total?: number; totalKnown?: boolean }>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Grievance | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Client-side constituency filter over the already-fetched window.
  const [constituency, setConstituency] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Per-card collapse state (matches Task Tracker pattern). Cards start
  // collapsed — header info only — and expand on chevron click.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchGrievances = async () => {
    setLoading(true);
    setError(null);
    try {
      // Match the admin-page latency pattern: limit=50 + push status/date
      // filters to the server so the backend hits indexed columns rather
      // than scanning the full table client-side. Backend already sorts by
      // CREATEDTIME DESC, so latest-first is free.
      const params: Record<string, string> = { limit: '50' };
      if (filterStatus !== 'all') {
        if (filterStatus === 'verified') params.isVerified = 'true';
        else if (filterStatus === 'pending') params.isVerified = 'false';
        else params.status = filterStatus;
      }
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await grievanceApi.getAll(params);
      let arr: Grievance[] = [];
      if (res) {
        if (Array.isArray(res)) arr = res as unknown as Grievance[];
        else if (Array.isArray(res.data)) arr = res.data;
      }
      // Count what the server sent, BEFORE the RESOLVED filter below —
      // dropping resolved rows is our choice, not missing data, and measuring
      // after it would fire the notice on a window that arrived complete.
      setLoaded(arr.length);
      setMeta({ total: res?.meta?.total, totalKnown: res?.meta?.totalKnown });
      // RESOLVED filter stays client-side because the backend has no "status
      // != RESOLVED" param. The 50-row window is mostly active anyway.
      setGrievances(arr.filter((g) => g.status !== 'RESOLVED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grievances');
      setGrievances([]);
      setLoaded(0);
      setMeta({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Refetch on filter/date change so the server-side params take effect.
    fetchGrievances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, startDate, endDate]);

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

  // Colored left border cues priority at a glance on each card.
  const priorityBorder = (priority?: GrievancePriority) => {
    if (priority === 'CRITICAL') return 'border-l-4 border-l-red-500';
    if (priority === 'HIGH') return 'border-l-4 border-l-amber-500';
    return '';
  };

  // Status / date filters happen server-side in fetchGrievances; only the
  // free-text search box runs locally on the already-filtered window.
  const filtered = grievances.filter((g) => {
    if (constituency && g.constituency !== constituency) return false;
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

  // CSV export of the currently filtered/searched grievances (all rows, not
  // just the visible page).
  const CSV_COLUMNS: CsvColumn<Grievance>[] = [
    { header: "Petitioner", value: (g) => g.petitionerName },
    { header: "Mobile", value: (g) => g.mobileNumber },
    { header: "Type", value: (g) => g.grievanceType },
    { header: "Constituency", value: (g) => g.constituency },
    { header: "Status", value: (g) => g.status },
    { header: "Priority", value: (g) => g.priority ?? "" },
    { header: "Created", value: (g) => new Date(g.createdAt).toLocaleString() },
  ];

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
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by name, phone, constituency…"
                  className="w-64"
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
                <Select
                  value={constituency || "all"}
                  onValueChange={(v) => setConstituency(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Constituency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All constituencies</SelectItem>
                    {CONSTITUENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                <ExportCsvButton
                  rows={filtered}
                  columns={CSV_COLUMNS}
                  filename="grievances"
                />
                {(filterStatus !== 'all' || searchQuery || startDate || endDate || constituency) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus('all');
                      setSearchQuery('');
                      setStartDate('');
                      setEndDate('');
                      setConstituency('');
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
                {/* The fetch is capped at 50 rows; without this the pager reads
                    as "that's all there is". Hidden while loading so a stale
                    count from the previous filter isn't shown as current. */}
                {!loading && (
                  <TruncationNotice
                    loaded={loaded}
                    total={meta.total}
                    totalKnown={meta.totalKnown}
                    hint="Narrow the status filter or date range to reach older grievances."
                  />
                )}
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading grievances...</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No active grievances</p>
                  </div>
                ) : (
                  pager.pageItems.map((g) => {
                    const isExpanded = expandedIds.has(g.id);
                    return (
                    <div
                      key={g.id}
                      className={`p-4 rounded-xl border bg-white hover:shadow-md transition ${priorityBorder(g.priority)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(g.id)}
                            aria-label={isExpanded ? 'Collapse grievance' : 'Expand grievance'}
                            className="mt-0.5 p-0.5 rounded hover:bg-indigo-50 text-indigo-700 shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <div className="p-2 bg-indigo-100 rounded-lg flex-shrink-0">
                            {getStatusIcon(g.status, g.isVerified)}
                          </div>
                          <div className="min-w-0">
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
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t pl-9 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            📞 {g.mobileNumber} • Created: {formatDate(g.createdAt)}
                          </p>
                          {g.description && (
                            <p className="text-sm mt-2">{g.description}</p>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })
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
