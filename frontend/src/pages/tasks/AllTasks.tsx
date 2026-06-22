import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Pencil,
  Clock,
  History as HistoryIcon,
  CheckCircle2,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import type { CsvColumn } from "@/lib/exportCsv";
import {
  taskApi,
  type TaskAssignment,
  type TaskStatus,
  type TaskProgressHistory,
} from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  ASSIGNED: "bg-slate-100 text-slate-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ON_HOLD: "bg-rose-100 text-rose-800",
};

const STATUS_OPTIONS: TaskStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
];
const TYPE_OPTIONS = ["GRIEVANCE", "TRAIN_REQUEST", "TOUR_PROGRAM", "GENERAL"];

const CSV_COLUMNS: CsvColumn<TaskAssignment>[] = [
  { header: "Reference No", value: (t) => t.referenceNo ?? "" },
  { header: "Title", value: (t) => t.title },
  { header: "Type", value: (t) => t.taskType },
  { header: "Status", value: (t) => t.status },
  { header: "Priority", value: (t) => t.priority },
  { header: "Assigned To", value: (t) => t.assignedTo?.name ?? "" },
  { header: "Due", value: (t) => t.dueDate ?? "" },
  { header: "Created", value: (t) => (t.createdAt ? new Date(t.createdAt).toLocaleString() : "") },
];

// Linked-record types that have a deep-linkable detail view today. Grievances
// open their full details (+ timeline + attachments) on the View Grievances page.
const RECORD_LABEL: Record<string, string> = {
  GRIEVANCE: "grievance",
  TOUR_PROGRAM: "tour program",
  TRAIN_REQUEST: "train request",
};

export default function AllTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (all client-side over the fetched set).
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Edit dialog state.
  const [editing, setEditing] = useState<TaskAssignment | null>(null);
  const [editStatus, setEditStatus] = useState<TaskStatus>("IN_PROGRESS");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [audit, setAudit] = useState<TaskProgressHistory[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Read-only details dialog. Shows the full task + its activity timeline, plus
  // a jump to the linked source record (e.g. the grievance) when available.
  const [viewing, setViewing] = useState<TaskAssignment | null>(null);
  const [viewAudit, setViewAudit] = useState<TaskProgressHistory[]>([]);
  const [viewAuditLoading, setViewAuditLoading] = useState(false);

  // Inline quick-status update (no dialog). Records an audit entry via editShared.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await taskApi.getAllShared({ limit: "300" });
      setTasks(res.data ?? []);
    } catch (err) {
      console.error("Failed to load tasks", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Open the read-only details view for a task and load its activity timeline.
  const openView = async (task: TaskAssignment) => {
    setViewing(task);
    setViewAudit([]);
    setViewAuditLoading(true);
    try {
      setViewAudit(await taskApi.getAudit(task.id));
    } catch (err) {
      console.error("Failed to load activity timeline", err);
    } finally {
      setViewAuditLoading(false);
    }
  };

  // Jump to the linked source record. Only grievances have a deep-linkable
  // detail page today (View Grievances opens the row by ?id=).
  const openLinkedRecord = (task: TaskAssignment) => {
    if (task.referenceType === "GRIEVANCE" && task.referenceId) {
      navigate(`/grievances/view?id=${encodeURIComponent(task.referenceId)}`);
    }
  };

  const openEdit = async (task: TaskAssignment) => {
    setEditing(task);
    setEditStatus(task.status ?? "ASSIGNED");
    setRemark("");
    setEditError(null);
    setAudit([]);
    setAuditLoading(true);
    try {
      setAudit(await taskApi.getAudit(task.id));
    } catch (err) {
      console.error("Failed to load audit timeline", err);
    } finally {
      setAuditLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = remark.trim();
    if (editStatus === editing.status && !trimmed) {
      setEditError("Change the status or add a remark before saving.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await taskApi.editShared(editing.id, {
        status: editStatus !== editing.status ? editStatus : undefined,
        progressNotes: trimmed || undefined,
      });
      setEditing(null);
      await load();
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setSaving(false);
    }
  };

  // One-click status change straight from the row (e.g. Assigned → In Progress
  // / On Hold / Completed). Each change is logged in the audit timeline.
  const quickStatus = async (task: TaskAssignment, status: TaskStatus) => {
    if (status === task.status) return;
    setBusyId(task.id);
    try {
      await taskApi.editShared(task.id, { status });
      await load();
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to update status."
      );
    } finally {
      setBusyId(null);
    }
  };

  // Unique assignee names for the people filter.
  const assignees = Array.from(
    new Set(tasks.map((t) => t.assignedTo?.name).filter(Boolean) as string[])
  ).sort();

  const q = search.trim().toLowerCase();
  const filtered = tasks.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (typeFilter !== "ALL" && t.taskType !== typeFilter) return false;
    if (assigneeFilter !== "ALL" && t.assignedTo?.name !== assigneeFilter)
      return false;
    if (startDate && (!t.createdAt || t.createdAt.slice(0, 10) < startDate))
      return false;
    if (endDate && (!t.createdAt || t.createdAt.slice(0, 10) > endDate))
      return false;
    if (q) {
      const hay = `${t.referenceNo ?? ""} ${t.title} ${t.description ?? ""} ${t.assignedTo?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const selectCls =
    "h-9 rounded-md border border-gray-300 px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">All Tasks</h1>
              <p className="text-sm text-muted-foreground">
                Every pending task across the office. Anyone can update status or
                add a remark — each change is logged with your name and time.
              </p>
            </div>

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search title, description, person…"
                    className="flex-1 min-w-[220px]"
                  />
                  <ExportCsvButton rows={filtered} columns={CSV_COLUMNS} filename="all-tasks" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className={selectCls}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All statuses</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="ALL">All types</option>
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t.replace("_", " ")}</option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                  >
                    <option value="ALL">Everyone</option>
                    {assignees.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>
              </CardContent>
            </Card>

            {/* List */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Tasks ({filtered.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks match the filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-2 pr-4">Task</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Assigned To</th>
                          <th className="py-2 pr-4">Due</th>
                          <th className="py-2 pr-4">Created</th>
                          <th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((t) => (
                          <tr key={t.id} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-4">
                              <p className="font-medium">{t.title}</p>
                              {t.referenceNo && (
                                <span className="font-mono text-[11px] text-indigo-700">
                                  {t.referenceNo}
                                </span>
                              )}
                              {t.progressNotes && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {t.progressNotes}
                                </p>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {t.taskType ? t.taskType.replace("_", " ") : "—"}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge className={STATUS_TONE[t.status ?? ""] ?? ""}>
                                {t.status ? t.status.replace("_", " ") : "—"}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4">{t.assignedTo?.name ?? "—"}</td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="py-2">
                              <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                <select
                                  className={selectCls}
                                  value={t.status ?? "ASSIGNED"}
                                  disabled={busyId === t.id}
                                  onChange={(e) =>
                                    quickStatus(t, e.target.value as TaskStatus)
                                  }
                                  title="Change status"
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {s.replace("_", " ")}
                                    </option>
                                  ))}
                                </select>
                                {t.status !== "COMPLETED" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === t.id}
                                    onClick={() => quickStatus(t, "COMPLETED")}
                                    className="border-green-300 bg-green-50 text-green-800 hover:bg-green-100 hover:text-green-900"
                                  >
                                    {busyId === t.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                        Complete
                                      </>
                                    )}
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => openView(t)}>
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Edit dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-indigo-900">{editing.title}</h2>
              <p className="text-xs text-muted-foreground">
                {(editing.taskType ?? "GENERAL").replace("_", " ")} • Assigned to{" "}
                {editing.assignedTo?.name ?? "—"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                className={selectCls + " w-full"}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Remark <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
                placeholder="Add a note about this update…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {editError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                {editError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>

            {/* Audit timeline */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
                <HistoryIcon className="h-3.5 w-3.5" /> Activity timeline
              </p>
              {auditLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : audit.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-auto">
                  {audit.map((h) => (
                    <li key={h.id} className="text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}
                        {" • "}
                        <span className="font-medium text-gray-700">
                          {h.createdBy?.name ?? "Unknown"}
                        </span>
                        {h.status && (
                          <Badge className={STATUS_TONE[h.status] ?? ""}>
                            {h.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-gray-700">{h.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Read-only details view */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-indigo-900 break-words">
                  {viewing.title}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge className={STATUS_TONE[viewing.status ?? ""] ?? ""}>
                    {viewing.status ? viewing.status.replace("_", " ") : "—"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(viewing.taskType ?? "GENERAL").replace("_", " ")}
                  </span>
                  {viewing.referenceNo && (
                    <span className="font-mono text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                      {viewing.referenceNo}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Assigned to</p>
                <p className="font-medium">{viewing.assignedTo?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="font-medium">{viewing.priority ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due</p>
                <p className="font-medium">
                  {viewing.dueDate ? new Date(viewing.dueDate).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium">
                  {viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : "—"}
                </p>
              </div>
            </div>

            {viewing.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-3">
                  {viewing.description}
                </p>
              </div>
            )}

            {viewing.progressNotes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Latest remark</p>
                <p className="whitespace-pre-wrap text-sm">{viewing.progressNotes}</p>
              </div>
            )}

            {/* Jump to the linked source record (grievance, etc.) */}
            {viewing.referenceType === "GRIEVANCE" && viewing.referenceId && (
              <Button
                variant="outline"
                className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                onClick={() => openLinkedRecord(viewing)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open {RECORD_LABEL[viewing.referenceType] ?? "record"}
              </Button>
            )}

            {/* Activity timeline */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
                <HistoryIcon className="h-3.5 w-3.5" /> Activity timeline
              </p>
              {viewAuditLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : viewAudit.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-auto">
                  {viewAudit.map((h) => (
                    <li key={h.id} className="text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}
                        {" • "}
                        <span className="font-medium text-gray-700">
                          {h.createdBy?.name ?? "Unknown"}
                        </span>
                        {h.status && (
                          <Badge className={STATUS_TONE[h.status] ?? ""}>
                            {h.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-gray-700">{h.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button onClick={() => { const t = viewing; setViewing(null); openEdit(t); }}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
