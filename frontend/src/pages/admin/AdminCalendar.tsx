import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { googleCalendarApi, type CalendarEvent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarCheck, CalendarX, Loader2, MapPin, User, Plus, RefreshCw } from "lucide-react";

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

// ─── selected-event tooltip card ─────────────────────────────────────────────
function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <Card className="absolute z-50 w-72 shadow-2xl border border-indigo-200 bg-white top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-indigo-900 leading-snug">{event.title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <Badge variant="outline" className={
          event.type === "TOUR" ? "border-amber-400 text-amber-700" : "border-indigo-400 text-indigo-700"
        }>
          {event.type === "TOUR" ? "Tour Program" : "Custom Event"}
        </Badge>

        {event.type === "TOUR" && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="h-3.5 w-3.5" /> {event.organizer}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-3.5 w-3.5" /> {event.venue}
            </div>
          </>
        )}

        {event.type === "CUSTOM" && event.description && (
          <p className="text-sm text-gray-600">{event.description}</p>
        )}

        <p className="text-xs text-gray-400 pt-1">
          {format(new Date(event.start), "dd MMM yyyy, hh:mm a")}
        </p>

        {event.googleSynced && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CalendarCheck className="h-3 w-3" /> Synced to Google Calendar
          </p>
        )}
      </CardContent>
    </Card>
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
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    window.location.href = `${apiBase}/google/connect?token=${token}`;
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
            events={events}
            startAccessor={(e: CalendarEvent) => new Date(e.start)}
            endAccessor={(e: CalendarEvent) => new Date(e.end)}
            titleAccessor="title"
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(e: CalendarEvent) => setSelectedEvent(e)}
            style={{ height: "100%", padding: "12px" }}
            popup
          />

          {/* Event detail overlay */}
          {selectedEvent && (
            <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          )}
        </div>
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
