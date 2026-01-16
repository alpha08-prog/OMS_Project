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
    venue: "Govt School, Sector 5",
    organizer: "Education Dept",
    status: "pending",
  },
];

const statusStyles = {
  upcoming: "bg-indigo-100 text-indigo-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
};

export function TodaySchedule() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-indigo-900">
          Today's Tour Program
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {scheduleItems.map((item, idx) => (
          <div
            key={idx}
            className="flex gap-4 p-4 bg-white border rounded-2xl hover:shadow-md transition"
          >
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-indigo-600 ring-4 ring-indigo-100" />
              {idx < scheduleItems.length - 1 && (
                <div className="w-0.5 flex-1 bg-border mt-1" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex justify-between">
                <h4 className="font-semibold">{item.event}</h4>
                <Badge className={statusStyles[item.status as keyof typeof statusStyles]}>
                  {item.status}
                </Badge>
              </div>

              <div className="mt-2 text-sm text-muted-foreground flex flex-wrap gap-4">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> {item.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {item.venue}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" /> {item.organizer}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
