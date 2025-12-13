import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ArrowRight, FileText } from "lucide-react";

const grievances = [
  {
    id: "GRV-2024-001",
    petitioner: "Rajesh Kumar",
    type: "Water Supply",
    ward: "Ward 12",
    status: "Open",
    value: "₹25,000",
    date: "Today, 9:30 AM",
  },
  {
    id: "GRV-2024-002",
    petitioner: "Priya Sharma",
    type: "Road Repair",
    ward: "Central",
    status: "In Progress",
    value: "₹1,50,000",
    date: "Today, 8:15 AM",
  },
  {
    id: "GRV-2024-003",
    petitioner: "Mohammed Ali",
    type: "Health",
    ward: "West",
    status: "Resolved",
    value: "₹50,000",
    date: "Yesterday",
  },
  {
    id: "GRV-2024-004",
    petitioner: "Sunita Devi",
    type: "Financial Aid",
    ward: "Village X",
    status: "Open",
    value: "₹75,000",
    date: "Yesterday",
  },
];

const statusStyles = {
  Open: "bg-destructive/10 text-destructive border-destructive/20",
  "In Progress": "bg-warning/10 text-warning border-warning/20",
  Resolved: "bg-success/10 text-success border-success/20",
};

export function RecentGrievances() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Grievances</CardTitle>
          <Button variant="ghost" size="sm" className="text-primary gap-1">
            View All <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {grievances.map((grievance) => (
            <div
              key={grievance.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
            >
              <div className="p-2.5 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground truncate">
                    {grievance.petitioner}
                  </span>
                  <Badge className={statusStyles[grievance.status as keyof typeof statusStyles]} variant="outline">
                    {grievance.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{grievance.type}</span>
                  <span>•</span>
                  <span>{grievance.ward}</span>
                  <span>•</span>
                  <span className="font-medium text-foreground">{grievance.value}</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {grievance.date}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
