import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  RefreshCw,
  MapPin,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { tourProgramApi, type TourProgram } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Super Admin — Events content.
 *
 * Read-only list of post-event reports (tour programs that have ended).
 * Lives only inside the SUPER_ADMIN home popup; SUPER_ADMIN does not have
 * access to the admin's `/admin/events` page.
 */
export function SuperAdminEventsContent() {
  const [events, setEvents] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TourProgram | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tourProgramApi.getEvents({ limit: "100" });
      setEvents(res.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const formatDateTime = (s?: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pager = usePagination(events, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">Events</h1>
          <p className="text-sm text-muted-foreground">Completed event reports (read-only)</p>
        </div>
        <Button variant="outline" onClick={fetchEvents} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          ❌ {error}
        </div>
      )}

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Events ({events.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading…</p>
          ) : events.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground">No events</p>
            </div>
          ) : (
            pager.pageItems.map((e) => {
              const isCompleted = Boolean(e.isCompleted);
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between p-4 rounded-xl border bg-white hover:shadow-md transition"
                >
                  <div className="flex gap-4 min-w-0">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${isCompleted ? "bg-emerald-100" : "bg-indigo-100"}`}>
                      <Calendar className={`h-5 w-5 ${isCompleted ? "text-emerald-700" : "text-indigo-700"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-indigo-900 truncate">{e.eventName}</p>
                        {isCompleted ? (
                          <Badge className="bg-emerald-100 text-emerald-800">Completed</Badge>
                        ) : (
                          <Badge className="bg-indigo-100 text-indigo-800">Upcoming</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(e.dateTime)}
                        <span>•</span>
                        <MapPin className="h-3.5 w-3.5" />
                        {e.venue || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Organizer: {e.organizer || "—"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(e);
                      setDetailsOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </div>
              );
            })
          )}
          <Pagination
            page={pager.page}
            totalPages={pager.totalPages}
            total={pager.total}
            rangeStart={pager.rangeStart}
            rangeEnd={pager.rangeEnd}
            onChange={pager.setPage}
          />
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Event Details
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Event Name" value={selected.eventName} />
                <Field label="Date & Time" value={formatDateTime(selected.dateTime)} />
                <Field label="Venue" value={selected.venue} />
                <Field label="Organizer" value={selected.organizer} />
                <Field label="Decision" value={selected.decision} />
                <Field label="Completed" value={selected.isCompleted ? "Yes" : "No"} />
              </div>
              {selected.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="mt-1 p-3 rounded bg-slate-50 text-sm whitespace-pre-wrap">
                    {selected.description}
                  </p>
                </div>
              )}
              {selected.outcomeSummary && (
                <div>
                  <p className="text-xs text-muted-foreground">Outcome summary</p>
                  <p className="mt-1 p-3 rounded bg-emerald-50 text-sm whitespace-pre-wrap">
                    {selected.outcomeSummary}
                  </p>
                </div>
              )}
              {selected.keynotes && (
                <div>
                  <p className="text-xs text-muted-foreground">Keynotes</p>
                  <p className="mt-1 p-3 rounded bg-slate-50 text-sm whitespace-pre-wrap">
                    {selected.keynotes}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null | number | boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm mt-0.5 break-words">{String(value ?? "—") || "—"}</p>
    </div>
  );
}
