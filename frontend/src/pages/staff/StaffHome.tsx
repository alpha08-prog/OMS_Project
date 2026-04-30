import { useEffect, useState } from "react";
import {
  FileText,
  Train,
  Users,
  Calendar,
  Newspaper,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { grievanceApi, visitorApi, trainRequestApi, type Grievance, type Visitor, type TrainRequest } from "@/lib/api";

type RecentEntry = {
  type: string;
  title: string;
  date: string;
};

export default function StaffHome() {
  const navigate = useNavigate();
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [rejectedGrievances, setRejectedGrievances] = useState<Grievance[]>([]);
  const [rejectedExpanded, setRejectedExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Staff Member");

  useEffect(() => {
    // Get user name from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || "Staff Member");
      } catch {
        // ignore parse errors
      }
    }

    // Fetch recent entries
    const fetchRecentEntries = async () => {
      try {
        const entries: RecentEntry[] = [];
        
        // Fetch recent grievances
        const grievancesRes = await grievanceApi.getAll({ limit: '3' });
        grievancesRes.data.forEach((g: Grievance) => {
          entries.push({
            type: 'Grievance',
            title: `${g.grievanceType} - ${g.petitionerName}`,
            date: new Date(g.createdAt).toLocaleDateString(),
          });
        });

        // Fetch recent visitors
        const visitorsRes = await visitorApi.getAll({ limit: '3' });
        visitorsRes.data.forEach((v: Visitor) => {
          entries.push({
            type: 'Visitor',
            title: `${v.designation} - ${v.name}`,
            date: new Date(v.createdAt).toLocaleDateString(),
          });
        });

        // Fetch recent train requests
        const trainRes = await trainRequestApi.getAll({ limit: '3' });
        trainRes.data.forEach((t: TrainRequest) => {
          entries.push({
            type: 'Train EQ',
            title: `PNR ${t.pnrNumber}`,
            date: new Date(t.createdAt).toLocaleDateString(),
          });
        });

        // Sort by date and take top 5
        entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRecentEntries(entries.slice(0, 5));

        // Pull rejected grievances so the staff sees them on the dashboard.
        // Staff scope: the /grievances list endpoint already returns only the
        // current user's records when role is STAFF.
        try {
          const rejectedRes = await grievanceApi.getAll({ status: 'REJECTED', limit: '5' });
          setRejectedGrievances(rejectedRes.data ?? []);
        } catch (rejErr) {
          console.error('Failed to fetch rejected grievances:', rejErr);
          setRejectedGrievances([]);
        }
      } catch (error) {
        console.error('Failed to fetch recent entries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentEntries();
  }, []);

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
                  Data Entry Portal
                </p>
              </div>

              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                STAFF ACCESS
              </span>
            </div>

            {/* QUICK ENTRY ACTIONS */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Quick Entry
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

                  <Button
                    onClick={() => navigate("/grievances/new")}
                    className="h-24 flex flex-col gap-2 bg-amber-500 text-black hover:bg-amber-600"
                  >
                    <FileText className="h-6 w-6" />
                    <span className="text-sm font-medium">
                      New Grievance
                    </span>
                  </Button>

                  <Button
                    onClick={() => navigate("/train-eq/new")}
                    className="h-24 flex flex-col gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Train className="h-6 w-6" />
                    <span className="text-sm font-medium">
                      Train EQ
                    </span>
                  </Button>

                  <Button
                    onClick={() => navigate("/visitors/new")}
                    className="h-24 flex flex-col gap-2 bg-slate-700 text-white hover:bg-slate-800"
                  >
                    <Users className="h-6 w-6" />
                    <span className="text-sm font-medium">
                      Visitor Entry
                    </span>
                  </Button>

                  <Button
                    onClick={() => navigate("/tour-program/new")}
                    className="h-24 flex flex-col gap-2 bg-sky-600 text-white hover:bg-sky-700"
                  >
                    <Calendar className="h-6 w-6" />
                    <span className="text-sm font-medium">
                      Tour Program
                    </span>
                  </Button>

                  <Button
                    onClick={() => navigate("/news-intelligence/new")}
                    className="h-24 flex flex-col gap-2 bg-teal-600 text-white hover:bg-teal-700"
                  >
                    <Newspaper className="h-6 w-6" />
                    <span className="text-sm font-medium">
                      News Entry
                    </span>
                  </Button>

                </div>
              </CardContent>
            </Card>

            {/* TODAY'S TASKS */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Today's Work
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>• Enter grievances received today</p>
                <p>• Log walk-in visitors</p>
                <p>• Record tour invitations</p>
              </CardContent>
            </Card>

            {/* RECENT ENTRIES */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Recently Entered
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                {loading ? (
                  <p className="text-muted-foreground">Loading recent entries...</p>
                ) : recentEntries.length > 0 ? (
                  recentEntries.map((entry, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{entry.type} – {entry.title}</span>
                      <span className="text-muted-foreground">{entry.date}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No recent entries found. Start by creating a new entry above!</p>
                )}
              </CardContent>
            </Card>

            {/* REJECTED GRIEVANCES — only renders when the user has any.
                Collapsible so it stays out of the way once acknowledged. */}
            {!loading && rejectedGrievances.length > 0 && (
              <Card className="rounded-2xl shadow-sm border border-red-200 bg-red-50/40">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <button
                    type="button"
                    onClick={() => setRejectedExpanded((v) => !v)}
                    aria-expanded={rejectedExpanded}
                    aria-label={rejectedExpanded ? 'Collapse rejected grievances' : 'Expand rejected grievances'}
                    className="flex items-center gap-2 text-left flex-1 min-w-0 hover:opacity-80 transition"
                  >
                    {rejectedExpanded ? (
                      <ChevronDown className="h-4 w-4 text-red-700 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-red-700 shrink-0" />
                    )}
                    <CardTitle className="text-lg flex items-center gap-2 text-red-900">
                      <XCircle className="h-5 w-5 text-red-600" />
                      Rejected Grievances
                      <span className="text-sm font-normal text-red-700">
                        ({rejectedGrievances.length})
                      </span>
                    </CardTitle>
                  </button>
                  <Button
                    variant="link"
                    className="text-red-700"
                    onClick={() => navigate('/grievances/view?status=REJECTED')}
                  >
                    View all
                  </Button>
                </CardHeader>
                {rejectedExpanded && (
                  <CardContent className="space-y-2">
                    {rejectedGrievances.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg bg-white border border-red-100 hover:border-red-300 cursor-pointer transition"
                        onClick={() => navigate(`/grievances/view?search=${encodeURIComponent(g.petitionerName)}`)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-red-900 truncate">
                            {g.petitionerName} <span className="text-red-700/70">— {g.grievanceType}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Submitted {new Date(g.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          Rejected
                        </span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">
                      Check the bell <span aria-hidden>🔔</span> in the top bar for the rejection reason.
                    </p>
                  </CardContent>
                )}
              </Card>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
