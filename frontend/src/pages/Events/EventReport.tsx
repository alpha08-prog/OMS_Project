import { useEffect, useState } from "react";
import { Calendar, CheckCircle, Clock, RefreshCw, MapPin, User, FileText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { tourProgramApi, type TourProgram } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function EventReport() {
  const [events, setEvents] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TourProgram | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [driveLink, setDriveLink] = useState("");
  const [mediaLink, setMediaLink] = useState("");
  const [keynotes, setKeynotes] = useState("");
  const [attendeesCount, setAttendeesCount] = useState("");
  const [outcomeSummary, setOutcomeSummary] = useState("");

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tourProgramApi.getEvents({ limit: "500" });
      setEvents(res.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const pendingEvents = events.filter(e => !e.isCompleted);
  const completedEvents = events.filter(e => e.isCompleted);

  const handleOpenReport = (event: TourProgram) => {
    setSelectedEvent(event);
    setDriveLink(event.driveLink ?? "");
    setMediaLink(event.mediaLink ?? "");
    setKeynotes(event.keynotes ?? "");
    setAttendeesCount(event.attendeesCount?.toString() ?? "");
    setOutcomeSummary(event.outcomeSummary ?? "");
    setReportDialogOpen(true);
  };

  const resetForm = () => {
    setDriveLink("");
    setMediaLink("");
    setKeynotes("");
    setAttendeesCount("");
    setOutcomeSummary("");
    setSelectedEvent(null);
  };

  const handleSubmitReport = async () => {
    if (!selectedEvent) return;
    setSubmitting(true);
    try {
      await tourProgramApi.submitEventReport(selectedEvent.id, {
        driveLink: driveLink.trim() || undefined,
        mediaLink: mediaLink.trim() || undefined,
        keynotes: keynotes.trim() || undefined,
        attendeesCount: attendeesCount ? parseInt(attendeesCount) : undefined,
        outcomeSummary: outcomeSummary.trim() || undefined,
      });
      setReportDialogOpen(false);
      resetForm();
      await fetchEvents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">Event Reports</h1>
              <p className="text-sm text-muted-foreground">Submit post-event reports for completed tour programs</p>
            </div>
            <Button variant="outline" onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{error}</div>
          )}

          {/* Pending Reports */}
          <Card className="rounded-2xl shadow-sm border-amber-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <Clock className="h-5 w-5" />
                Pending Reports ({pendingEvents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading events...</p>
              ) : pendingEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                  <p className="text-muted-foreground">All events have reports submitted!</p>
                </div>
              ) : (
                pendingEvents.map((event) => {
                  const { date, time } = formatDateTime(event.dateTime || event.eventDate || "");
                  return (
                    <div key={event.id} className="flex items-center justify-between p-4 rounded-xl border bg-amber-50 border-amber-200">
                      <div className="flex gap-4">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <Calendar className="h-5 w-5 text-amber-700" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-indigo-900">{event.eventName}</p>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{event.organizer}</span>
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{date} at {time}</span>
                            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.venue}</span>
                          </div>
                        </div>
                      </div>
                      <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => handleOpenReport(event)}>
                        <FileText className="h-4 w-4 mr-1" />
                        Submit Report
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Completed Reports */}
          {completedEvents.length > 0 && (
            <Card className="rounded-2xl shadow-sm border-green-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  Submitted Reports ({completedEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {completedEvents.map((event) => {
                  const { date, time } = formatDateTime(event.dateTime || event.eventDate || "");
                  return (
                    <div key={event.id} className="flex items-center justify-between p-4 rounded-xl border bg-green-50 border-green-200">
                      <div className="flex gap-4">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <CheckCircle className="h-5 w-5 text-green-700" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-indigo-900">{event.eventName}</p>
                            <Badge className="bg-green-100 text-green-800">Report Submitted</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{event.organizer}</span>
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{date} at {time}</span>
                            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.venue}</span>
                            {event.attendeesCount && (
                              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{event.attendeesCount} attendees</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleOpenReport(event)}>
                        Edit Report
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Report Dialog */}
        <Dialog open={reportDialogOpen} onOpenChange={(open) => { setReportDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Post-Event Report
              </DialogTitle>
              <DialogDescription>
                {selectedEvent?.eventName} — {selectedEvent && formatDateTime(selectedEvent.dateTime || selectedEvent.eventDate || "").date}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Drive Link (Documents / Files)</Label>
                <Input
                  className="mt-1"
                  placeholder="https://drive.google.com/..."
                  value={driveLink}
                  onChange={(e) => setDriveLink(e.target.value)}
                />
              </div>
              <div>
                <Label>Media / Photos Link</Label>
                <Input
                  className="mt-1"
                  placeholder="https://photos.google.com/... or Drive link"
                  value={mediaLink}
                  onChange={(e) => setMediaLink(e.target.value)}
                />
              </div>
              <div>
                <Label>Number of Attendees</Label>
                <Input
                  className="mt-1"
                  type="number"
                  placeholder="e.g. 150"
                  value={attendeesCount}
                  onChange={(e) => setAttendeesCount(e.target.value)}
                />
              </div>
              <div>
                <Label>Keynotes / Highlights</Label>
                <Textarea
                  className="mt-1"
                  placeholder="Key points discussed, decisions made, important highlights..."
                  rows={3}
                  value={keynotes}
                  onChange={(e) => setKeynotes(e.target.value)}
                />
              </div>
              <div>
                <Label>Outcome Summary</Label>
                <Textarea
                  className="mt-1"
                  placeholder="Overall outcome and result of the event..."
                  rows={3}
                  value={outcomeSummary}
                  onChange={(e) => setOutcomeSummary(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" className="flex-1" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmitReport}
                  disabled={submitting}
                >
                  {submitting ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Submitting...</> : <><CheckCircle className="h-4 w-4 mr-2" />Submit Report</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
