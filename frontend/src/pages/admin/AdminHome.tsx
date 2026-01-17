import { FileCheck, Printer, Train, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function AdminHome() {
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
                  Admin Dashboard
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
                    Review and approve grievances
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
                    Review & issue emergency quota letters
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
                  <h3 className="font-semibold">Assign Tasks</h3>
                  <p className="text-sm text-muted-foreground">
                    Forward work to departments
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate("/tasks")}
                    className="w-full"
                  >
                    Task Board
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* PENDING APPROVALS */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-lg">Pending Approvals</CardTitle>
                <Badge variant="destructive">5 Pending</Badge>
              </CardHeader>

              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Grievance – Road Repair</p>
                    <p className="text-muted-foreground">
                      Submitted by Staff • Today
                    </p>
                  </div>
                  <Button size="sm" variant="outline">
                    Review
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      Tour Invitation – School Event
                    </p>
                    <p className="text-muted-foreground">Decision Pending</p>
                  </div>
                  <Button size="sm" variant="outline">
                    Decide
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* RECENT ACTIVITY */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">Recently Processed</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Train EQ Letter Generated</span>
                  <span className="text-muted-foreground">Today</span>
                </div>

                <div className="flex justify-between">
                  <span>Grievance Approved – Water Supply</span>
                  <span className="text-muted-foreground">Yesterday</span>
                </div>

                <div className="flex justify-between">
                  <span>Letter Printed – PWD</span>
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
