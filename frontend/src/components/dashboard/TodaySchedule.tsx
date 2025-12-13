import { Clock, MapPin, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

const scheduleItems = [
  {
    time: "09:00 AM",
    event: "Ward Office Inauguration",
    venue: "Ward 12 Community Hall",
    organizer: "Local MLA Office",
    status: "upcoming",
  },
  {
    time: "11:30 AM",
    event: "Public Grievance Session",
    venue: "Main Office",
    organizer: "Public Relations",
    status: "upcoming",
  },
  {
    time: "02:00 PM",
    event: "CSR Fund Allocation Meeting",
    venue: "Conference Room A",
    organizer: "Finance Team",
    status: "confirmed",
  },
  {
    time: "04:30 PM",
    event: "School Annual Day",
    venue: "Government School, Sector 5",
    organizer: "Education Dept",
    status: "pending",
  },
];

const statusColors = {
  upcoming: "bg-primary/10 text-primary border-primary/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
};

export function TodaySchedule() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Today's Tour Program</CardTitle>
          <Badge variant="secondary">{scheduleItems.length} Events</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {scheduleItems.map((item, index) => (
          <div
            key={index}
            className="flex gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-primary" />
              {index < scheduleItems.length - 1 && (
                <div className="w-0.5 h-full bg-border mt-1" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-foreground">{item.event}</h4>
                <Badge className={statusColors[item.status as keyof typeof statusColors]} variant="outline">
                  {item.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {item.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {item.venue}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {item.organizer}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
