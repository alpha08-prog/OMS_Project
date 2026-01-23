import { useEffect, useState } from "react";
import { FileCheck, Printer, Train, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { BirthdayWidget } from "@/components/dashboard/BirthdayWidget";
import { grievanceApi, trainRequestApi, tourProgramApi, type Grievance, type TrainRequest, type TourProgram } from "@/lib/api";

export default function AdminHome() {
  const navigate = useNavigate();
  const [pendingGrievances, setPendingGrievances] = useState<Grievance[]>([]);
  const [pendingTrainRequests, setPendingTrainRequests] = useState<TrainRequest[]>([]);
  const [pendingTourPrograms, setPendingTourPrograms] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Admin");

  useEffect(() => {
    // Get user name from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || "Admin");
      } catch {
        // ignore parse errors
      }
    }

    // Fetch pending items
    const fetchPendingItems = async () => {
      try {
        setLoading(true);
        // Fetch unverified grievances
        const grievancesRes = await grievanceApi.getAll({ status: 'OPEN', limit: '5' });
        console.log('AdminHome - Grievances response:', grievancesRes);
        const grievances = Array.isArray(grievancesRes?.data) ? grievancesRes.data : [];
        setPendingGrievances(grievances.filter((g: Grievance) => !g.isVerified));

        // Fetch pending train requests
        const trainRes = await trainRequestApi.getAll({ status: 'PENDING', limit: '5' });
        console.log('AdminHome - Train requests response:', trainRes);
        const trainRequests = Array.isArray(trainRes?.data) ? trainRes.data : [];
        setPendingTrainRequests(trainRequests);

        // Fetch pending tour programs
        const tourRes = await tourProgramApi.getAll({ decision: 'PENDING', limit: '5' });
        console.log('AdminHome - Tour programs response:', tourRes);
        const tourPrograms = Array.isArray(tourRes?.data) ? tourRes.data : [];
        setPendingTourPrograms(tourPrograms);
      } catch (error: any) {
        console.error('Failed to fetch pending items:', error);
        console.error('Error details:', error?.response?.data || error?.message);
        // Set empty arrays on error to prevent undefined errors
        setPendingGrievances([]);
        setPendingTrainRequests([]);
        setPendingTourPrograms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingItems();
  }, []);

  const totalPending = pendingGrievances.length + pendingTrainRequests.length + pendingTourPrograms.length;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <DashboardSidebar />

      {/* Main Content */}
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
                    {pendingGrievances.length} pending verification
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate("/grievances/verify")}
                    className="w-full"
                  >
                    Open Queue
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <Printer className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Print Letters</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate and print official letters
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate("/admin/print-center")}
                    className="w-full"
                  >
                    Print Center
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <Train className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Train EQ Letters</h3>
                  <p className="text-sm text-muted-foreground">
                    {pendingTrainRequests.length} pending approval
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate("/train-eq/queue")}
                    className="w-full"
                  >
                    View Requests
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-indigo-100">
                <CardContent className="p-5 space-y-3">
                  <ClipboardList className="h-6 w-6 text-indigo-700" />
                  <h3 className="font-semibold">Tour Decisions</h3>
                  <p className="text-sm text-muted-foreground">
                    {pendingTourPrograms.length} pending decisions
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate("/tour-program/pending")}
                    className="w-full"
                  >
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
                      <p className="text-muted-foreground">Loading pending items...</p>
                    ) : totalPending === 0 ? (
                      <p className="text-muted-foreground">All caught up! No pending approvals.</p>
                    ) : (
                      <>
                        {pendingGrievances.slice(0, 3).map((g) => (
                          <div key={g.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Grievance – {g.grievanceType}</p>
                              <p className="text-muted-foreground">
                                {g.petitionerName} • {new Date(g.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/grievances/verify`)}>
                              Review
                            </Button>
                          </div>
                        ))}

                        {pendingTrainRequests.slice(0, 2).map((t) => (
                          <div key={t.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Train EQ – {t.passengerName}</p>
                              <p className="text-muted-foreground">
                                PNR: {t.pnrNumber} • {new Date(t.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/train-eq/queue`)}>
                              Review
                            </Button>
                          </div>
                        ))}

                        {pendingTourPrograms.slice(0, 2).map((tour) => (
                          <div key={tour.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Tour – {tour.eventName}</p>
                              <p className="text-muted-foreground">
                                {tour.organizer} • Decision Pending
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/tour-program/pending`)}>
                              Decide
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Birthday Widget for Admin */}
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
