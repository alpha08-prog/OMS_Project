import { useCallback, useEffect, useMemo, useState } from "react";
import {
  historyApi,
  grievanceApi,
  tourProgramApi,
  type HistoryItem,
  type HistoryStats,
  type HistoryItemType,
  type Grievance,
  type TourProgram,
  type CreateGrievanceRequest,
  type GrievanceType,
  type GrievancePriority,
  type GrievanceStatus,
} from "../../lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { DashboardSidebar } from "../../components/layout/DashboardSidebar";
import { SearchBar } from "../../components/common/SearchBar";
import { ExportCsvButton } from "../../components/common/ExportCsvButton";
import type { CsvColumn } from "../../lib/exportCsv";
import {
  History,
  FileCheck,
  Train,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
  RotateCcw,
  Pencil,
} from "lucide-react";

const GRIEVANCE_TYPES: GrievanceType[] = [
  "WATER", "ROAD", "POLICE", "HEALTH", "TRANSFER", "FINANCIAL_AID",
  "ELECTRICITY", "EDUCATION", "HOUSING", "TEMPLE_VISIT", "OTHER",
];
const GRIEVANCE_STATUSES: GrievanceStatus[] = [
  "OPEN", "IN_PROGRESS", "VERIFIED", "RESOLVED", "REJECTED",
];
const GRIEVANCE_PRIORITIES: GrievancePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** ISO string → value a datetime-local input expects (local time, no seconds). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Inline edit (grievance / tour). On open we fetch the FULL record via
  // getById since the history row only carries a partial `details` object.
  const [editItem, setEditItem] = useState<HistoryItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isCreatedBy = (value: unknown): value is { name: string; email: string } => {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.name === 'string' && typeof v.email === 'string';
  };

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Client-side text filter over the loaded page of history rows.
  const filteredHistory = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return history;
    return history.filter((item) =>
      [item.title, item.description].some((field) =>
        (field ?? "").toLowerCase().includes(s)
      )
    );
  }, [history, search]);

  const csvColumns: CsvColumn<HistoryItem>[] = [
    { header: "Type", value: (r) => r.type },
    { header: "Title", value: (r) => r.title },
    { header: "Description", value: (r) => r.description },
    { header: "Action", value: (r) => r.action },
    { header: "Status", value: (r) => r.status },
    { header: "Action By", value: (r) => r.actionBy?.name },
    { header: "Action At", value: (r) => new Date(r.actionAt).toLocaleString() },
  ];

  const actionOptions = useMemo(() => {
    if (typeFilter === "ALL") {
      return [{ value: "ALL", label: "All actions" }];
    }
    if (typeFilter === "GRIEVANCE") {
      return [
        { value: "ALL", label: "All actions" },
        { value: "IN_PROGRESS", label: "In progress" },
        { value: "RESOLVED", label: "Resolved" },
        { value: "REJECTED", label: "Rejected" },
      ];
    }
    if (typeFilter === "TRAIN_REQUEST") {
      return [
        { value: "ALL", label: "All actions" },
        { value: "ACCEPTED", label: "Accepted" },
        { value: "REGRET", label: "Regret" },
        { value: "RESOLVED", label: "Resolved" },
      ];
    }
    if (typeFilter === "TOUR_PROGRAM") {
      return [
        { value: "ALL", label: "All actions" },
        { value: "ACCEPTED", label: "Accepted" },
        { value: "REGRET", label: "Regret" },
      ];
    }
    return [{ value: "ALL", label: "All actions" }];
  }, [typeFilter]);

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 15;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (typeFilter !== "ALL") params.type = typeFilter;
      if (actionFilter !== "ALL") params.action = actionFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      console.log('History - Fetching with params:', params);
      const res = await historyApi.getHistory(params);
      console.log('History - Response:', res);
      console.log('History - Response type:', typeof res);
      console.log('History - Response keys:', res ? Object.keys(res) : 'null');
      // res is ApiResponse<HistoryItem[]>, so it has { success, message, data: HistoryItem[], meta }
      const historyArray = Array.isArray(res?.data) 
        ? res.data 
        : Array.isArray(res) 
          ? res 
          : [];
      console.log('History - History array:', historyArray);
      console.log('History - History array length:', historyArray.length);
      setHistory(historyArray);
      if (res?.meta) {
        setTotalPages(res.meta.totalPages);
      }
    } catch (error: unknown) {
      console.error("Error fetching history:", error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, endDate, page, startDate, typeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      console.log('History - Fetching stats');
      const data = await historyApi.getStats();
      console.log('History - Stats response:', data);
      setStats(data);
    } catch (error: unknown) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchStats();
  }, [fetchHistory, fetchStats]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, actionFilter, startDate, endDate]);

  const handleFilter = () => {
    setPage(1);
    fetchHistory();
  };

  const clearFilters = () => {
    setTypeFilter("ALL");
    setActionFilter("ALL");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setTimeout(fetchHistory, 0);
  };

  const getTypeIcon = (type: HistoryItemType) => {
    switch (type) {
      case "GRIEVANCE":
        return <FileCheck className="h-4 w-4 text-indigo-600" />;
      case "TRAIN_REQUEST":
        return <Train className="h-4 w-4 text-purple-600" />;
      case "TOUR_PROGRAM":
        return <Calendar className="h-4 w-4 text-amber-600" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, string> = {
      "Verified & Resolved": "bg-emerald-100 text-emerald-700 border-emerald-200",
      Resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      "In Progress": "bg-sky-100 text-sky-800 border-sky-200",
      Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      Accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
      Rejected: "bg-red-100 text-red-700 border-red-200",
      Regret: "bg-amber-100 text-amber-700 border-amber-200",
      Verified: "bg-indigo-100 text-indigo-800 border-indigo-200",
    };
    return (
      <Badge className={variants[action] || "bg-gray-100 text-gray-700"} variant="outline">
        {action}
      </Badge>
    );
  };

  // A grievance row from the Action History is reopenable if it's currently
  // in a closed state (resolved or rejected). We rely on the action string —
  // backend serialises these consistently — so we don't need to hit the
  // grievance API just to read the latest status.
  const REOPENABLE_GRIEVANCE_ACTIONS = new Set([
    "Resolved",
    "Verified & Resolved",
    "Rejected",
  ]);
  const isGrievanceReopenable = (item: HistoryItem | null): boolean =>
    Boolean(
      item && item.type === "GRIEVANCE" && REOPENABLE_GRIEVANCE_ACTIONS.has(item.action)
    );

  const handleReopen = async () => {
    if (!selectedItem || !isGrievanceReopenable(selectedItem)) return;
    const confirmed = window.confirm(
      `Reopen this grievance? It will move back to OPEN and reappear in the active queue.`
    );
    if (!confirmed) return;
    setReopenLoading(true);
    setReopenError(null);
    try {
      await grievanceApi.updateStatus(selectedItem.id, "OPEN");
      setSelectedItem(null);
      // Refresh both the list and the top-of-page counters.
      await Promise.all([fetchHistory(), fetchStats()]);
    } catch (err: unknown) {
      setReopenError(
        err instanceof Error ? err.message : "Failed to reopen grievance"
      );
    } finally {
      setReopenLoading(false);
    }
  };

  // Only grievances and tours are editable — train requests are not.
  const isEditable = (item: HistoryItem | null): boolean =>
    Boolean(item && (item.type === "GRIEVANCE" || item.type === "TOUR_PROGRAM"));

  // Open the edit dialog: fetch the FULL record (the history row's `details`
  // is only a partial), pre-fill the form, then show the dialog.
  const openEdit = async (item: HistoryItem) => {
    if (!isEditable(item)) return;
    setSelectedItem(null);
    setEditError(null);
    setEditForm({});
    setEditItem(item);
    setEditLoading(true);
    try {
      if (item.type === "GRIEVANCE") {
        const g: Grievance = await grievanceApi.getById(item.id);
        setEditForm({
          petitionerName: g.petitionerName ?? "",
          mobileNumber: g.mobileNumber ?? "",
          constituency: g.constituency ?? "",
          wardVillage: g.wardVillage ?? "",
          grievanceType: g.grievanceType ?? "",
          description: g.description ?? "",
          monetaryValue: g.monetaryValue != null ? String(g.monetaryValue) : "",
          status: g.status ?? "",
          priority: g.priority ?? "MEDIUM",
        });
      } else if (item.type === "TOUR_PROGRAM") {
        const tp: TourProgram = await tourProgramApi.getById(item.id);
        setEditForm({
          eventName: tp.eventName ?? "",
          organizer: tp.organizer ?? "",
          organizerPhone: tp.organizerPhone ?? "",
          organizerEmail: tp.organizerEmail ?? "",
          dateTime: toLocalInput(tp.dateTime),
          venue: tp.venue ?? "",
          venueLink: tp.venueLink ?? "",
          description: tp.description ?? "",
          referencedBy: tp.referencedBy ?? "",
        });
      }
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to load record for editing."
      );
    } finally {
      setEditLoading(false);
    }
  };

  const editChange = (field: string, value: string) =>
    setEditForm((p) => ({ ...p, [field]: value }));

  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    setEditError(null);
    try {
      if (editItem.type === "GRIEVANCE") {
        const monetary = (editForm.monetaryValue ?? "").trim();
        const parsed = monetary === "" ? undefined : Number(monetary);
        if (parsed !== undefined && !Number.isFinite(parsed)) {
          setEditError("Monetary value must be a valid number.");
          setEditSaving(false);
          return;
        }
        const payload: Partial<CreateGrievanceRequest> & { status?: GrievanceStatus } = {
          petitionerName: editForm.petitionerName,
          mobileNumber: editForm.mobileNumber,
          constituency: editForm.constituency,
          wardVillage: editForm.wardVillage,
          grievanceType: editForm.grievanceType as GrievanceType,
          description: editForm.description,
          priority: editForm.priority as GrievancePriority,
          status: editForm.status as GrievanceStatus,
          monetaryValue: parsed,
        };
        await grievanceApi.update(editItem.id, payload);
      } else if (editItem.type === "TOUR_PROGRAM") {
        await tourProgramApi.update(editItem.id, {
          eventName: editForm.eventName,
          organizer: editForm.organizer,
          organizerPhone: editForm.organizerPhone || undefined,
          organizerEmail: editForm.organizerEmail || undefined,
          dateTime: editForm.dateTime ? new Date(editForm.dateTime).toISOString() : undefined,
          venue: editForm.venue,
          venueLink: editForm.venueLink || undefined,
          description: editForm.description || undefined,
          referencedBy: editForm.referencedBy || undefined,
        });
      }
      setEditItem(null);
      // Refresh the list (and counters) using the page's existing fetchers.
      await Promise.all([fetchHistory(), fetchStats()]);
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg flex-shrink-0">
                <History className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900 leading-tight">
                  Action History
                </h1>
                <p className="text-sm text-muted-foreground">
                  View all administrative actions - approvals, rejections, and verifications
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => { fetchHistory(); fetchStats(); }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          {stats?.grievances && (() => {
            // The big number on each card is the total record count. The
            // breakdown only itemises the action states each module supports.
            // Compute the leftover (records that haven't been actioned yet)
            // so the math always adds up to the total.
            const grievPending = Math.max(
              0,
              stats.grievances.total - stats.grievances.resolved - stats.grievances.rejected
            );
            const trainPending = Math.max(
              0,
              stats.trainRequests.total
                - stats.trainRequests.approved
                - stats.trainRequests.rejected
                - (stats.trainRequests.resolved ?? 0)
            );
            const tourPending = Math.max(
              0,
              stats.tourPrograms.total - stats.tourPrograms.accepted - stats.tourPrograms.regret
            );
            return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="rounded-2xl shadow-sm border-indigo-100">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-indigo-600 text-sm font-medium">Grievances</p>
                      <p className="text-2xl font-bold text-indigo-900">{stats.grievances.total}</p>
                    </div>
                    <div className="flex flex-col items-end text-xs gap-0.5 flex-shrink-0">
                      <span className="text-emerald-600 whitespace-nowrap">✓ {stats.grievances.resolved} resolved</span>
                      <span className="text-red-600 whitespace-nowrap">✗ {stats.grievances.rejected} rejected</span>
                      {grievPending > 0 && (
                        <span className="text-amber-600 whitespace-nowrap">⏳ {grievPending} pending</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm border-purple-100">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-purple-600 text-sm font-medium">Train Requests</p>
                      <p className="text-2xl font-bold text-purple-900">{stats.trainRequests.total}</p>
                    </div>
                    <div className="flex flex-col items-end text-xs gap-0.5 flex-shrink-0">
                      <span className="text-emerald-600 whitespace-nowrap">✓ {stats.trainRequests.approved} accepted</span>
                      <span className="text-red-600 whitespace-nowrap">✗ {stats.trainRequests.rejected} regret</span>
                      {typeof stats.trainRequests.resolved === "number" && (
                        <span className="text-indigo-600 whitespace-nowrap">○ {stats.trainRequests.resolved} resolved</span>
                      )}
                      {trainPending > 0 && (
                        <span className="text-amber-600 whitespace-nowrap">⏳ {trainPending} pending</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm border-amber-100">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-amber-600 text-sm font-medium">Tour Programs</p>
                      <p className="text-2xl font-bold text-amber-900">{stats.tourPrograms.total}</p>
                    </div>
                    <div className="flex flex-col items-end text-xs gap-0.5 flex-shrink-0">
                      <span className="text-emerald-600 whitespace-nowrap">✓ {stats.tourPrograms.accepted} accepted</span>
                      <span className="text-amber-600 whitespace-nowrap">⚠ {stats.tourPrograms.regret} regret</span>
                      {tourPending > 0 && (
                        <span className="text-slate-500 whitespace-nowrap">⏳ {tourPending} pending</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-indigo-600 to-indigo-500 text-white" title="Sum of all admin actions taken so far (resolves, rejects, accepts, regrets) across grievances, train requests, and tour programs. Pending items aren't counted.">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-indigo-100 text-sm font-medium">Total Actions</p>
                      <p className="text-2xl font-bold">{stats.totalActions}</p>
                      <p className="text-[11px] text-indigo-100/80 mt-1">
                        Actions taken (excludes pending)
                      </p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            );
          })()}

          {/* Filters */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-indigo-900 flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground block">Type</label>
                  <Select
                    value={typeFilter}
                    onValueChange={(v) => {
                      setTypeFilter(v);
                      setActionFilter("ALL");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="GRIEVANCE">Grievances</SelectItem>
                      <SelectItem value="TRAIN_REQUEST">Train Requests</SelectItem>
                      <SelectItem value="TOUR_PROGRAM">Tour Programs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground block">Action</label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground block">From Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground block">To Date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10 w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={handleFilter} className="h-10 bg-indigo-600 hover:bg-indigo-700">
                  Apply
                </Button>
                <Button variant="outline" className="h-10" onClick={clearFilters}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search title or description"
                  className="w-full sm:w-64 sm:ml-auto"
                />
                <ExportCsvButton
                  rows={filteredHistory}
                  columns={csvColumns}
                  filename="action-history"
                />
              </div>
            </CardContent>
          </Card>

          {/* History Table */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-indigo-900">Action Log</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No actions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Action By</TableHead>
                        <TableHead>Date/Time</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`} className="hover:bg-indigo-50/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.type)}
                              <span className="text-sm">{item.type.replace(/_/g, " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {item.title}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {item.description}
                          </TableCell>
                          <TableCell>{getActionBadge(item.action)}</TableCell>
                          <TableCell>{item.actionBy?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(item.actionAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedItem(item)}
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {isEditable(item) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEdit(item)}
                                  title="Edit record"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Dialog */}
        <Dialog
          open={!!selectedItem}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedItem(null);
              setReopenError(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedItem && getTypeIcon(selectedItem.type)}
                {selectedItem?.title}
              </DialogTitle>
            </DialogHeader>
            {selectedItem && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {getActionBadge(selectedItem.action)}
                  <span className="text-muted-foreground text-sm">
                    {formatDate(selectedItem.actionAt)}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedItem.details).map(([key, value]) => {
                      if (!value || key === "createdBy") return null;
                      const label = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase());
                      const isLikelyIsoDateString = (val: unknown): val is string =>
                        typeof val === 'string' && /\d{4}-\d{2}-\d{2}T/.test(val);
                      const displayValue =
                        typeof value === "object"
                          ? JSON.stringify(value)
                          : isLikelyIsoDateString(value)
                          ? formatDate(value)
                          : String(value);
                      return (
                        <div key={key}>
                          <p className="text-muted-foreground text-xs uppercase tracking-wider">
                            {label}
                          </p>
                          <p className="font-medium">{displayValue}</p>
                        </div>
                      );
                    })}
                  </div>

                  {isCreatedBy(selectedItem.details.createdBy) && (
                    <div className="pt-3 border-t">
                      <p className="text-muted-foreground text-xs uppercase tracking-wider">
                        Created By
                      </p>
                      <p className="font-medium">
                        {selectedItem.details.createdBy.name} ({selectedItem.details.createdBy.email})
                      </p>
                    </div>
                  )}

                  {selectedItem.actionBy && (
                    <div className="pt-3 border-t">
                      <p className="text-muted-foreground text-xs uppercase tracking-wider">
                        Action Taken By
                      </p>
                      <p className="font-medium">
                        {selectedItem.actionBy.name} ({selectedItem.actionBy.email})
                      </p>
                    </div>
                  )}
                </div>

                {reopenError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
                    {reopenError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  {isEditable(selectedItem) && (
                    <Button variant="outline" onClick={() => openEdit(selectedItem)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                  {isGrievanceReopenable(selectedItem) && (
                    <Button
                      onClick={handleReopen}
                      disabled={reopenLoading}
                      className="bg-amber-500 text-black hover:bg-amber-600"
                    >
                      <RotateCcw className={`h-4 w-4 mr-2 ${reopenLoading ? "animate-spin" : ""}`} />
                      {reopenLoading ? "Reopening..." : "Reopen Grievance"}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedItem(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog — grievance & tour only. Pre-filled from the full record. */}
        <Dialog
          open={!!editItem}
          onOpenChange={(open) => {
            if (!open && !editSaving) {
              setEditItem(null);
              setEditError(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editItem && getTypeIcon(editItem.type)}
                Edit {editItem?.title}
              </DialogTitle>
            </DialogHeader>

            {editLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : editItem ? (
              <div className="space-y-4">
                {editItem.type === "GRIEVANCE" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Petitioner Name</Label>
                      <Input value={editForm.petitionerName ?? ""} onChange={(e) => editChange("petitionerName", e.target.value)} />
                    </div>
                    <div>
                      <Label>Mobile Number</Label>
                      <Input value={editForm.mobileNumber ?? ""} onChange={(e) => editChange("mobileNumber", e.target.value)} maxLength={10} />
                    </div>
                    <div>
                      <Label>Constituency</Label>
                      <Input value={editForm.constituency ?? ""} onChange={(e) => editChange("constituency", e.target.value)} />
                    </div>
                    <div>
                      <Label>Ward / Village</Label>
                      <Input value={editForm.wardVillage ?? ""} onChange={(e) => editChange("wardVillage", e.target.value)} />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Select value={editForm.grievanceType ?? ""} onValueChange={(v) => editChange("grievanceType", v)}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {GRIEVANCE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Monetary Value</Label>
                      <Input type="number" value={editForm.monetaryValue ?? ""} onChange={(e) => editChange("monetaryValue", e.target.value)} />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={editForm.status ?? ""} onValueChange={(v) => editChange("status", v)}>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          {GRIEVANCE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={editForm.priority ?? ""} onValueChange={(v) => editChange("priority", v)}>
                        <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                        <SelectContent>
                          {GRIEVANCE_PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={editForm.description ?? ""} onChange={(e) => editChange("description", e.target.value)} className="min-h-[90px]" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Event Name</Label>
                      <Input value={editForm.eventName ?? ""} onChange={(e) => editChange("eventName", e.target.value)} />
                    </div>
                    <div>
                      <Label>Organizer</Label>
                      <Input value={editForm.organizer ?? ""} onChange={(e) => editChange("organizer", e.target.value)} />
                    </div>
                    <div>
                      <Label>Organizer Phone</Label>
                      <Input value={editForm.organizerPhone ?? ""} onChange={(e) => editChange("organizerPhone", e.target.value)} />
                    </div>
                    <div>
                      <Label>Organizer Email</Label>
                      <Input value={editForm.organizerEmail ?? ""} onChange={(e) => editChange("organizerEmail", e.target.value)} />
                    </div>
                    <div>
                      <Label>Date &amp; Time</Label>
                      <Input type="datetime-local" value={editForm.dateTime ?? ""} onChange={(e) => editChange("dateTime", e.target.value)} />
                    </div>
                    <div>
                      <Label>Venue</Label>
                      <Input value={editForm.venue ?? ""} onChange={(e) => editChange("venue", e.target.value)} />
                    </div>
                    <div>
                      <Label>Venue Link</Label>
                      <Input value={editForm.venueLink ?? ""} onChange={(e) => editChange("venueLink", e.target.value)} />
                    </div>
                    <div>
                      <Label>Referenced By</Label>
                      <Input value={editForm.referencedBy ?? ""} onChange={(e) => editChange("referencedBy", e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={editForm.description ?? ""} onChange={(e) => editChange("description", e.target.value)} className="min-h-[90px]" />
                    </div>
                  </div>
                )}

                {editError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
                    {editError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t pt-4">
                  <Button variant="outline" onClick={() => setEditItem(null)} disabled={editSaving}>
                    Cancel
                  </Button>
                  <Button onClick={saveEdit} disabled={editSaving} className="bg-indigo-600 hover:bg-indigo-700">
                    {editSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
