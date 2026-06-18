import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Calendar,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { SearchBar } from "@/components/common/SearchBar";
import type { CsvColumn } from "@/lib/exportCsv";
import { taskApi, type TaskAssignment, type TaskStatus, type TaskProgressHistory } from "@/lib/api";
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

export default function StaffTasks() {
  const _navigate = useNavigate();
  void _navigate; // Available for future navigation needs
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskAssignment | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  // Per-card collapse state. Tasks default to collapsed (just title + badges
  // + dates) so the list isn't visually overwhelming. Click to expand.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Update form state
  const [progressNotes, setProgressNotes] = useState("");
  const [taskHistory, setTaskHistory] = useState<TaskProgressHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  // First fetch toggles the loading skeleton; the 20s polls don't, so the
  // task list doesn't flash to "Loading…" once a minute.
  const initialFetchDone = useRef(false);

  const fetchTasks = useCallback(async (opts: { background?: boolean } = {}) => {
    if (!opts.background) setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "all") {
        params.status = filterStatus;
      }
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await taskApi.getMyTasks(params);
      setTasks(res.data);
    } catch (err) {
      // Background polling errors stay quiet — keep last-known data on screen.
      if (!opts.background) {
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      }
    } finally {
      if (!opts.background) {
        setLoading(false);
        initialFetchDone.current = true;
      }
    }
  }, [filterStatus, startDate, endDate]);

  useEffect(() => {
    fetchTasks({ background: initialFetchDone.current });
    // Poll every 20 s so a staff member sees admin reassignments / status
    // changes from a co-assignee without needing to click Refresh.
    // Pause while the Update Progress dialog is open -- the user is
    // focused on a single task there, and a background re-render of the
    // underlying list adds latency to their click handlers (one source
    // of the [Violation] 'click' handler took N ms console warnings).
    if (updateDialogOpen) return;
    const id = setInterval(() => fetchTasks({ background: true }), 20_000);
    return () => clearInterval(id);
  }, [fetchTasks, updateDialogOpen]);

  const handleOpenUpdate = async (task: TaskAssignment) => {
    setSelectedTask(task);
    setProgressNotes("");
    setUpdateDialogOpen(true);
    
    // Fetch progress history
    setHistoryLoading(true);
    try {
      const history = await taskApi.getTaskHistory(task.id);
      setTaskHistory(history);
    } catch (err) {
      console.error("Failed to fetch task history:", err);
      setTaskHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Deep-link: notifications point staff to /staff/tasks?id=<row>. Auto-open
  // the Update Progress dialog for that task once it's present in the list.
  // Param is stripped after consuming so it doesn't re-open on every render.
  const targetTaskId = searchParams.get("id");
  useEffect(() => {
    if (!targetTaskId || tasks.length === 0 || updateDialogOpen) return;
    const match = tasks.find((t) => t.id === targetTaskId);
    if (!match) return;
    void handleOpenUpdate(match);
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    setSearchParams(next, { replace: true });
    // handleOpenUpdate is intentionally excluded from deps — including it
    // would loop because it's redefined every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTaskId, tasks]);

  const handleUpdateProgress = async (newStatus?: TaskStatus) => {
    if (!selectedTask) return;

    setUpdating(true);
    try {
      const data: { status?: TaskStatus; progressNotes?: string } = {};
      if (progressNotes.trim()) {
        data.progressNotes = progressNotes;
      }
      if (newStatus) {
        data.status = newStatus;
      }

      await taskApi.updateProgress(selectedTask.id, data);
      setUpdateDialogOpen(false);
      setProgressNotes("");
      fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setUpdating(false);
    }
  };

  // Start Task is a one-shot status flip with no dialog, so it doesn't go
  // through the selectedTask + handleUpdateProgress pipeline (that pipeline
  // reads selectedTask via closure, which would be stale on the first
  // click because React batches setState -- the user would have to click
  // 2-3 times before it took effect). Hit the API directly with task.id.
  const handleStartTask = async (task: TaskAssignment) => {
    setUpdating(true);
    try {
      await taskApi.updateProgress(task.id, { status: 'IN_PROGRESS' });
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task');
    } finally {
      setUpdating(false);
    }
  };

  // Resolve Task flips an IN_PROGRESS (or ON_HOLD) task straight to COMPLETED
  // without opening the Update Progress dialog. Confirms first so a stray
  // click doesn't accidentally close out a task. Backend stamps completedAt
  // and notifies the admin who assigned the task.
  const handleResolveTask = async (task: TaskAssignment) => {
    const ok = window.confirm(
      `Mark "${task.title}" as resolved? The admin will be notified.`
    );
    if (!ok) return;
    setUpdating(true);
    try {
      await taskApi.updateProgress(task.id, {
        status: 'COMPLETED',
        progressNotes: 'Task resolved by staff',
      });
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve task');
    } finally {
      setUpdating(false);
    }
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

  const getStatusBadge = (status: TaskStatus) => {
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

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'HIGH':
        return <Badge className="bg-orange-100 text-orange-800">High</Badge>;
      case 'NORMAL':
        return <Badge variant="outline">Normal</Badge>;
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const pendingCount = tasks.filter(t => t.status === 'ASSIGNED').length;
  const inProgressCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;

  // Sort tasks for display: active (non-completed) first, completed pushed to
  // the bottom. Within each group, newest assignment first so a fresh task
  // shows up at the top of the list. The client-side title search is applied
  // here too, so pagination and CSV export both operate on the visible set.
  const sortedTasks = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const matched = term
      ? tasks.filter((t) => (t.title ?? "").toLowerCase().includes(term))
      : tasks;
    return [...matched].sort((a, b) => {
      const aDone = a.status === 'COMPLETED' ? 1 : 0;
      const bDone = b.status === 'COMPLETED' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aAt = new Date(a.assignedAt).getTime();
      const bAt = new Date(b.assignedAt).getTime();
      return bAt - aAt;
    });
  }, [tasks, searchQuery]);

  // CSV columns for My Tasks. Exports the currently searched/visible rows
  // (all of them, not just the current page).
  const csvColumns: CsvColumn<TaskAssignment>[] = [
    { header: "Title", value: (t) => t.title },
    { header: "Type", value: (t) => t.taskType },
    { header: "Status", value: (t) => t.status },
    { header: "Priority", value: (t) => t.priority },
    { header: "Due", value: (t) => t.dueDate },
    { header: "Assigned By", value: (t) => t.assignedBy?.name },
    { header: "Created", value: (t) => new Date(t.createdAt).toLocaleString() },
  ];

  // Client-side pagination — 10 rows per page on My Tasks.
  const pager = usePagination(sortedTasks, 10);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  My Tasks
                </h1>
                <p className="text-sm text-muted-foreground">
                  View and update your assigned tasks
                </p>
              </div>
              <Button variant="outline" onClick={() => fetchTasks()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="rounded-xl bg-blue-50 border-blue-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <ClipboardList className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-900">{tasks.length}</p>
                    <p className="text-sm text-blue-700">Total Tasks</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-amber-50 border-amber-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-lg">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-900">{pendingCount}</p>
                    <p className="text-sm text-amber-700">Pending</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-orange-50 border-orange-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <PlayCircle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-900">{inProgressCount}</p>
                    <p className="text-sm text-orange-700">In Progress</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-green-50 border-green-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-900">{completedCount}</p>
                    <p className="text-sm text-green-700">Completed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Filter */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap items-end gap-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filter by status:</span>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tasks</SelectItem>
                      <SelectItem value="ASSIGNED">Assigned</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by title…"
                  className="w-full sm:w-64"
                />
                <ExportCsvButton
                  rows={sortedTasks}
                  columns={csvColumns}
                  filename="my-tasks"
                  className="ml-auto"
                />
              </CardContent>
            </Card>

            {/* Tasks List */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Task List</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading tasks...</p>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-8">
                    <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No tasks assigned to you</p>
                  </div>
                ) : (
                  pager.pageItems.map((task) => {
                    const isExpanded = expandedIds.has(task.id);
                    return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border bg-white hover:shadow-md transition ${
                        task.priority === 'URGENT' ? 'border-l-4 border-l-red-500' :
                        task.priority === 'HIGH' ? 'border-l-4 border-l-orange-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(task.id)}
                              aria-label={isExpanded ? "Collapse task" : "Expand task"}
                              className="mt-0.5 p-0.5 rounded hover:bg-indigo-50 text-indigo-700 shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <p className="font-semibold text-indigo-900">{task.title}</p>
                              {getStatusBadge(task.status)}
                              {getPriorityBadge(task.priority)}
                              <Badge variant="outline">{task.taskType}</Badge>
                              {task.source === 'OFFICE' && (
                                <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
                                  Office
                                </Badge>
                              )}
                              {task.coAssignees && task.coAssignees.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-indigo-200 bg-indigo-50 text-indigo-800"
                                  title={`Also assigned: ${task.coAssignees.map((c) => `${c.name} (${c.status.replace('_', ' ').toLowerCase()})`).join(', ')}`}
                                >
                                  You + {task.coAssignees.length} other{task.coAssignees.length === 1 ? '' : 's'}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pl-6">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Assigned: {formatDate(task.assignedAt)}
                            </span>
                            {task.dueDate && (
                              <span className="flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Due: {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="space-y-3 pl-6">
                              {task.description && (
                                <p className="text-sm text-muted-foreground">{task.description}</p>
                              )}

                              {task.coAssignees && task.coAssignees.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">Also working on this:</span>{' '}
                                  {task.coAssignees.map((c, i) => (
                                    <span key={c.id}>
                                      {i > 0 ? ', ' : ''}
                                      {c.name} <span className="text-indigo-600">({c.status.replace('_', ' ').toLowerCase()})</span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Recent Activity Timeline */}
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
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 items-end">
                          {/*
                            Office grievances are admin-managed: staff can SEE them
                            here (and their progress) but cannot edit — so no action
                            buttons, just a read-only note. The backend also blocks
                            staff edits to office tasks.

                            For non-office tasks, action buttons by status:
                            - ASSIGNED  -> Start Task (Update Progress is intentionally
                              hidden until the task is actually started, so progress
                              entries always belong to a started task).
                            - IN_PROGRESS / ON_HOLD -> Update Progress + Resolve.
                              Resolve flips status to COMPLETED in one click and
                              fires a TASK_RESOLVED notification to the admin who
                              assigned the task.
                            - COMPLETED -> no further action available.
                          */}
                          {task.source === 'OFFICE' ? (
                            <div className="text-right max-w-[150px]">
                              <Badge
                                variant="outline"
                                className="border-indigo-200 bg-indigo-50 text-indigo-700"
                              >
                                Admin-managed
                              </Badge>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Office grievance — view only. An admin tracks &amp;
                                updates this.
                              </p>
                            </div>
                          ) : task.status === 'ASSIGNED' ? (
                            <Button
                              size="sm"
                              disabled={updating}
                              onClick={() => handleStartTask(task)}
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              {updating ? 'Starting…' : 'Start Task'}
                            </Button>
                          ) : task.status !== 'COMPLETED' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleOpenUpdate(task)}
                              >
                                Update Progress
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updating}
                                onClick={() => handleResolveTask(task)}
                                className="border-green-300 bg-green-50 text-green-800 hover:bg-green-100 hover:text-green-900"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                {updating ? 'Resolving…' : 'Resolve'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
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

        {/* Update Progress Dialog */}
        <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Update Task Progress</DialogTitle>
              <DialogDescription>
                Update your progress on: {selectedTask?.title}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Progress Timeline */}
              <div>
                <label className="text-sm font-medium flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  Progress Timeline
                </label>
                <div className="max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                  {historyLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading history...</p>
                  ) : taskHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No updates yet. Add your first update below.</p>
                  ) : (
                    <div className="space-y-3">
                      {taskHistory.map((entry) => (
                        <div key={entry.id} className="relative pl-4 pb-3 border-l-2 border-indigo-200 last:border-l-0 last:pb-0">
                          <div className="absolute -left-1.5 top-0 w-3 h-3 bg-indigo-500 rounded-full"></div>
                          <div className="bg-white border rounded-lg p-3 shadow-sm">
                            <p className="text-sm text-gray-800">{entry.note}</p>
                            {entry.status && (
                              <Badge className="mt-2" variant="outline">
                                Status: {entry.status.replace('_', ' ')}
                              </Badge>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <span>{entry.createdBy?.name ?? '—'}</span>
                              <span>•</span>
                              <span>{formatDateTime(entry.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Add New Update */}
              <div>
                <label className="text-sm font-medium">Add Progress Update</label>
                <Textarea
                  placeholder="What progress have you made? Any blockers or updates?"
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                  className="mt-2"
                  rows={3}
                />
              </div>
              
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setUpdateDialogOpen(false)} className="flex-1 min-w-[100px]">
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleUpdateProgress('ON_HOLD')}
                  disabled={updating}
                  className="flex-1 min-w-[100px]"
                >
                  <PauseCircle className="h-4 w-4 mr-1" />
                  Put On Hold
                </Button>
                <Button
                  onClick={() => handleUpdateProgress()}
                  disabled={updating || !progressNotes.trim()}
                  className="flex-1 min-w-[100px] bg-indigo-600 hover:bg-indigo-700"
                >
                  {updating ? "Saving..." : "Add Update"}
                </Button>
                <Button
                  onClick={() => handleUpdateProgress('COMPLETED')}
                  disabled={updating}
                  className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {updating ? "Resolving..." : "Mark Resolved"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
