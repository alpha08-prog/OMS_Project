import { useEffect, useState } from "react";
import {
  Briefcase,
  Loader2,
  FileText,
  Pencil,
  History as HistoryIcon,
  RefreshCw,
  User,
  CheckCircle2,
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
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  taskApi,
  grievanceApi,
  type TaskAssignment,
  type TaskProgressHistory,
  type TaskStatus,
} from "@/lib/api";

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
  { value: "ALL", label: "All" },
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

export default function AdminOfficeTasks() {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

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
      const office = (taskResp.data ?? []).filter(
        (t) =>
          (t.source ?? "PUBLIC") === "OFFICE" ||
          (t.referenceType === "GRIEVANCE" &&
            t.referenceId &&
            officeGrievanceIds.has(String(t.referenceId)))
      );
      setTasks(office);
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
      alert(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusyId(null);
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

  const visible = tasks.filter((t) =>
    statusFilter === "ALL" ? true : t.status === statusFilter
  );

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-3">
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
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={statusFilter === f.value ? "default" : "outline"}
                  onClick={() => setStatusFilter(f.value)}
                  className={
                    statusFilter === f.value
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : ""
                  }
                >
                  {f.label}
                </Button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : visible.length === 0 ? (
              <Card className="rounded-2xl border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No office tasks
                  {statusFilter === "ALL"
                    ? "."
                    : ` with status "${statusFilter}".`}
                </CardContent>
              </Card>
            ) : (
              visible.map((t) => (
                <Card
                  key={t.id}
                  className="rounded-2xl shadow-sm border border-indigo-100"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {t.title}
                      <Badge className={STATUS_STYLES[t.status]}>
                        {t.status.replace("_", " ")}
                      </Badge>
                      {t.referenceNo && (
                        <span className="font-mono text-xs text-indigo-700">
                          {t.referenceNo}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {t.description && (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <FileText className="h-4 w-4 mt-0.5 shrink-0" />{" "}
                        {t.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Entered by:{" "}
                        <span className="font-medium text-foreground">
                          {t.assignedTo?.name ?? t.assignedBy?.name ?? "—"}
                        </span>
                      </span>
                      <span>Created {formatDateTime(t.createdAt)}</span>
                    </div>

                    {t.progressNotes && (
                      <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3">
                        <p className="text-xs font-semibold text-indigo-800 mb-1">
                          Latest remark
                        </p>
                        <p className="whitespace-pre-wrap text-foreground/90">
                          {t.progressNotes}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={
                          MANAGE_STATUSES.includes(t.status)
                            ? t.status
                            : "ASSIGNED"
                        }
                        disabled={busyId === t.id}
                        onChange={(e) =>
                          quickStatus(t, e.target.value as TaskStatus)
                        }
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openManage(t)}
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Manage / Update
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>

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

            {manageError && (
              <p className="text-sm text-rose-600">{manageError}</p>
            )}

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
                <p className="text-sm text-muted-foreground">
                  No updates recorded yet.
                </p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {audit.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {h.createdBy?.name ?? "—"}
                        </span>
                        {h.status && (
                          <Badge
                            className={`${STATUS_STYLES[h.status]} text-xs px-2 py-0`}
                          >
                            {h.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      {h.note && (
                        <p className="whitespace-pre-wrap text-foreground/90 mt-1">
                          {h.note}
                        </p>
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
            <Button
              variant="outline"
              onClick={() => setManageTask(null)}
              disabled={savingManage}
            >
              Close
            </Button>
            <Button
              onClick={handleSaveManage}
              disabled={savingManage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingManage ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Save update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
