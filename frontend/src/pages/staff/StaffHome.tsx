import {
  FileText,
  Train,
  Users,
  Calendar,
  Newspaper,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function StaffHome() {
  const navigate = useNavigate();

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
                  Welcome, Staff Member
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
                  Today’s Work
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
                <div className="flex justify-between">
                  <span>Grievance – Water Supply</span>
                  <span className="text-muted-foreground">Today</span>
                </div>

                <div className="flex justify-between">
                  <span>Visitor – Party Worker</span>
                  <span className="text-muted-foreground">Today</span>
                </div>

                <div className="flex justify-between">
                  <span>Train EQ – PNR Entry</span>
                  <span className="text-muted-foreground">Yesterday</span>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
