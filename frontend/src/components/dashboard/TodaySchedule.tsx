import { useEffect, useState } from "react";
import { Clock, MapPin, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { tourProgramApi, type TourProgram } from "../../lib/api";

const statusStyles: Record<string, string> = {
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REGRET: "bg-gray-100 text-gray-700",
};

export function TodaySchedule() {
  const [scheduleItems, setScheduleItems] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        // Get upcoming tour programs
        const data = await tourProgramApi.getUpcoming();
        setScheduleItems(data.slice(0, 5));
      } catch (error) {
        console.error('Failed to fetch schedule:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, []);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-indigo-900">
          Today's Tour Program
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-muted-foreground text-center py-4">Loading...</p>
        ) : scheduleItems.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No scheduled events</p>
        ) : (
          scheduleItems.map((item, idx) => (
            <div
              key={item.id}
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
                  <h4 className="font-semibold">{item.eventName}</h4>
                  <Badge className={statusStyles[item.decision] || "bg-gray-100"}>
                    {item.decision}
                  </Badge>
                </div>

                <div className="mt-2 text-sm text-muted-foreground flex flex-wrap gap-4">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {formatTime(item.eventDate)}
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
