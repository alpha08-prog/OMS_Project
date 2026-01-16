import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ArrowRight, FileText } from "lucide-react";

const grievances = [
  {
    id: "GRV-001",
    petitioner: "Rajesh Kumar",
    type: "Water Supply",
    ward: "Ward 12",
    status: "Open",
    value: "₹25,000",
    date: "Today",
  },
  {
    id: "GRV-002",
    petitioner: "Priya Sharma",
    type: "Road Repair",
    ward: "Central",
    status: "In Progress",
    value: "₹1,50,000",
    date: "Today",
  },
];

const statusStyles = {
  Open: "bg-red-100 text-red-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-emerald-100 text-emerald-700",
};

export function RecentGrievances() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row justify-between items-center">
        <CardTitle className="text-lg font-semibold text-indigo-900">
          Recent Grievances
        </CardTitle>
        <Button variant="ghost" size="sm">
          View All <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {grievances.map((g) => (
          <div
            key={g.id}
            className="flex gap-4 p-4 bg-white border rounded-2xl hover:shadow-md transition"
          >
            <div className="p-3 bg-indigo-100 rounded-xl">
              <FileText className="h-5 w-5 text-indigo-600" />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{g.petitioner}</span>
                <Badge className={statusStyles[g.status as keyof typeof statusStyles]}>
                  {g.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {g.type} • {g.ward} • <span className="font-medium">{g.value}</span>
              </p>
            </div>

            <span className="text-xs text-muted-foreground">{g.date}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
