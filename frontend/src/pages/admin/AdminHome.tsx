import { useEffect, useState } from "react";
import { FileCheck, Printer, Train, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { BirthdayWidget } from "@/components/dashboard/BirthdayWidget";
import { grievanceApi, trainRequestApi, tourProgramApi, statsApi, type Grievance, type TrainRequest, type TourProgram } from "@/lib/api";

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

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Admin");

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
        const [stats, grievancesRes, trainRes, tourRes] = await Promise.all([
          statsApi.getSummary(),
          // Small previews: only 5 rows, DB-filtered
          grievanceApi.getAll({ isVerified: 'false', limit: '5' }),
          trainRequestApi.getAll({ status: 'PENDING', limit: '5' }),
          tourProgramApi.getAll({ decision: 'PENDING', limit: '5' }),
        ]);

        // Counts from stats cache
        setGrievanceCount(stats?.grievances?.pendingVerification ?? 0);
        setTrainCount(stats?.trainRequests?.pending ?? 0);
        setTourCount(stats?.tourPrograms?.pending ?? 0);

        // Preview rows
        setPendingGrievances(Array.isArray(grievancesRes?.data) ? grievancesRes.data : []);
        setPendingTrainRequests(Array.isArray(trainRes?.data) ? trainRes.data : []);
        setPendingTourPrograms(Array.isArray(tourRes?.data) ? tourRes.data : []);
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

            {/* PRIMARY ACTIONS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <FileCheck className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Verify Grievances</h3>
                  <p className="text-sm text-muted-foreground">
                    {grievanceCount === null ? "Loading…" : `${grievanceCount} pending verification`}
                  </p>
                  <Button size="sm" onClick={() => navigate("/grievances/verify")} className="w-full">
                    Open Queue
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
                          <div key={g.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Grievance – {g.grievanceType}</p>
                              <p className="text-muted-foreground">
                                {g.petitionerName} • {new Date(g.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate("/grievances/verify")}>
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
