import { FileText, CheckCircle, XCircle, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

const grievances = [
  {
    id: "GRV-001",
    name: "Rajesh Kumar",
    type: "Water Supply",
    ward: "Ward 12",
    amount: "₹25,000",
    status: "Pending Verification",
  },
  {
    id: "GRV-002",
    name: "Priya Sharma",
    type: "Road Repair",
    ward: "Central",
    amount: "₹1,50,000",
    status: "Pending Verification",
  },
];

export default function GrievanceVerification() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div>
            <h1 className="text-2xl font-semibold text-indigo-900">
              Verify Grievances
            </h1>
            <p className="text-sm text-muted-foreground">
              Review and approve submitted grievances
            </p>
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Pending Verification Queue</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {grievances.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-4 rounded-xl border bg-white"
                >
                  <div className="flex gap-4">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FileText className="h-5 w-5 text-indigo-700" />
                    </div>

                    <div>
                      <p className="font-medium">
                        {g.name}
                        <Badge className="ml-2" variant="outline">
                          {g.status}
                        </Badge>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {g.type} • {g.ward} • {g.amount}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Verify
                    </Button>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      <Printer className="h-4 w-4 mr-1" />
                      Letter
                    </Button>
                    <Button size="sm" variant="destructive">
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
