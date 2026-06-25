import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  Users,
  CheckCircle2,
  Clock,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Filter,
  ArrowLeft,
  ArrowRight,
  Eye,
  Trash2,
  TrendingUp,
  User,
  ChevronDown,
  ChevronRight,
  Pencil,
  Forward,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { ForwardDialog } from "@/components/ForwardDialog";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { SearchBar } from "@/components/common/SearchBar";
import type { CsvColumn } from "@/lib/exportCsv";
import { taskApi, type TaskAssignment, type TaskProgressHistory, type TaskStatus, type TaskTrackingData, type TaskType } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminTaskTracker() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<TaskTrackingData | null>(null);
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskAssignment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Edit / Remark dialog: lets an admin change status and/or add a remark on
  // any task. Each save is recorded in the audit timeline via taskApi.editShared.
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskAssignment | null>(null);
  const [editStatus, setEditStatus] = useState<TaskStatus>("ASSIGNED");
  const [editRemark, setEditRemark] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [auditEntries, setAuditEntries] = useState<TaskProgressHistory[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Forward-to-user dialog.
  const [forwardTask_, setForwardTask] = useState<TaskAssignment | null>(null);
  const [forwarding, setForwarding] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterTaskType, setFilterTaskType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // One-time reconcile: re-aligns grievance ↔ task statuses that drifted before
  // bidirectional sync existed. Idempotent, so leaving the button visible is
  // harmless — re-running just reports 0 updates.
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  // Per-card collapse state for the task list, mirroring StaffTasks.tsx —
  // tasks default to collapsed (header + badges only) so the admin view
  // isn't a wall of activity timelines.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Staff Workload: cap rendered cards to keep the section compact when many
  // staff have open tasks. The backend already filters to staff with at least
  // one pending task; this caps the worst case (all 11 staff active).
  const STAFF_WORKLOAD_DEFAULT_LIMIT = 8;
  const [showAllStaff, setShowAllStaff] = useState(false);

  // Reset status filter when task type changes
  useEffect(() => {
    setFilterStatus("all");
  }, [filterTaskType]);

  // Track which fetches are the *initial* one. Background polls (every 20s)
  // must not toggle `loading` — doing so unmounts the list, the empty-state
  // placeholder shows for one tick, then the list re-mounts. The user sees
  // that as a flicker once per minute. Only the very first fetch flips the
  // loading flag; subsequent polls swap data silently.
  const initialFetchDone = useRef(false);

  const fetchData = async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setLoading(true);
    try {
      // Fetch the full task set (server caps at 1000) and filter/paginate
      // client-side. A small window (e.g. 50) under-counts: COMPLETED tasks
      // sink to the bottom of the sort, so "Completed" filters were truncated
      // and never matched the Grievance page's totals.
      const params: Record<string, string> = { limit: '1000', page: '1' };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const [tracking, tasksRes] = await Promise.all([
        taskApi.getTracking(),
        taskApi.getAll(params),
      ]);

      // getTracking() returns TaskTrackingData (res.data.data)
      setTrackingData(tracking ?? null);

      // getAll() returns res.data which is ApiResponse<TaskAssignment[]>
      // So it has { success, message, data: TaskAssignment[], meta }
      let tasksArray: TaskAssignment[] = [];
      if (tasksRes) {
        if (Array.isArray(tasksRes.data)) tasksArray = tasksRes.data;
      }
      setTasks(tasksArray);
    } catch (error: unknown) {
      console.error('Failed to fetch data:', error);
      // On a background-poll failure, keep the existing data on screen
      // — flashing it to "empty" would be more disruptive than stale data.
      if (!background) {
        setTrackingData(null);
        setTasks([]);
      }
    } finally {
      if (!background) {
        setLoading(false);
        initialFetchDone.current = true;
      }
    }
  };

  useEffect(() => {
    // First fetch shows the loading state; subsequent polls are silent.
    fetchData({ background: initialFetchDone.current });
    // Poll every 20s so admin sees staff progress updates without manual
    // refresh. Pause while the task-details or edit dialog is open -- a
    // background refetch during interaction is a known source of click-handler
    // perf violations (re-render right when the user clicks).
    if (detailsOpen || editOpen || forwardTask_) return;
    const id = setInterval(() => fetchData({ background: true }), 20_000);
    return () => clearInterval(id);
  }, [detailsOpen, editOpen, forwardTask_, startDate, endDate]);

  const searchTerm = searchQuery.trim().toLowerCase();
  const filteredTasks = tasks.filter(task => {
    if (filterTaskType !== "all" && task.taskType !== filterTaskType) return false;
    if (filterStatus !== "all" && task.status !== filterStatus) return false;
    if (filterStaff !== "all" && task.assignedTo?.id !== filterStaff) return false;
    if (searchTerm) {
      const haystack = `${task.referenceNo ?? ""} ${task.title ?? ""} ${task.assignedTo?.name ?? ""}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  // CSV columns for the admin task tracker. Exports the currently
  // filtered/searched rows (all of them, not just the current page).
  const csvColumns: CsvColumn<TaskAssignment>[] = [
    { header: "Reference No", value: (t) => t.referenceNo ?? "" },
    { header: "Title", value: (t) => t.title },
    { header: "Type", value: (t) => t.taskType },
    { header: "Status", value: (t) => t.status },
    { header: "Priority", value: (t) => t.priority },
    { header: "Assigned To", value: (t) => t.assignedTo?.name },
    { header: "Assigned By", value: (t) => t.assignedBy?.name },
    { header: "Due", value: (t) => t.dueDate },
    { header: "Created", value: (t) => new Date(t.createdAt).toLocaleString() },
  ];

  // Client-side pagination — 10 rows per page on the admin task tracker.
  const pager = usePagination(filteredTasks, 10);

  const getStatusOptions = (taskType: string) => {
    switch (taskType) {
      case 'GRIEVANCE':
        // Grievance lifecycle == its linked task: Pending → In Progress →
        // Completed. These mirror the Grievance pages 1:1 (OPEN/IN_PROGRESS/
        // RESOLVED) so the same filter gives the same counts on both screens.
        return [
          { value: 'all', label: 'All Status' },
          { value: 'ASSIGNED', label: 'Pending' },
          { value: 'IN_PROGRESS', label: 'In Progress' },
          { value: 'COMPLETED', label: 'Completed' },
        ];
      case 'TRAIN_REQUEST':
        // Pending on register → In Progress (incl. when forwarded) → Completed
        // when the EQ letter is printed/generated.
        return [
          { value: 'all', label: 'All Status' },
          { value: 'ASSIGNED', label: 'Pending' },
          { value: 'IN_PROGRESS', label: 'In Progress' },
          { value: 'COMPLETED', label: 'Completed' },
        ];
      case 'TOUR_PROGRAM':
        // Tours are Pending → Accepted / Rejected only (no "completed" step).
        return [
          { value: 'all', label: 'All Status' },
          { value: 'ASSIGNED', label: 'Pending' },
          { value: 'IN_PROGRESS', label: 'Accepted' },
          { value: 'ON_HOLD', label: 'Rejected' },
        ];
      default:
        return [
          { value: 'all', label: 'All Status' },
          { value: 'ASSIGNED', label: 'Assigned' },
          { value: 'IN_PROGRESS', label: 'In Progress' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'ON_HOLD', label: 'On Hold' },
        ];
    }
  };

  const taskTypeLabel = (t: TaskType) => {
    switch (t) {
      case "GRIEVANCE":
        return "Grievance";
      case "TRAIN_REQUEST":
        return "Train";
      case "TOUR_PROGRAM":
        return "Tour";
      default:
        return "General";
    }
  };

  const handleViewDetails = (task: TaskAssignment) => {
    setSelectedTask(task);
    setDetailsOpen(true);
  };

  // Run the one-time grievance↔task status reconcile, then refresh so the new
  // counts show immediately.
  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileMsg(null);
    try {
      const result = await taskApi.reconcileGrievances();
      await fetchData();
      setReconcileMsg(
        `Synced grievances — ${result?.tasksCreated ?? 0} missing task(s) created, ` +
          `${result?.grievancesUpdated ?? 0} grievance and ${result?.tasksUpdated ?? 0} task status(es) updated.`
      );
    } catch (error) {
      console.error("Failed to reconcile grievance/task statuses:", error);
      setReconcileMsg("Failed to sync statuses. Please try again.");
    } finally {
      setReconciling(false);
    }
  };

  // Open the Edit / Remark dialog for a task: seed the form with the task's
  // current status, clear any previous remark/error, then load its full audit
  // timeline so the admin can see prior activity before adding their own.
  const handleOpenEdit = async (task: TaskAssignment) => {
    setEditTask(task);
    setEditStatus(task.status);
    setEditRemark("");
    setEditError(null);
    setEditOpen(true);
    setAuditEntries([]);
    setAuditLoading(true);
    try {
      const entries = await taskApi.getAudit(task.id);
      setAuditEntries(Array.isArray(entries) ? entries : []);
    } catch (error) {
      console.error("Failed to load task audit timeline:", error);
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTask) return;
    const statusChanged = editStatus !== editTask.status;
    const remark = editRemark.trim();
    // Require something to record: either a status change or a non-empty remark.
    if (!statusChanged && !remark) {
      setEditError("Add a remark or change the status before saving.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await taskApi.editShared(editTask.id, {
        status: statusChanged ? editStatus : undefined,
        progressNotes: remark || undefined,
      });
      await fetchData();
      setEditOpen(false);
    } catch (error) {
      console.error("Failed to save task edit:", error);
      setEditError("Failed to save changes. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  // Deep-link: notifications ship the admin to /admin/task-tracker?id=<row>.
  // When the matching task lands in the list, open its details dialog and
  // drop the param so closing the dialog doesn't keep reopening it.
  const targetTaskId = searchParams.get("id");
  useEffect(() => {
    if (!targetTaskId || tasks.length === 0) return;
    const match = tasks.find((t) => t.id === targetTaskId);
    if (match) {
      setSelectedTask(match);
      setDetailsOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }, [targetTaskId, tasks, searchParams, setSearchParams]);

  const handleMarkResolved = async (task: TaskAssignment) => {
    if (!confirm('Mark this task as completed/resolved?')) return;

    try {
      await taskApi.updateStatus(task.id, 'COMPLETED');
      fetchData();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  // Forward the chosen task to the selected user (with optional remark).
  const handleForward = async (recipientId: string, forwardRemark: string) => {
    if (!forwardTask_) return;
    setForwarding(true);
    try {
      await taskApi.forward(forwardTask_.id, recipientId, forwardRemark || undefined);
      setForwardTask(null);
      await fetchData();
    } catch (error: unknown) {
      alert(
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Failed to forward task. Please try again.'
      );
    } finally {
      setForwarding(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await taskApi.delete(id);
      fetchData();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  // Card badge label/colour, contextual to the task type so it matches the
  // filter wording (e.g. a tour IN_PROGRESS reads "Accepted", a grievance
  // ASSIGNED reads "Pending").
  const getStatusBadge = (status: TaskStatus, taskType: TaskType) => {
    if (taskType === 'TOUR_PROGRAM') {
      switch (status) {
        case 'ASSIGNED':
          return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
        case 'IN_PROGRESS':
          return <Badge className="bg-green-100 text-green-800">Accepted</Badge>;
        case 'ON_HOLD':
          return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
        case 'COMPLETED':
          return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      }
    }
    if (taskType === 'GRIEVANCE' || taskType === 'TRAIN_REQUEST') {
      switch (status) {
        case 'ASSIGNED':
          return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
        case 'IN_PROGRESS':
          return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
        case 'COMPLETED':
          return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
        case 'ON_HOLD':
          return <Badge className="bg-gray-100 text-gray-800">On Hold</Badge>;
      }
    }
    switch (status) {
      case 'ASSIGNED':
        return <Badge className="bg-blue-100 text-blue-800">Assigned</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'ON_HOLD':
        return <Badge className="bg-gray-100 text-gray-800">On Hold</Badge>;
    }
  };

  // Status icon helper - currently used inline
  const _getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'ASSIGNED':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'IN_PROGRESS':
        return <PlayCircle className="h-4 w-4 text-amber-600" />;
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'ON_HOLD':
        return <PauseCircle className="h-4 w-4 text-gray-600" />;
    }
  };
  void _getStatusIcon; // Suppress unused warning

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get unique staff members from tasks. Defensive: assignedTo may be null
  // when the task's assignee can no longer be resolved against AppUser
  // (e.g., user was deleted or has a stale id from before migration).
  const uniqueStaff = Array.from(
    new Map(
      tasks
        .filter((t) => t.assignedTo && t.assignedTo.id)
        .map((t) => [t.assignedTo.id, t.assignedTo])
    ).values()
  );

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate('/admin/action-center')}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-indigo-900">
                    Task Tracker
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Monitor task progress across all staff members
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => fetchData()} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReconcile}
                  disabled={reconciling}
                  title="Re-align grievance and task statuses so the Task Tracker and Grievance pages show the same counts. Safe to run more than once."
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${reconciling ? 'animate-spin' : ''}`} />
                  {reconciling ? 'Syncing…' : 'Sync grievance statuses'}
                </Button>
                <Button variant="outline" onClick={() => navigate('/admin/history')}>
                  View Full History
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>

            {reconcileMsg && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                {reconcileMsg}
              </div>
            )}

            {/* Summary Stats */}
            {trackingData?.summary && (() => {
              const s = trackingData.summary;
              // Backend computes total = all rows but only buckets four known
              // statuses, so legacy rows with null/unrecognised status fall
              // out of the breakdown. Show the gap as an "Other" card so the
              // top numbers actually add up to total.
              const otherCount = Math.max(
                0,
                s.total - s.assigned - s.inProgress - s.completed - s.onHold
              );
              const showOther = otherCount > 0;
              return (
                <div className={`grid grid-cols-2 ${showOther ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-4`}>
                  <Card className="rounded-xl bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-indigo-900">{s.total}</p>
                      <p className="text-sm text-indigo-700">Total Tasks</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-blue-50 border-blue-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-900">{s.assigned}</p>
                      <p className="text-sm text-blue-700">Assigned</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-amber-50 border-amber-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-amber-900">{s.inProgress}</p>
                      <p className="text-sm text-amber-700">In Progress</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-green-50 border-green-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-green-900">{s.completed}</p>
                      <p className="text-sm text-green-700">Completed</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl bg-gray-50 border-gray-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-gray-900">{s.onHold}</p>
                      <p className="text-sm text-gray-700">On Hold</p>
                    </CardContent>
                  </Card>
                  {showOther && (
                    <Card className="rounded-xl bg-rose-50 border-rose-200" title="Tasks whose status is null or outside the four known buckets — usually legacy rows.">
                      <CardContent className="p-4 text-center">
                        <p className="text-3xl font-bold text-rose-900">{otherCount}</p>
                        <p className="text-sm text-rose-700">Other</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}

            {/* Staff Workload */}
            {trackingData?.staffTaskCounts && trackingData.staffTaskCounts.length > 0 && (() => {
              // Sort heaviest workload first; cap to N to keep this section
              // compact even if all 11 staff have open tasks. Backend already
              // excludes staff with zero pending — so what we render here is
              // always "people with open work".
              const sorted = [...trackingData.staffTaskCounts].sort(
                (a, b) => b.pendingTasks - a.pendingTasks
              );
              const visible = showAllStaff ? sorted : sorted.slice(0, STAFF_WORKLOAD_DEFAULT_LIMIT);
              const hidden = sorted.length - visible.length;
              return (
                <Card className="rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-indigo-600" />
                      Staff Workload
                      <span className="text-sm font-normal text-muted-foreground">
                        ({sorted.length})
                      </span>
                    </CardTitle>
                    {sorted.length > STAFF_WORKLOAD_DEFAULT_LIMIT && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllStaff((v) => !v)}
                      >
                        {showAllStaff ? 'Show top 8' : `Show all (${sorted.length})`}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {visible.map((item) => (
                        <div
                          key={item.staff?.id}
                          className="p-4 rounded-xl bg-gray-50 hover:bg-indigo-50 cursor-pointer transition"
                          onClick={() => setFilterStaff(item.staff?.id || 'all')}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-full">
                              <User className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{item.staff?.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.pendingTasks} pending {item.pendingTasks === 1 ? 'task' : 'tasks'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {hidden > 0 && (
                      <p className="text-xs text-muted-foreground mt-3">
                        +{hidden} more — click "Show all" to expand.
                      </p>
                    )}
                  </CardContent>
                </Card>
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 min-w-0">
                    <Select value={filterTaskType} onValueChange={setFilterTaskType}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Task type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="GRIEVANCE">Grievance</SelectItem>
                        <SelectItem value="TRAIN_REQUEST">Train</SelectItem>
                        <SelectItem value="TOUR_PROGRAM">Tour</SelectItem>
                        <SelectItem value="GENERAL">General</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {getStatusOptions(filterTaskType).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterStaff} onValueChange={setFilterStaff}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Staff Member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Staff</SelectItem>
                        {uniqueStaff.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(filterStatus !== "all" || filterStaff !== "all" || filterTaskType !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 flex-shrink-0"
                      onClick={() => { setFilterStatus("all"); setFilterStaff("all"); setFilterTaskType("all"); }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by title or staff…"
                    className="flex-1 min-w-0"
                  />
                  <ExportCsvButton
                    rows={filteredTasks}
                    columns={csvColumns}
                    filename="task-tracker"
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

            {/* Tasks List - Tracker View */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Task Progress Tracker ({filteredTasks.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading tasks...</p>
                ) : filteredTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No tasks found</p>
                  </div>
                ) : (
                  pager.pageItems.map((task) => {
                    const isExpanded = expandedIds.has(task.id);
                    return (
                    <div
                      key={task.id}
                      className="p-4 rounded-xl border bg-white hover:shadow-md transition"
                    >
                      {/* Task Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1 flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(task.id)}
                            aria-label={isExpanded ? 'Collapse task' : 'Expand task'}
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
                              <p className="font-semibold text-indigo-900 break-words">{task.title}</p>
                              {getStatusBadge(task.status, task.taskType)}
                              <Badge variant="outline">{taskTypeLabel(task.taskType)}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {task.referenceNo && (
                                <span className="font-mono text-indigo-700">{task.referenceNo} • </span>
                              )}
                              Assigned to: <span className="font-medium">{task.assignedTo?.name ?? '—'}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-indigo-600"
                            onClick={() => handleOpenEdit(task)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(task)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {task.status !== 'COMPLETED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-violet-700 border-violet-300 hover:bg-violet-50"
                              onClick={() => setForwardTask(task)}
                              title="Forward to another user"
                            >
                              <Forward className="h-4 w-4 mr-1" />
                              {task.isForwarded ? 'Re-forward' : 'Forward'}
                            </Button>
                          )}
                          {task.status !== 'COMPLETED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => handleMarkResolved(task)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Resolve
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Recent Activity Timeline — collapsed by default */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                            <Clock className="h-3 w-3" />
                            Recent Activity
                          </p>

                          {task.progressHistory && task.progressHistory.length > 0 ? (
                            <div className="space-y-3 pl-1">
                              {task.progressHistory.map((history) => (
                                <div key={history.id} className="relative pl-4 border-l border-indigo-100">
                                  <div className="absolute -left-[2.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-sm text-gray-700">{history.note}</span>
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span>{formatDateTime(history.createdAt)}</span>
                                      <span>•</span>
                                      <span>{history.createdBy?.name ?? '—'}</span>
                                      {history.status && (
                                        <>
                                          <span>•</span>
                                          <span className="font-medium text-indigo-600">
                                            {history.status.replace('_', ' ')}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic pl-1">No activity yet</p>
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

        {/* Task Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Task Details</DialogTitle>
            </DialogHeader>
            
            {selectedTask && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedTask.status, selectedTask.taskType)}
                  <Badge variant="outline">{taskTypeLabel(selectedTask.taskType)}</Badge>
                  <Badge variant={selectedTask.priority === 'URGENT' ? 'destructive' : 'secondary'}>
                    {selectedTask.priority}
                  </Badge>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
                  {selectedTask.description && (
                    <p className="text-muted-foreground mt-1">{selectedTask.description}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned To</p>
                    <p className="font-medium">{selectedTask.assignedTo?.name ?? '—'}</p>
                    <p className="text-sm text-muted-foreground">{selectedTask.assignedTo?.email ?? ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned By</p>
                    <p className="font-medium">{selectedTask.assignedBy?.name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned At</p>
                    <p className="font-medium">{formatDate(selectedTask.assignedAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{selectedTask.dueDate ? formatDate(selectedTask.dueDate) : 'Not set'}</p>
                  </div>
                  {selectedTask.startedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Started At</p>
                      <p className="font-medium">{formatDate(selectedTask.startedAt)}</p>
                    </div>
                  )}
                  {selectedTask.completedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Completed At</p>
                      <p className="font-medium">{formatDate(selectedTask.completedAt)}</p>
                    </div>
                  )}
                </div>
                

                
                {selectedTask.progressNotes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Progress Notes</p>
                    <p className="p-3 bg-gray-50 rounded-lg mt-1">{selectedTask.progressNotes}</p>
                  </div>
                )}
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                  {selectedTask.status !== 'COMPLETED' && (
                    <Button 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        handleMarkResolved(selectedTask);
                        setDetailsOpen(false);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Resolved
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit / Remark Dialog */}
        <Dialog open={editOpen} onOpenChange={(open) => { if (!editSaving) setEditOpen(open); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit / Add Remark</DialogTitle>
            </DialogHeader>

            {editTask && (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-indigo-900 break-words">{editTask.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Assigned to: <span className="font-medium">{editTask.assignedTo?.name ?? '—'}</span>
                  </p>
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <label htmlFor="edit-task-status" className="text-sm font-medium">
                    Status
                  </label>
                  <select
                    id="edit-task-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                    disabled={editSaving}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {/* Contextual to the task type (e.g. a tour offers
                        Pending/Accepted/Rejected), reusing the filter labels. */}
                    {getStatusOptions(editTask.taskType)
                      .filter((opt) => opt.value !== "all")
                      .map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Remark */}
                <div className="space-y-1.5">
                  <label htmlFor="edit-task-remark" className="text-sm font-medium">
                    Remark <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    id="edit-task-remark"
                    value={editRemark}
                    onChange={(e) => setEditRemark(e.target.value)}
                    disabled={editSaving}
                    placeholder="Add a remark visible in the activity timeline…"
                  />
                </div>

                {editError && (
                  <p className="text-sm text-red-600" role="alert">{editError}</p>
                )}

                {/* Activity timeline */}
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                    <Clock className="h-3 w-3" />
                    Activity timeline
                  </p>
                  {auditLoading ? (
                    <p className="text-xs text-muted-foreground italic pl-1">Loading activity…</p>
                  ) : auditEntries.length > 0 ? (
                    <div className="space-y-3 pl-1 max-h-60 overflow-y-auto">
                      {auditEntries.map((entry) => (
                        <div key={entry.id} className="relative pl-4 border-l border-indigo-100">
                          <div className="absolute -left-[2.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                              <span>{formatDateTime(entry.createdAt)}</span>
                              <span>•</span>
                              <span>{entry.createdBy?.name ?? 'Unknown'}</span>
                              {entry.status && (
                                <>
                                  <span>•</span>
                                  <span className="font-medium text-indigo-600">
                                    {entry.status.replace('_', ' ')}
                                  </span>
                                </>
                              )}
                            </div>
                            <span className="text-sm text-gray-700">{entry.note}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic pl-1">No activity yet</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={editSaving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={editSaving}>
                    {editSaving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Forward-to-user dialog */}
        <ForwardDialog
          open={!!forwardTask_}
          onOpenChange={(open) => { if (!open) setForwardTask(null); }}
          itemLabel="task"
          subtitle={forwardTask_ ? `Forward "${forwardTask_.title}" to one person.` : undefined}
          submitting={forwarding}
          onSubmit={handleForward}
        />
      </main>
    </div>
  );
}