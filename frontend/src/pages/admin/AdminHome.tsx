import { useEffect, useState } from "react";
import { FileCheck, Printer, Train, ClipboardList, UserCheck, CheckCircle2, LogOut, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { BirthdayWidget } from "@/components/dashboard/BirthdayWidget";
import { grievanceApi, trainRequestApi, tourProgramApi, statsApi, attendanceApi, type Grievance, type TrainRequest, type TourProgram, type AttendanceStats, type AttendanceRow } from "@/lib/api";

export default function AdminHome() {
  const navigate = useNavigate();

  // Counts from the cached stats API (fast)
  const [grievanceCount, setGrievanceCount] = useState<number | null>(null);
  const [trainCount, setTrainCount] = useState<number | null>(null);
  const [tourCount, setTourCount] = useState<number | null>(null);

  // Preview lists (small fetches — just enough to show names)
  const [pendingGrievances, setPendingGrievances] = useState<Grievance[]>([]);
  const [pendingTrainRequests, setPendingTrainRequests] = useState<TrainRequest[]>([]);
  const [pendingTourPrograms, setPendingTourPrograms] = useState<TourProgram[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);

  // The admin's own attendance for today (admins check in / out like staff).
  const [myToday, setMyToday] = useState<AttendanceRow | null>(null);
  const [marking, setMarking] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Admin");

  const myPresent = myToday?.status === "PRESENT";
  const myCanCheckOut =
    myToday?.status === "PRESENT" || myToday?.status === "HALF_DAY";
  const myCheckedOut = !!myToday?.checkOutAt;

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

  useEffect(() => {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || "Admin");
      } catch { /* ignore */ }
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Stats API — single cached call, gives all counts instantly
        const [stats, grievancesRes, trainRes, tourRes, attendance, mine] = await Promise.all([
          statsApi.getSummary(),
          // Small previews: only 5 rows, DB-filtered
          grievanceApi.getAll({ isVerified: 'false', limit: '5' }),
          trainRequestApi.getAll({ status: 'PENDING', limit: '5' }),
          tourProgramApi.getAll({ decision: 'PENDING', limit: '5' }),
          attendanceApi.getTodayStats().catch(() => null),
          attendanceApi.getMyToday().catch(() => null),
        ]);

        // Counts from stats cache
        setGrievanceCount(stats?.grievances?.pendingVerification ?? 0);
        setTrainCount(stats?.trainRequests?.pending ?? 0);
        setTourCount(stats?.tourPrograms?.pending ?? 0);

        // Preview rows
        setPendingGrievances(Array.isArray(grievancesRes?.data) ? grievancesRes.data : []);
        setPendingTrainRequests(Array.isArray(trainRes?.data) ? trainRes.data : []);
        setPendingTourPrograms(Array.isArray(tourRes?.data) ? tourRes.data : []);
        setAttendanceStats(attendance);
        setMyToday(mine);
      } catch (error) {
        console.error('Failed to fetch pending items:', error);
        setGrievanceCount(0);
        setTrainCount(0);
        setTourCount(0);
        setPendingGrievances([]);
        setPendingTrainRequests([]);
        setPendingTourPrograms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalPending = (grievanceCount ?? 0) + (trainCount ?? 0) + (tourCount ?? 0);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  Welcome, {userName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Verification & Letter Management
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                ADMIN ACCESS
              </span>
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

            {/* PRIMARY ACTIONS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <FileCheck className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Grievances</h3>
                  <p className="text-sm text-muted-foreground">
                    {grievanceCount === null ? "Loading…" : `${grievanceCount} pending verification`}
                  </p>
                  <Button size="sm" onClick={() => navigate("/grievances/view")} className="w-full">
                    Open Grievances
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <Printer className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Print Letters</h3>
                  <p className="text-sm text-muted-foreground">Generate and print official letters</p>
                  <Button size="sm" onClick={() => navigate("/admin/print-center")} className="w-full">
                    Print Center
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <Train className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Train EQ Letters</h3>
                  <p className="text-sm text-muted-foreground">
                    {trainCount === null ? "Loading…" : `${trainCount} pending approval`}
                  </p>
                  <Button size="sm" onClick={() => navigate("/train-eq/queue")} className="w-full">
                    View Requests
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <ClipboardList className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Tour Decisions</h3>
                  <p className="text-sm text-muted-foreground">
                    {tourCount === null ? "Loading…" : `${tourCount} pending decisions`}
                  </p>
                  <Button size="sm" onClick={() => navigate("/tour-program/pending")} className="w-full">
                    Review
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* PENDING APPROVALS + BIRTHDAY WIDGET */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card className="rounded-2xl shadow-sm border border-indigo-100 h-full">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-lg">Pending Approvals</CardTitle>
                    <Badge variant={totalPending > 0 ? "destructive" : "secondary"}>
                      {totalPending} Pending
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-4 text-sm">
                    {loading ? (
                      <p className="text-muted-foreground">Loading pending items…</p>
                    ) : totalPending === 0 ? (
                      <p className="text-muted-foreground">All caught up! No pending approvals.</p>
                    ) : (
                      <>
                        {pendingGrievances.map((g) => (
                          <div key={g.id} className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="font-medium">Grievance – {g.grievanceType}</p>
                                {g.source === 'OFFICE' && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-indigo-600 hover:bg-indigo-600 text-white">
                                    OFFICE
                                  </Badge>
                                )}
                                {g.priority && g.priority !== 'MEDIUM' && (
                                  <Badge
                                    className={`text-[10px] px-1.5 py-0 h-4 text-white ${
                                      g.priority === 'CRITICAL'
                                        ? 'bg-red-600 hover:bg-red-600'
                                        : g.priority === 'HIGH'
                                          ? 'bg-orange-500 hover:bg-orange-500'
                                          : 'bg-slate-400 hover:bg-slate-400'
                                    }`}
                                  >
                                    {g.priority === 'CRITICAL' ? '🚨 ' : ''}{g.priority}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground">
                                {g.referenceNo && (
                                  <span className="font-mono text-indigo-700">{g.referenceNo} • </span>
                                )}
                                {g.petitionerName} • {new Date(g.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate("/grievances/view")}>
                              Review
                            </Button>
                          </div>
                        ))}

                        {pendingTrainRequests.map((t) => (
                          <div key={t.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Train EQ – {t.passengerName}</p>
                              <p className="text-muted-foreground">
                                PNR: {t.pnrNumber} • {new Date(t.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate("/train-eq/queue")}>
                              Review
                            </Button>
                          </div>
                        ))}

                        {pendingTourPrograms.map((tour) => (
                          <div key={tour.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Tour – {tour.eventName}</p>
                              <p className="text-muted-foreground">
                                {tour.organizer} • Decision Pending
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate("/tour-program/pending")}>
                              Decide
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
          </div>
        </div>
      </main>
    </div>
  );
}
