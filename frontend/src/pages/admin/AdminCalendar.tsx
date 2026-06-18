import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import jsPDF from "jspdf";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { API_URL, googleCalendarApi, meetingApi, type CalendarEvent, type MeetingStatus } from "@/lib/api";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { CalendarCheck, CalendarX, Loader2, MapPin, User, Plus, RefreshCw, Clock, Download, FileText, CalendarClock, CheckCircle2, Trash2 } from "lucide-react";

// ─── date-fns localizer ───────────────────────────────────────────────────────
const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ─── event colour coding ──────────────────────────────────────────────────────
const EVENT_COLORS: Record<string, { backgroundColor: string; color: string; borderColor: string }> = {
  TOUR:    { backgroundColor: "#f59e0b", color: "#1e1b4b", borderColor: "#d97706" },
  CUSTOM:  { backgroundColor: "#6366f1", color: "#ffffff", borderColor: "#4f46e5" },
  MEETING: { backgroundColor: "#0ea5e9", color: "#ffffff", borderColor: "#0284c7" },
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
  doc.text(
    event.type === "TOUR"
      ? "Tour Program"
      : event.type === "MEETING"
      ? "Meeting"
      : "Custom Event",
    margin,
    y
  );
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

  if (event.type === "MEETING" && event.location) {
    writeField("Location", event.location);
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
                event.type === "TOUR"
                  ? "border-amber-400 text-amber-700"
                  : event.type === "MEETING"
                  ? "border-sky-400 text-sky-700"
                  : "border-indigo-400 text-indigo-700"
              }>
                {event.type === "TOUR" ? "Tour Program" : event.type === "MEETING" ? "Meeting" : "Custom Event"}
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

              {event.type === "MEETING" && event.location && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{event.location}</span>
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

  // Schedule-meeting dialog (created straight from the calendar)
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sched, setSched] = useState({
    title: "",
    date: "",
    time: "10:00",
    location: "",
    attendees: "",
    agenda: "",
  });
  const [scheduling, setScheduling] = useState(false);

  // Meeting note-app side sheet (opened by clicking a meeting on the calendar)
  const [meetingSheetOpen, setMeetingSheetOpen] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [mForm, setMForm] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    attendees: "",
    agenda: "",
    status: "SCHEDULED" as MeetingStatus,
    summary: "",
  });

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

  // ── Meetings: create / open / save / delete straight from the calendar ──────

  const pad = (n: number) => String(n).padStart(2, "0");

  // Open the schedule dialog prefilled with a date/time (slot click or button).
  const openScheduleDialog = (when?: Date) => {
    const d = when ?? new Date();
    const midnight = d.getHours() === 0 && d.getMinutes() === 0;
    setSched({
      title: "",
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: midnight ? "10:00" : `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      location: "",
      attendees: "",
      agenda: "",
    });
    setScheduleOpen(true);
  };

  // Clicking an empty slot on the calendar schedules a meeting there.
  const handleSelectSlot = (slot: { start: Date }) => openScheduleDialog(slot.start);

  const handleScheduleMeeting = async () => {
    if (!sched.title.trim() || !sched.date) {
      alert("Please enter a title and date.");
      return;
    }
    setScheduling(true);
    try {
      await meetingApi.create({
        title: sched.title.trim(),
        dateTime: `${sched.date}T${sched.time || "10:00"}:00`,
        location: sched.location.trim() || undefined,
        attendees: sched.attendees.trim() || undefined,
        agenda: sched.agenda.trim() || undefined,
      });
      setScheduleOpen(false);
      loadEvents();
    } catch {
      alert("Failed to schedule meeting.");
    } finally {
      setScheduling(false);
    }
  };

  // Route a calendar click: meetings open the editable note sheet; everything
  // else keeps the existing read-only detail dialog.
  const handleSelectEvent = (e: CalendarEvent) => {
    if (e.type === "MEETING") {
      openMeetingSheet(String(e.id).replace(/^meeting-/, ""));
    } else {
      setSelectedEvent(e);
    }
  };

  const openMeetingSheet = async (rowId: string) => {
    setMeetingId(rowId);
    setMeetingSheetOpen(true);
    setMeetingLoading(true);
    try {
      const m = await meetingApi.getById(rowId);
      const [datePart, timePart] = String(m.dateTime ?? "").replace(" ", "T").split("T");
      setMForm({
        title: m.title ?? "",
        date: datePart ?? "",
        time: (timePart ?? "").slice(0, 5),
        location: m.location ?? "",
        attendees: m.attendees ?? "",
        agenda: m.agenda ?? "",
        status: m.status,
        summary: m.summary ?? "",
      });
    } catch {
      alert("Failed to load meeting.");
      setMeetingSheetOpen(false);
    } finally {
      setMeetingLoading(false);
    }
  };

  const handleSaveMeeting = async () => {
    if (!meetingId) return;
    if (!mForm.title.trim() || !mForm.date) {
      alert("Title and date are required.");
      return;
    }
    setMeetingSaving(true);
    try {
      await meetingApi.update(meetingId, {
        title: mForm.title.trim(),
        dateTime: `${mForm.date}T${mForm.time || "10:00"}:00`,
        location: mForm.location.trim() || null,
        attendees: mForm.attendees.trim() || null,
        agenda: mForm.agenda.trim() || null,
        status: mForm.status,
        summary: mForm.summary.trim() || null,
      });
      setMeetingSheetOpen(false);
      loadEvents();
    } catch {
      alert("Failed to save meeting.");
    } finally {
      setMeetingSaving(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!meetingId) return;
    setMeetingSaving(true);
    try {
      await meetingApi.update(meetingId, { status: "COMPLETED" });
      setMForm((f) => ({ ...f, status: "COMPLETED" }));
      loadEvents();
    } catch {
      alert("Failed to update meeting.");
    } finally {
      setMeetingSaving(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!meetingId) return;
    if (!window.confirm("Delete this meeting? This cannot be undone.")) return;
    setMeetingSaving(true);
    try {
      await meetingApi.remove(meetingId);
      setMeetingSheetOpen(false);
      loadEvents();
    } catch {
      alert("Failed to delete meeting.");
    } finally {
      setMeetingSaving(false);
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
            <p className="text-sm text-gray-500">Meetings, accepted tour programs &amp; custom events — click any empty slot to schedule a meeting</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Schedule Meeting button */}
            <Button size="sm" onClick={() => openScheduleDialog()} className="bg-sky-600 hover:bg-sky-700 text-white">
              <CalendarClock className="h-3.5 w-3.5 mr-1.5" /> Schedule Meeting
            </Button>

            {/* Add Event button */}
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
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
            <span className="inline-block w-3 h-3 rounded-sm bg-sky-500" /> Meetings
          </span>
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
            tooltipAccessor={(e: CalendarEvent) =>
              e.type === "MEETING"
                ? `${e.title}${e.description ? " — " + e.description : ""} (click to add notes)`
                : e.title
            }
            selectable
            onSelectSlot={handleSelectSlot}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={handleSelectEvent}
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

      {/* Schedule Meeting Dialog (from a calendar slot or the header button) */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={sched.title} onChange={(e) => setSched({ ...sched, title: e.target.value })} placeholder="e.g. Review with department heads" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={sched.date} onChange={(e) => setSched({ ...sched, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={sched.time} onChange={(e) => setSched({ ...sched, time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={sched.location} onChange={(e) => setSched({ ...sched, location: e.target.value })} placeholder="e.g. Conference room" />
            </div>
            <div className="space-y-2">
              <Label>Attendees</Label>
              <Input value={sched.attendees} onChange={(e) => setSched({ ...sched, attendees: e.target.value })} placeholder="Comma-separated names" />
            </div>
            <div className="space-y-2">
              <Label>Agenda</Label>
              <Textarea value={sched.agenda} onChange={(e) => setSched({ ...sched, agenda: e.target.value })} rows={2} placeholder="Purpose / agenda" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
              <Button onClick={handleScheduleMeeting} disabled={scheduling} className="bg-sky-600 hover:bg-sky-700 text-white">
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CalendarClock className="h-4 w-4 mr-1" />}
                Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Meeting note-app side sheet — click a meeting on the calendar */}
      <Sheet open={meetingSheetOpen} onOpenChange={setMeetingSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-sky-600" /> Meeting
            </SheetTitle>
            <SheetDescription>Edit the details and write the summary / remarks.</SheetDescription>
          </SheetHeader>

          {meetingLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex-1 space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={mForm.title} onChange={(e) => setMForm({ ...mForm, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={mForm.date} onChange={(e) => setMForm({ ...mForm, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Time</Label>
                  <Input type="time" value={mForm.time} onChange={(e) => setMForm({ ...mForm, time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={mForm.location} onChange={(e) => setMForm({ ...mForm, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Attendees</Label>
                <Input value={mForm.attendees} onChange={(e) => setMForm({ ...mForm, attendees: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Agenda</Label>
                <Textarea value={mForm.agenda} onChange={(e) => setMForm({ ...mForm, agenda: e.target.value })} rows={2} />
              </div>

              {/* The "note app" — summary / remarks */}
              <div className="space-y-1.5">
                <Label className="text-sky-800 font-semibold flex items-center gap-1.5">
                  <FileText className="h-4 w-4" /> Notes / Summary
                </Label>
                <Textarea
                  value={mForm.summary}
                  onChange={(e) => setMForm({ ...mForm, summary: e.target.value })}
                  rows={8}
                  placeholder="Write what was discussed / decided…"
                  className="resize-y"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Label className="shrink-0">Status</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={mForm.status}
                  onChange={(e) => setMForm({ ...mForm, status: e.target.value as MeetingStatus })}
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                {mForm.status !== "COMPLETED" && (
                  <Button size="sm" variant="outline" onClick={handleMarkComplete} disabled={meetingSaving} className="text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark complete
                  </Button>
                )}
              </div>
            </div>
          )}

          <SheetFooter className="flex-row items-center justify-between gap-2 sm:justify-between border-t pt-4">
            <Button variant="outline" onClick={handleDeleteMeeting} disabled={meetingSaving || meetingLoading} className="text-rose-700 border-rose-200 hover:bg-rose-50">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMeetingSheetOpen(false)} disabled={meetingSaving}>Close</Button>
              <Button onClick={handleSaveMeeting} disabled={meetingSaving || meetingLoading} className="bg-sky-600 hover:bg-sky-700 text-white">
                {meetingSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
