import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Loader2,
  FileText,
  Pencil,
  History as HistoryIcon,
  RefreshCw,
  User,
  CheckCircle2,
  Eye,
  ExternalLink,
  Clock,
  Filter,
  TrendingUp,
  ClipboardList,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { SearchBar } from "@/components/common/SearchBar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { TruncationNotice } from "@/components/common/TruncationNotice";
import type { CsvColumn } from "@/lib/exportCsv";
import { CardListSkeleton } from "@/components/common/Skeletons";
import { useToast } from "@/components/AuthForm/Toast";
import {
  taskApi,
  grievanceApi,
  type ApiResponse,
  type TaskAssignment,
  type TaskProgressHistory,
  type TaskStatus,
} from "@/lib/api";

// Paging metadata as the list endpoints return it (total is present only when
// the server got a real count).
type ListMeta = ApiResponse<unknown>["meta"];

// Statuses the admin can move an office task through.
const MANAGE_STATUSES: TaskStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
];

const STATUS_STYLES: Record<TaskStatus, string> = {
  UNASSIGNED: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  ASSIGNED: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  ON_HOLD: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  COMPLETED: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
];

function formatDateTime(dt?: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return String(dt);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// A task is overdue when it has a due date in the past and isn't done yet.
const isOverdue = (t: TaskAssignment): boolean => {
  if (!t.dueDate) return false;
  const done = ["RESOLVED", "COMPLETED", "DONE", "CLOSED"].includes(
    String(t.status).toUpperCase()
  );
  return !done && new Date(t.dueDate).getTime() < Date.now();
};

/**
 * Office Tasks — a Task-Tracker-style board scoped to OFFICE grievances only
 * (no public tasks, tours, train requests or general tasks). Mirrors the admin
 * Task Tracker layout: summary stats, filters/search/CSV, an expandable tracker
 * list with activity timelines, a read-only details view, and a manage dialog.
 * Office tasks are admin-managed; staff cannot edit them.
 */
export default function AdminOfficeTasks() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // How many task rows the server actually handed over, plus its count meta.
  // The fetch below is capped, so without these the pager would quietly imply
  // that the capped chunk is every office task there is.
  const [loadedCount, setLoadedCount] = useState(0);
  const [taskMeta, setTaskMeta] = useState<ListMeta>();

  // Filters (all client-side over the fetched office-task set).
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [enteredByFilter, setEnteredByFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Per-card collapse state for the tracker list — collapsed by default so the
  // view isn't a wall of activity timelines.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Read-only details dialog.
  const [viewTask, setViewTask] = useState<TaskAssignment | null>(null);

  // Manage dialog — change status / track progress / add a remark.
  const [manageTask, setManageTask] = useState<TaskAssignment | null>(null);
  const [manageStatus, setManageStatus] = useState<TaskStatus>("ASSIGNED");
  const [manageNote, setManageNote] = useState("");
  const [savingManage, setSavingManage] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [audit, setAudit] = useState<TaskProgressHistory[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Inline quick-status change (no dialog) — logged in the audit timeline.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Ask the backend for office tasks directly (it resolves office-ness from
      // the linked grievance, so it works even if Task.source isn't set). We
      // also pull office grievances so we can still narrow client-side if an
      // older backend ignores the `source` param.
      const [taskResp, grievResp] = await Promise.all([
        taskApi.getAll({ source: "OFFICE", limit: "200" }),
        grievanceApi.getAll({ source: "OFFICE", limit: "200" }),
      ]);
      const officeGrievanceIds = new Set(
        (grievResp.data ?? []).map((g) => String(g.id))
      );
      const rows = taskResp.data ?? [];
      const office = rows.filter(
        (t) =>
          (t.source ?? "PUBLIC") === "OFFICE" ||
          (t.referenceType === "GRIEVANCE" &&
            t.referenceId &&
            officeGrievanceIds.has(String(t.referenceId)))
      );
      setTasks(office);
      // Truncation is judged on the task response — it is what fills the
      // tracker; the grievance fetch is only a lookup for the narrow above.
      // Record what the SERVER sent, not what survived the narrow, so the
      // notice reports the cap and not our own filtering.
      setLoadedCount(rows.length);
      setTaskMeta(taskResp.meta);
    } catch (e) {
      console.error("Failed to load office tasks", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // One-click status change from the card (Assigned → In Progress / On Hold /
  // Completed) without opening the Manage dialog.
  const quickStatus = async (t: TaskAssignment, status: TaskStatus) => {
    if (status === t.status) return;
    setBusyId(t.id);
    try {
      await taskApi.editShared(t.id, { status });
      await load();
    } catch (e) {
      push({
        type: "error",
        title: "Update failed",
        message: e instanceof Error ? e.message : "Failed to update status",
      });
    } finally {
      setBusyId(null);
    }
  };

  // Jump to the linked grievance's full details (View Grievances opens ?id=).
  const openLinkedRecord = (t: TaskAssignment) => {
    if (t.referenceType === "GRIEVANCE" && t.referenceId) {
      navigate(`/grievances/view?id=${encodeURIComponent(t.referenceId)}`);
    }
  };

  const openManage = async (t: TaskAssignment) => {
    setManageTask(t);
    setManageStatus(MANAGE_STATUSES.includes(t.status) ? t.status : "ASSIGNED");
    setManageNote("");
    setManageError(null);
    setAudit([]);
    setAuditLoading(true);
    try {
      setAudit(await taskApi.getAudit(t.id));
    } catch (e) {
      console.error("Failed to load audit timeline", e);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleSaveManage = async () => {
    if (!manageTask) return;
    const note = manageNote.trim();
    const statusChanged = manageStatus !== manageTask.status;
    if (!statusChanged && !note) {
      setManageError("Change the status or add a remark.");
      return;
    }
    setSavingManage(true);
    setManageError(null);
    try {
      await taskApi.editShared(manageTask.id, {
        status: statusChanged ? manageStatus : undefined,
        progressNotes: note || undefined,
      });
      const [, freshAudit] = await Promise.all([
        load(),
        taskApi.getAudit(manageTask.id),
      ]);
      setAudit(freshAudit);
      setManageNote("");
      setManageTask((prev) => (prev ? { ...prev, status: manageStatus } : prev));
    } catch (e) {
      setManageError(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setSavingManage(false);
    }
  };

  // Display name of whoever entered an office task (its creator/owner).
  const enteredByName = (t: TaskAssignment) =>
    t.assignedTo?.name ?? t.assignedBy?.name ?? "—";

  // Summary counts over the full office-task set (not just the current filter).
  const summary = {
    total: tasks.length,
    assigned: tasks.filter((t) => t.status === "ASSIGNED").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
    onHold: tasks.filter((t) => t.status === "ON_HOLD").length,
  };

  // Distinct "entered by" names for the people filter.
  const enteredByOptions = Array.from(
    new Set(tasks.map(enteredByName).filter((n) => n && n !== "—"))
  ).sort();

  const q = search.trim().toLowerCase();
  const visible = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (enteredByFilter !== "all" && enteredByName(t) !== enteredByFilter)
      return false;
    if (startDate && (!t.createdAt || t.createdAt.slice(0, 10) < startDate))
      return false;
    if (endDate && (!t.createdAt || t.createdAt.slice(0, 10) > endDate))
      return false;
    if (q) {
      const hay = `${t.referenceNo ?? ""} ${t.title} ${t.description ?? ""} ${enteredByName(t)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Client-side pagination — 10 cards per page, matching the Task Tracker.
  const pager = usePagination(visible, 10);

  const csvColumns: CsvColumn<TaskAssignment>[] = [
    { header: "Reference No", value: (t) => t.referenceNo ?? "" },
    { header: "Title", value: (t) => t.title },
    { header: "Status", value: (t) => t.status },
    { header: "Entered By", value: (t) => enteredByName(t) },
    { header: "Latest Remark", value: (t) => t.progressNotes ?? "" },
    { header: "Created", value: (t) => (t.createdAt ? new Date(t.createdAt).toLocaleString() : "") },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
                  <Briefcase className="h-6 w-6" /> Office Tasks
                </h1>
                <p className="text-sm text-muted-foreground">
                  Every office grievance, owned by whoever entered it. Admins
                  track progress, change status, and add remarks here — staff
                  cannot edit these.
                </p>
              </div>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Summary Stats */}
            {(() => {
              const otherCount = Math.max(
                0,
                summary.total -
                  summary.assigned -
                  summary.inProgress -
                  summary.completed -
                  summary.onHold
              );
              const showOther = otherCount > 0;
              return (
                <div className={`grid grid-cols-2 ${showOther ? "md:grid-cols-6" : "md:grid-cols-5"} gap-4`}>
                  <Card className="rounded-xl bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-indigo-900">{summary.total}</p>
                      <p className="text-sm text-indigo-700">Total</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-blue-50 border-blue-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-900">{summary.assigned}</p>
                      <p className="text-sm text-blue-700">Assigned</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-amber-50 border-amber-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-amber-900">{summary.inProgress}</p>
                      <p className="text-sm text-amber-700">In Progress</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-green-50 border-green-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-green-900">{summary.completed}</p>
                      <p className="text-sm text-green-700">Completed</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-gray-50 border-gray-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-gray-900">{summary.onHold}</p>
                      <p className="text-sm text-gray-700">On Hold</p>
                    </CardContent>
                  </Card>
                  {showOther && (
                    <Card className="rounded-xl bg-rose-50 border-rose-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-3xl font-bold text-rose-900">{otherCount}</p>
                        <p className="text-sm text-rose-700">Other</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="px-5 py-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Filter:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_FILTERS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={enteredByFilter} onValueChange={setEnteredByFilter}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Entered by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone</SelectItem>
                        {enteredByOptions.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(statusFilter !== "all" || enteredByFilter !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 flex-shrink-0"
                      onClick={() => {
                        setStatusFilter("all");
                        setEnteredByFilter("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search ref no, title, person…"
                    className="flex-1 min-w-0"
                  />
                  <ExportCsvButton
                    rows={visible}
                    columns={csvColumns}
                    filename="office-tasks"
                    className="flex-shrink-0"
                  />
                </div>

                <div className="mt-4 pt-4 border-t">
                  <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tracker list */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Office Task Tracker ({visible.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Seen before the rows: the server capped this fetch, so the
                    pager's "Page 1 of N" is about what arrived, not about how
                    many office tasks exist. */}
                <TruncationNotice
                  loaded={loadedCount}
                  total={taskMeta?.total}
                  totalKnown={taskMeta?.totalKnown}
                  hint="Narrow the status, person or date range to reach older office tasks."
                />
                {loading ? (
                  <CardListSkeleton rows={5} />
                ) : visible.length === 0 ? (
                  <div className="text-center py-8">
                    <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No office tasks found</p>
                  </div>
                ) : (
                  pager.pageItems.map((t) => {
                    const isExpanded = expandedIds.has(t.id);
                    return (
                      <div
                        key={t.id}
                        className={`p-4 rounded-xl border bg-white hover:shadow-md transition ${isOverdue(t) ? "border-l-4 border-l-red-500" : ""}`}
                      >
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0 flex-1 flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(t.id)}
                              aria-label={isExpanded ? "Collapse task" : "Expand task"}
                              className="mt-0.5 p-0.5 rounded hover:bg-indigo-50 text-indigo-700 shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <p className="font-semibold text-indigo-900 break-words">{t.title}</p>
                                <Badge className={STATUS_STYLES[t.status]}>
                                  {t.status.replace("_", " ")}
                                </Badge>
                                {t.referenceNo && (
                                  <span className="font-mono text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                    {t.referenceNo}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                Entered by:{" "}
                                <span className="font-medium text-foreground">
                                  {enteredByName(t)}
                                </span>
                                {" • "}
                                {formatDateTime(t.createdAt)}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 flex-shrink-0">
                            <select
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                              value={MANAGE_STATUSES.includes(t.status) ? t.status : "ASSIGNED"}
                              disabled={busyId === t.id}
                              onChange={(e) => quickStatus(t, e.target.value as TaskStatus)}
                              title="Change status"
                            >
                              {MANAGE_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                            {t.status !== "COMPLETED" && (
                              <Button
                                size="sm"
                                disabled={busyId === t.id}
                                onClick={() => quickStatus(t, "COMPLETED")}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                {busyId === t.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                )}
                                Complete
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setViewTask(t)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openManage(t)}>
                              <Pencil className="h-4 w-4 mr-1" /> Manage
                            </Button>
                          </div>
                        </div>

                        {/* Description + latest remark */}
                        {t.description && (
                          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4 mt-0.5 shrink-0" /> {t.description}
                          </p>
                        )}
                        {t.progressNotes && (
                          <div className="mt-3 rounded-lg bg-indigo-50/60 border border-indigo-100 p-3 text-sm">
                            <p className="text-xs font-semibold text-indigo-800 mb-1">
                              Latest remark
                            </p>
                            <p className="whitespace-pre-wrap text-foreground/90">
                              {t.progressNotes}
                            </p>
                          </div>
                        )}

                        {/* Activity timeline — collapsed by default */}
                        {isExpanded && (
                          <div className="mt-4 pt-3 border-t">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                              <Clock className="h-3 w-3" />
                              Recent Activity
                            </p>
                            {t.progressHistory && t.progressHistory.length > 0 ? (
                              <div className="space-y-3 pl-1">
                                {t.progressHistory.map((history) => (
                                  <div
                                    key={history.id}
                                    className="relative pl-4 border-l border-indigo-100"
                                  >
                                    <div className="absolute -left-[2.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-sm text-gray-700">{history.note}</span>
                                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <span>{formatDateTime(history.createdAt)}</span>
                                        <span>•</span>
                                        <span>{history.createdBy?.name ?? "—"}</span>
                                        {history.status && (
                                          <>
                                            <span>•</span>
                                            <span className="font-medium text-indigo-600">
                                              {history.status.replace("_", " ")}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic pl-1">
                                No activity yet
                              </p>
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
          </div>
        </div>
      </main>

      {/* Read-only details dialog */}
      <Dialog open={Boolean(viewTask)} onOpenChange={(open) => { if (!open) setViewTask(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" /> Office Task Details
            </DialogTitle>
            <DialogDescription>{viewTask?.title}</DialogDescription>
            {viewTask?.referenceNo && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Reference No</span>
                <span className="font-mono text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">
                  {viewTask.referenceNo}
                </span>
              </div>
            )}
          </DialogHeader>

          {viewTask && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_STYLES[viewTask.status]}>
                  {viewTask.status.replace("_", " ")}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Entered by</p>
                  <p className="font-medium">{enteredByName(viewTask)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDateTime(viewTask.createdAt)}</p>
                </div>
              </div>

              {viewTask.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-3">
                    {viewTask.description}
                  </p>
                </div>
              )}

              {viewTask.progressNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Latest remark</p>
                  <p className="whitespace-pre-wrap text-sm">{viewTask.progressNotes}</p>
                </div>
              )}

              {viewTask.referenceType === "GRIEVANCE" && viewTask.referenceId && (
                <Button
                  variant="outline"
                  className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  onClick={() => openLinkedRecord(viewTask)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open grievance
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTask(null)}>
              Close
            </Button>
            {viewTask && (
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  const t = viewTask;
                  setViewTask(null);
                  openManage(t);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" /> Manage
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage dialog — status / progress / remark + audit timeline */}
      <Dialog
        open={Boolean(manageTask)}
        onOpenChange={(open) => {
          if (!open) setManageTask(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" /> Manage Office Task
            </DialogTitle>
            <DialogDescription>{manageTask?.title}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="ot-status">Status</Label>
              <select
                id="ot-status"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={manageStatus}
                onChange={(e) => setManageStatus(e.target.value as TaskStatus)}
              >
                {MANAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ot-remark">Remark</Label>
              <Textarea
                id="ot-remark"
                value={manageNote}
                onChange={(e) => setManageNote(e.target.value)}
                rows={3}
                placeholder="Add a progress note / remark (recorded in the audit trail)"
              />
            </div>

            {manageError && <p className="text-sm text-rose-600">{manageError}</p>}

            {/* Audit timeline */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <HistoryIcon className="h-3.5 w-3.5" /> Audit timeline
              </p>
              {auditLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No updates recorded yet.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {audit.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{h.createdBy?.name ?? "—"}</span>
                        {h.status && (
                          <Badge className={`${STATUS_STYLES[h.status]} text-xs px-2 py-0`}>
                            {h.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      {h.note && (
                        <p className="whitespace-pre-wrap text-foreground/90 mt-1">{h.note}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(h.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageTask(null)} disabled={savingManage}>
              Close
            </Button>
            <Button
              onClick={handleSaveManage}
              disabled={savingManage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingManage ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
