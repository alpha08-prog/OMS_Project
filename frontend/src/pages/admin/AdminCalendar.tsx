import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import jsPDF from "jspdf";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { API_URL, googleCalendarApi, type CalendarEvent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarCheck, CalendarX, Loader2, MapPin, User, Plus, RefreshCw, Clock, Download, FileText } from "lucide-react";

// ─── date-fns localizer ───────────────────────────────────────────────────────
const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ─── event colour coding ──────────────────────────────────────────────────────
const EVENT_COLORS: Record<string, { backgroundColor: string; color: string; borderColor: string }> = {
  TOUR:   { backgroundColor: "#f59e0b", color: "#1e1b4b", borderColor: "#d97706" },
  CUSTOM: { backgroundColor: "#6366f1", color: "#ffffff", borderColor: "#4f46e5" },
};

function eventStyleGetter(event: CalendarEvent) {
  const style = EVENT_COLORS[event.type] || EVENT_COLORS.CUSTOM;
  return { style: { ...style, borderRadius: "6px", border: `1px solid ${style.borderColor}`, padding: "2px 6px" } };
}

// ─── PDF generator ───────────────────────────────────────────────────────────
function downloadEventPdf(event: CalendarEvent) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header bar
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 72, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Event Details", margin, 46);
  y = 110;

  // Title
  doc.setTextColor(30, 27, 75); // indigo-950
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(event.title || "Untitled Event", contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 20 + 8;

  // Type badge text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(99, 102, 241); // indigo-500
  doc.text(event.type === "TOUR" ? "Tour Program" : "Custom Event", margin, y);
  y += 24;

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  // Field renderer
  const writeField = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(label.toUpperCase(), margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42); // slate-900
    const lines = doc.splitTextToSize(value, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 16 + 14;
  };

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  writeField("Start", format(startDate, "EEEE, dd MMM yyyy 'at' hh:mm a"));
  writeField("End", format(endDate, "EEEE, dd MMM yyyy 'at' hh:mm a"));

  if (event.type === "TOUR") {
    if (event.organizer) writeField("Organizer", event.organizer);
    if (event.venue) writeField("Venue", event.venue);
  }

  if (event.description) writeField("Description", event.description);

  writeField(
    "Google Calendar",
    event.googleSynced ? "Synced" : "Not synced"
  );

  // Footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated on ${format(new Date(), "dd MMM yyyy, hh:mm a")}`,
    margin,
    doc.internal.pageSize.getHeight() - 32
  );

  const safeTitle = (event.title || "event").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`${safeTitle}_${format(startDate, "yyyy-MM-dd")}.pdf`);
}

// ─── selected-event detail dialog ────────────────────────────────────────────
function EventDetailDialog({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  return (
    <Dialog open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="text-indigo-900 leading-snug pr-6">{event.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <Badge variant="outline" className={
                event.type === "TOUR" ? "border-amber-400 text-amber-700" : "border-indigo-400 text-indigo-700"
              }>
                {event.type === "TOUR" ? "Tour Program" : "Custom Event"}
              </Badge>

              <div className="flex items-start gap-2 text-sm text-gray-700">
                <Clock className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                <div>
                  <div>{format(new Date(event.start), "EEE, dd MMM yyyy, hh:mm a")}</div>
                  <div className="text-xs text-gray-500">
                    Ends {format(new Date(event.end), "hh:mm a")}
                  </div>
                </div>
              </div>

              {event.type === "TOUR" && event.organizer && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <User className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{event.organizer}</span>
                </div>
              )}

              {event.type === "TOUR" && event.venue && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{event.venue}</span>
                </div>
              )}

              {event.description && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <FileText className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </div>
              )}

              {event.googleSynced && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5" /> Synced to Google Calendar
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button
                onClick={() => downloadEventPdf(event)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Download className="h-4 w-4 mr-1.5" /> Download PDF
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function AdminCalendar() {
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<(typeof Views)[keyof typeof Views]>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [connectError, setConnectError] = useState("");

  // Add event dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newDescription, setNewDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Show success / error banners from OAuth redirect query params
  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      setConnected(true);
    }
    if (searchParams.get("error")) {
      setConnectError("Google Calendar connection failed. Please try again.");
    }
  }, [searchParams]);

  // Load calendar status
  useEffect(() => {
    googleCalendarApi.getStatus()
      .then((data) => setConnected(data.connected))
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  // Load events
  const loadEvents = useCallback(() => {
    setLoading(true);
    googleCalendarApi.getEvents()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Connect / disconnect handlers
  const handleConnect = () => {
    const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
    if (!token) return;
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_session", "true");
    const role = sessionStorage.getItem("user_role") || localStorage.getItem("user_role");
    if (role) localStorage.setItem("user_role", role);
    const user = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (user) localStorage.setItem("user", user);
    window.location.href = `${API_URL}/google/connect?token=${token}`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Calendar? Future tour acceptances won't be synced.")) return;
    await googleCalendarApi.disconnect();
    setConnected(false);
  };

  // Sync all unsynced tours to Google Calendar
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const result = await googleCalendarApi.syncAll();
      alert(`Synced ${result.synced} of ${result.total} events to Google Calendar.`);
      loadEvents();
    } catch {
      alert("Failed to sync events.");
    } finally {
      setSyncing(false);
    }
  };

  // Add custom event
  const handleAddEvent = async () => {
    if (!newTitle.trim() || !newDate) {
      alert("Please enter a title and date.");
      return;
    }

    // Check for scheduling conflicts
    const newStart = new Date(`${newDate}T${newTime}:00`);
    const conflicts = events.filter((ev) => {
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      return newStart >= evStart && newStart < evEnd;
    });
    if (conflicts.length > 0) {
      const names = conflicts.map((e) => e.title).join(", ");
      const proceed = window.confirm(`⚠️ Schedule conflict with: "${names}". Add this event anyway?`);
      if (!proceed) return;
    }

    setAdding(true);
    try {
      await googleCalendarApi.addCustomEvent({
        title: newTitle.trim(),
        startDateTime: `${newDate}T${newTime}:00`,
        description: newDescription.trim() || undefined,
      });
      setAddDialogOpen(false);
      setNewTitle("");
      setNewDate("");
      setNewTime("10:00");
      setNewDescription("");
      loadEvents();
    } catch {
      alert("Failed to add event.");
    } finally {
      setAdding(false);
    }
  };

  // ── Normalize events: parse strings → Date, clamp end to same day, ensure minimum 1-hour duration
  const calendarEvents = useMemo(() =>
    events.map((ev) => {
      const start = new Date(ev.start);
      const rawEnd = new Date(ev.end);

      // Clamp end so the event never spills into the next day's cell
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      const clamped = rawEnd > dayEnd ? dayEnd : rawEnd;

      // Guarantee at least 1-hour visible block (capped at dayEnd)
      const minEnd = new Date(start.getTime() + 60 * 60 * 1000);
      const end = clamped <= start ? (minEnd > dayEnd ? dayEnd : minEnd) : clamped;

      return { ...ev, start, end };
    }),
    [events]
  );

  // Auto-scroll to the earliest event's hour (or 8 AM when no events)
  const scrollToTime = useMemo(() => {
    if (calendarEvents.length > 0) {
      const earliest = calendarEvents.reduce<Date>(
        (min, ev) => (ev.start < min ? ev.start : min),
        calendarEvents[0].start as Date
      );
      const t = new Date(earliest);
      t.setHours(Math.max(0, t.getHours() - 1), 0, 0, 0);
      return t;
    }
    const t = new Date();
    t.setHours(8, 0, 0, 0);
    return t;
  }, [calendarEvents]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <div className="flex-1 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-indigo-900">Calendar</h1>
            <p className="text-sm text-gray-500">Accepted tour programs & your custom events</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Add Event button */}
            <Button size="sm" onClick={() => setAddDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Event
            </Button>

            {/* Google Calendar connect / status */}
            {statusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            ) : connected ? (
              <>
                <Badge className="bg-green-100 text-green-700 border border-green-300 flex items-center gap-1 px-3 py-1">
                  <CalendarCheck className="h-3.5 w-3.5" /> Google Calendar Connected
                </Badge>
                <Button size="sm" variant="outline" onClick={handleSyncAll} disabled={syncing} className="border-green-200 text-green-700 hover:bg-green-50">
                  {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  Sync All
                </Button>
                <Button size="sm" variant="outline" onClick={handleDisconnect} className="text-red-500 border-red-200 hover:bg-red-50">
                  <CalendarX className="h-3.5 w-3.5 mr-1" /> Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={handleConnect}>
                <CalendarCheck className="h-3.5 w-3.5 mr-1.5" /> Connect Google Calendar
              </Button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {connectError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {connectError}
          </div>
        )}

        {/* Info banner when not connected */}
        {!statusLoading && !connected && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            Connect your Google Calendar to automatically sync accepted tour programs to your personal Google Calendar.
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" /> Tour Programs
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" /> Custom Events
          </span>
        </div>

        {/* Calendar */}
        <div className="relative bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: 620 }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : null}

          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(e: CalendarEvent) => setSelectedEvent(e)}
            scrollToTime={scrollToTime}
            style={{ height: "100%", padding: "12px" }}
            popup
          />

        </div>

        {/* Event detail dialog */}
        <EventDetailDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      </div>

      {/* Add Event Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Meeting with CM Office" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Notes about this event..." rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddEvent} disabled={adding} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Add Event
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
