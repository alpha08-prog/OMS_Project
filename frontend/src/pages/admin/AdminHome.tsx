import { useEffect, useState } from "react";
import {
  FileCheck,
  FileText,
  Printer,
  Train,
  ClipboardList,
  UserCheck,
  CheckCircle2,
  LogOut,
  Loader2,
  Users,
  Cake,
  Calendar,
  Newspaper,
  ArrowRight,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { BirthdayWidget } from "@/components/dashboard/BirthdayWidget";
import {
  grievanceApi,
  tourProgramApi,
  statsApi,
  attendanceApi,
  taskApi,
  type DashboardStats,
  type Grievance,
  type TourProgram,
  type AttendanceStats,
  type AttendanceRow,
  type TaskAssignment,
} from "@/lib/api";

export default function AdminHome() {
  const navigate = useNavigate();

  // Office-wide counts from the cached stats API (single fast call).
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // The only items that still need a human decision now that Train EQ
  // auto-approves and grievances no longer require a verification step:
  // active (OPEN) grievances and tour programs awaiting a decision.
  const [openGrievances, setOpenGrievances] = useState<Grievance[]>([]);
  const [pendingTours, setPendingTours] = useState<TourProgram[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);

  // The admin's own attendance for today (admins check in / out like staff).
  const [myToday, setMyToday] = useState<AttendanceRow | null>(null);
  const [marking, setMarking] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Admin");

  // Forwarded-tasks queue. The backend only returns rows to the configured
  // recipient (Shri. Mallikarjungouda Patil in production; a test admin locally
  // via OMS_FORWARD_TO_IDS), and [] for everyone else — so the card just renders
  // whenever this list is non-empty. No client-side id check needed.
  const [forwardedTasks, setForwardedTasks] = useState<TaskAssignment[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const myPresent = myToday?.status === "PRESENT";
  const myCanCheckOut =
    myToday?.status === "PRESENT" || myToday?.status === "HALF_DAY";
  const myCheckedOut = !!myToday?.checkOutAt;

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const handleMarkPresent = async () => {
    setMarking(true);
    try {
      setMyToday(await attendanceApi.mark("PRESENT"));
    } catch (e) {
      console.error("Failed to mark attendance", e);
    } finally {
      setMarking(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      setMyToday(await attendanceApi.checkOut());
    } catch (e) {
      console.error("Failed to check out", e);
    } finally {
      setCheckingOut(false);
    }
  };

  // Mark a forwarded task complete. This sets COMPLETED everywhere (the task's
  // status field), and the backend drops it from the forwarded queue.
  const completeForwarded = async (id: string) => {
    setCompletingId(id);
    try {
      await taskApi.editShared(id, { status: "COMPLETED" });
      setForwardedTasks(await taskApi.getForwarded());
    } catch (e) {
      console.error("Failed to complete forwarded task", e);
    } finally {
      setCompletingId(null);
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || "Admin");
      } catch {
        /* ignore */
      }
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [summary, grievancesRes, tourRes, attendance, mine] = await Promise.all([
          statsApi.getSummary(),
          // Active grievances that still need handling + tour decisions awaiting
          // a call — small DB-filtered previews, just enough for names.
          grievanceApi.getAll({ status: "OPEN", limit: "5" }),
          tourProgramApi.getAll({ decision: "PENDING", limit: "5" }),
          attendanceApi.getTodayStats().catch(() => null),
          attendanceApi.getMyToday().catch(() => null),
        ]);

        setStats(summary ?? null);
        setOpenGrievances(Array.isArray(grievancesRes?.data) ? grievancesRes.data : []);
        setPendingTours(Array.isArray(tourRes?.data) ? tourRes.data : []);
        setAttendanceStats(attendance);
        setMyToday(mine);

        // The forwarded queue is server-scoped to the recipient (returns [] for
        // everyone else), so it's safe to always ask — the card only appears
        // when something actually comes back.
        try {
          setForwardedTasks(await taskApi.getForwarded());
        } catch {
          /* non-fatal — leave the queue empty */
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        setStats(null);
        setOpenGrievances([]);
        setPendingTours([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // KPI tiles — at-a-glance office numbers, each linking to its module.
  const kpis = [
    {
      label: "Open Grievances",
      value: stats?.grievances.open,
      sub: stats
        ? `${stats.grievances.total} total · ${stats.grievances.resolved} resolved`
        : "",
      icon: FileCheck,
      accent: "text-indigo-700 bg-indigo-100",
      to: "/grievances/view",
    },
    {
      label: "Train EQ Letters",
      value: stats?.trainRequests.total,
      sub: "Auto-approved · ready to print",
      icon: Train,
      accent: "text-purple-700 bg-purple-100",
      to: "/train-eq/queue",
    },
    {
      label: "Upcoming Tours",
      value: stats?.tourPrograms.upcoming,
      sub: stats && stats.tourPrograms.pending > 0
        ? `${stats.tourPrograms.pending} awaiting decision`
        : "No pending decisions",
      icon: ClipboardList,
      accent: "text-amber-700 bg-amber-100",
      to: "/tour-program/pending",
    },
    {
      label: "Visitors Today",
      value: stats?.visitors.today,
      sub: stats
        ? `${stats.birthdays.today} birthday${stats.birthdays.today === 1 ? "" : "s"} today`
        : "",
      icon: Users,
      accent: "text-emerald-700 bg-emerald-100",
      to: "/admin/visitors",
    },
  ];

  // Compact navigation strip — the everyday destinations.
  const quickActions = [
    { label: "Grievances", icon: FileCheck, to: "/grievances/view" },
    { label: "Print Center", icon: Printer, to: "/admin/print-center" },
    { label: "Train EQ", icon: Train, to: "/train-eq/queue" },
    { label: "Tour Decisions", icon: ClipboardList, to: "/tour-program/pending" },
    { label: "Visitors", icon: Users, to: "/admin/visitors" },
    { label: "News", icon: Newspaper, to: "/news/view" },
    { label: "Birthdays", icon: Cake, to: "/admin/birthdays" },
  ];

  const attentionCount = openGrievances.length + pendingTours.length;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  Welcome, {userName}
                </h1>
                <p className="text-sm text-muted-foreground">{today}</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                ADMIN
              </span>
            </div>

            {/* FORWARDED TO YOU — high-priority queue, shown only to the
                configured recipient (the backend returns [] to everyone else).
                Each task carries full details and a Complete button; completing
                it sets COMPLETED everywhere. */}
            {forwardedTasks.length > 0 && (
              <Card className="rounded-2xl border-2 border-rose-300 bg-rose-50/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2 text-rose-800">
                    <AlertTriangle className="h-5 w-5" />
                    High Priority — Forwarded to You
                    <Badge className="bg-rose-600 text-white hover:bg-rose-600">
                      {forwardedTasks.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {forwardedTasks.map((t) => (
                    <div key={t.id} className="rounded-xl border border-rose-200 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900 break-words">{t.title}</p>
                            <Badge variant="outline">
                              {(t.taskType ?? "GENERAL").replace("_", " ")}
                            </Badge>
                            {t.referenceNo && (
                              <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                {t.referenceNo}
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Assigned to:{" "}
                              <span className="font-medium text-slate-700">
                                {t.assignedTo?.name ?? "—"}
                              </span>
                            </span>
                            <span>
                              Forwarded by:{" "}
                              <span className="font-medium text-slate-700">
                                {t.forwardedBy?.name ?? "—"}
                              </span>
                            </span>
                            {t.forwardedAt && (
                              <span>On {new Date(t.forwardedAt).toLocaleString()}</span>
                            )}
                            <span>
                              Status:{" "}
                              <span className="font-medium text-slate-700">
                                {(t.status ?? "").replace("_", " ")}
                              </span>
                            </span>
                          </div>
                          {t.progressNotes && (
                            <p className="mt-1 text-xs text-slate-600">
                              Latest remark: {t.progressNotes}
                            </p>
                          )}
                        </div>
                        <Button
                          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={completingId === t.id}
                          onClick={() => completeForwarded(t.id)}
                        >
                          {completingId === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          Complete
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* KPI ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis.map((k) => (
                <button
                  key={k.label}
                  type="button"
                  onClick={() => navigate(k.to)}
                  className="text-left"
                >
                  <Card className="rounded-2xl border border-indigo-100 transition hover:shadow-md hover:-translate-y-0.5 h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className={`p-2 rounded-xl ${k.accent}`}>
                          <k.icon className="h-5 w-5" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">
                        {k.value ?? (loading ? "…" : 0)}
                      </p>
                      <p className="text-sm font-medium text-slate-700">{k.label}</p>
                      {k.sub && (
                        <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
                      )}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>

            {/* ATTENDANCE TODAY */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-indigo-700" />
                  Today's Attendance
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/attendance")}>
                  View full
                </Button>
              </CardHeader>
              <CardContent>
                {/* My own check-in / check-out */}
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <span className="text-sm font-medium text-indigo-900">You:</span>
                  {myToday ? (
                    <>
                      <span
                        className={
                          "px-2.5 py-0.5 rounded-full text-xs font-medium " +
                          (myToday.status === "PRESENT"
                            ? "bg-emerald-100 text-emerald-800"
                            : myToday.status === "HALF_DAY"
                            ? "bg-amber-100 text-amber-800"
                            : myToday.status === "LEAVE"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-rose-100 text-rose-800")
                        }
                      >
                        {myToday.status.replace("_", " ")}
                      </span>
                      {myToday.markedAt && (
                        <span className="text-xs text-muted-foreground">
                          in {new Date(myToday.markedAt).toLocaleTimeString()}
                        </span>
                      )}
                      {myToday.checkOutAt && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <LogOut className="h-3.5 w-3.5 text-rose-600" />
                          out {new Date(myToday.checkOutAt).toLocaleTimeString()}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not marked present yet.
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {!myPresent && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={marking}
                        onClick={handleMarkPresent}
                      >
                        {marking ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Mark present
                      </Button>
                    )}
                    {myCanCheckOut && !myCheckedOut && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-300 text-rose-700 hover:bg-rose-50"
                        disabled={checkingOut}
                        onClick={handleCheckOut}
                      >
                        {checkingOut ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <LogOut className="h-4 w-4 mr-1" />
                        )}
                        Check out
                      </Button>
                    )}
                  </div>
                </div>

                {attendanceStats ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <p className="text-xs uppercase text-emerald-700">Present</p>
                      <p className="text-2xl font-semibold text-emerald-900">{attendanceStats.present}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-xs uppercase text-amber-700">Half Day</p>
                      <p className="text-2xl font-semibold text-amber-900">{attendanceStats.halfDay}</p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                      <p className="text-xs uppercase text-sky-700">Leave</p>
                      <p className="text-2xl font-semibold text-sky-900">{attendanceStats.leave}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                      <p className="text-xs uppercase text-rose-700">Absent</p>
                      <p className="text-2xl font-semibold text-rose-900">{attendanceStats.absent}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading attendance…</p>
                )}
              </CardContent>
            </Card>

            {/* QUICK ENTRY ACTIONS — same data-entry shortcuts staff get, so
                admins can create records directly without hunting the sidebar. */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">Quick Entry</CardTitle>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <Button
                    onClick={() => navigate("/grievances/new")}
                    className="h-24 flex flex-col gap-2 bg-amber-500 text-black hover:bg-amber-600"
                  >
                    <FileText className="h-6 w-6" />
                    <span className="text-sm font-medium">New Grievance</span>
                  </Button>

                  <Button
                    onClick={() => navigate("/train-eq/new")}
                    className="h-24 flex flex-col gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Train className="h-6 w-6" />
                    <span className="text-sm font-medium">Train EQ</span>
                  </Button>

                  <Button
                    onClick={() => navigate("/people/new")}
                    className="h-24 flex flex-col gap-2 bg-slate-700 text-white hover:bg-slate-800"
                  >
                    <Users className="h-6 w-6" />
                    <span className="text-sm font-medium">Visitor / Birthday</span>
                  </Button>

                  <Button
                    onClick={() => navigate("/tour-program/new")}
                    className="h-24 flex flex-col gap-2 bg-sky-600 text-white hover:bg-sky-700"
                  >
                    <Calendar className="h-6 w-6" />
                    <span className="text-sm font-medium">Tour Program</span>
                  </Button>

                  <Button
                    onClick={() => navigate("/news-intelligence/new")}
                    className="h-24 flex flex-col gap-2 bg-teal-600 text-white hover:bg-teal-700"
                  >
                    <Newspaper className="h-6 w-6" />
                    <span className="text-sm font-medium">News Entry</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* NEEDS ATTENTION + BIRTHDAY WIDGET */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card className="rounded-2xl shadow-sm border border-indigo-100 h-full">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-lg">Needs Attention</CardTitle>
                    <Badge variant={attentionCount > 0 ? "destructive" : "secondary"}>
                      {attentionCount} item{attentionCount === 1 ? "" : "s"}
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-3 text-sm">
                    {loading ? (
                      <p className="text-muted-foreground">Loading…</p>
                    ) : attentionCount === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                        <p className="font-medium text-slate-700">All caught up!</p>
                        <p className="text-muted-foreground">
                          No open grievances or pending tour decisions.
                        </p>
                      </div>
                    ) : (
                      <>
                        {pendingTours.map((tour) => (
                          <div
                            key={tour.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <CalendarClock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                                <p className="font-medium truncate">Tour – {tour.eventName}</p>
                              </div>
                              <p className="text-muted-foreground truncate">
                                {tour.organizer}
                                {tour.dateTime && ` • ${new Date(tour.dateTime).toLocaleDateString()}`}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate("/tour-program/pending")}>
                              Decide
                            </Button>
                          </div>
                        ))}

                        {openGrievances.map((g) => (
                          <div
                            key={g.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/30 p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <FileCheck className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />
                                <p className="font-medium truncate">
                                  Grievance – {g.grievanceType}
                                </p>
                                {g.source === "OFFICE" && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-indigo-600 hover:bg-indigo-600 text-white">
                                    OFFICE
                                  </Badge>
                                )}
                                {g.priority && g.priority !== "MEDIUM" && (
                                  <Badge
                                    className={`text-[10px] px-1.5 py-0 h-4 text-white ${
                                      g.priority === "CRITICAL"
                                        ? "bg-red-600 hover:bg-red-600"
                                        : g.priority === "HIGH"
                                        ? "bg-orange-500 hover:bg-orange-500"
                                        : "bg-slate-400 hover:bg-slate-400"
                                    }`}
                                  >
                                    {g.priority === "CRITICAL" ? "🚨 " : ""}
                                    {g.priority}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground truncate">
                                {g.referenceNo && (
                                  <span className="font-mono text-indigo-700">{g.referenceNo} • </span>
                                )}
                                {g.petitionerName} • {new Date(g.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate("/grievances/view")}>
                              Open
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div>
                <BirthdayWidget />
              </div>
            </div>

            {/* QUICK ACTIONS */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {quickActions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => navigate(a.to)}
                      className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-center transition hover:border-indigo-200 hover:bg-indigo-50/50"
                    >
                      <a.icon className="h-5 w-5 text-indigo-700" />
                      <span className="text-xs font-medium text-slate-700">{a.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
