import { useEffect, useState } from "react";
import { Calendar, Clock, RefreshCw, MapPin, User, Search, Filter, ExternalLink, Image, Users, FileText, X, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { tourProgramApi, type TourProgram } from "@/lib/api";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import type { CsvColumn } from "@/lib/exportCsv";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EventsView() {
  const [events, setEvents] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TourProgram | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [completionFilter, setCompletionFilter] = useState("all");

  // Edit dialog state — available to all roles; decision flow is untouched here.
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<TourProgram | null>(null);
  const [editForm, setEditForm] = useState({
    eventName: "",
    organizer: "",
    organizerPhone: "",
    organizerEmail: "",
    dateTime: "",
    venue: "",
    venueLink: "",
    description: "",
    referencedBy: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: "50" };
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (completionFilter !== "all") params.isCompleted = completionFilter === "completed" ? "true" : "false";
      const res = await tourProgramApi.getEvents(params);
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

  const handleSearch = () => fetchEvents();

  const handleClearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setCompletionFilter("all");
    // fetch without filters
    setTimeout(fetchEvents, 0);
  };

  const hasFilters = search || startDate || endDate || completionFilter !== "all";

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: "N/A", time: "" };
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  // Convert an ISO date string to the value a datetime-local input expects (local time, no seconds).
  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenEdit = (event: TourProgram) => {
    setEditEvent(event);
    setEditError(null);
    setEditForm({
      eventName: event.eventName ?? "",
      organizer: event.organizer ?? "",
      organizerPhone: event.organizerPhone ?? "",
      organizerEmail: event.organizerEmail ?? "",
      dateTime: toLocalInput(event.dateTime || event.eventDate),
      venue: event.venue ?? "",
      venueLink: event.venueLink ?? "",
      description: event.description ?? "",
      referencedBy: event.referencedBy ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editEvent) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      // Build a diff of only the fields the user actually changed.
      const original = {
        eventName: editEvent.eventName ?? "",
        organizer: editEvent.organizer ?? "",
        organizerPhone: editEvent.organizerPhone ?? "",
        organizerEmail: editEvent.organizerEmail ?? "",
        dateTime: toLocalInput(editEvent.dateTime || editEvent.eventDate),
        venue: editEvent.venue ?? "",
        venueLink: editEvent.venueLink ?? "",
        description: editEvent.description ?? "",
        referencedBy: editEvent.referencedBy ?? "",
      };
      const changed: Partial<typeof editForm> = {};
      (Object.keys(editForm) as (keyof typeof editForm)[]).forEach((key) => {
        if (editForm[key] !== original[key]) changed[key] = editForm[key];
      });

      if (Object.keys(changed).length === 0) {
        setEditDialogOpen(false);
        return;
      }

      // dateTime from a datetime-local input is local; convert back to ISO for the API.
      const payload: Record<string, string> = { ...changed };
      if (changed.dateTime !== undefined) {
        const d = new Date(changed.dateTime);
        if (isNaN(d.getTime())) {
          setEditError("Please enter a valid date and time.");
          setSavingEdit(false);
          return;
        }
        payload.dateTime = d.toISOString();
      }

      await tourProgramApi.update(editEvent.id, payload);
      setEditDialogOpen(false);
      setDetailsOpen(false);
      await fetchEvents();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const csvColumns: CsvColumn<TourProgram>[] = [
    { header: "Event", value: (e) => e.eventName },
    { header: "Organizer", value: (e) => e.organizer },
    { header: "Date/Time", value: (e) => e.dateTime ?? e.eventDate },
    { header: "Venue", value: (e) => e.venue },
    { header: "Completed", value: (e) => (e.isCompleted ? "Yes" : "No") },
    { header: "Created By", value: (e) => e.createdBy?.name },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">Events</h1>
              <p className="text-sm text-muted-foreground">Completed tour program events with post-event reports</p>
            </div>
            <Button variant="outline" onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{error}</div>
          )}

          {/* Filters */}
          <Card className="rounded-2xl border border-indigo-100">
            <CardContent className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filter:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Search</p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-10 pl-8"
                      placeholder="Event name, organizer, venue..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">From Date</p>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 w-full" />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">To Date</p>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 w-full" />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Report Status</p>
                  <Select value={completionFilter} onValueChange={setCompletionFilter}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="completed">Report Submitted</SelectItem>
                      <SelectItem value="pending">Awaiting Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={handleSearch} className="h-10 bg-indigo-600 hover:bg-indigo-700">
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
                {hasFilters && (
                  <Button variant="ghost" size="sm" className="h-10" onClick={handleClearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
                <ExportCsvButton
                  rows={events}
                  columns={csvColumns}
                  filename="events"
                  className="ml-auto"
                />
              </div>
            </CardContent>
          </Card>

          {/* Events List */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                Events ({events.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading events...</p>
              ) : events.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-muted-foreground">No events found</p>
                  {hasFilters && <p className="text-xs text-muted-foreground mt-1">Try clearing filters</p>}
                </div>
              ) : (
                events.map((event) => {
                  const { date, time } = formatDateTime(event.dateTime || event.eventDate || "");
                  return (
                    <div
                      key={event.id}
                      className="p-4 rounded-xl border bg-white hover:shadow-md transition cursor-pointer"
                      onClick={() => { setSelectedEvent(event); setDetailsOpen(true); }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-4 flex-1">
                          <div className={`p-2 rounded-lg flex-shrink-0 ${event.isCompleted ? "bg-green-100" : "bg-amber-100"}`}>
                            <Calendar className={`h-5 w-5 ${event.isCompleted ? "text-green-700" : "text-amber-700"}`} />
                          </div>
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-indigo-900">{event.eventName}</p>
                              {event.isCompleted
                                ? <Badge className="bg-green-100 text-green-800">Report Submitted</Badge>
                                : <Badge className="bg-amber-100 text-amber-800">Awaiting Report</Badge>
                              }
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{event.organizer}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{date} at {time}</span>
                              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.venue}</span>
                              {event.attendeesCount && (
                                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{event.attendeesCount} attendees</span>
                              )}
                            </div>
                            {event.outcomeSummary && (
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.outcomeSummary}</p>
                            )}
                            {event.lastEditedAt && (
                              <p className="text-xs text-muted-foreground italic mt-1">
                                Last edited by {event.lastEditedBy?.name ?? 'Unknown'} on {new Date(event.lastEditedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleOpenEdit(event); }}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); setDetailsOpen(true); }}>
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Event Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Event Details
              </DialogTitle>
            </DialogHeader>
            {selectedEvent && (
              <div className="space-y-5">
                {/* Status */}
                <div className="flex items-center gap-2">
                  {selectedEvent.isCompleted
                    ? <Badge className="bg-green-100 text-green-800">Report Submitted</Badge>
                    : <Badge className="bg-amber-100 text-amber-800">Awaiting Report</Badge>
                  }
                </div>

                {/* Event Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Event Name</p>
                    <p className="font-semibold text-lg">{selectedEvent.eventName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer</p>
                    <p className="font-medium">{selectedEvent.organizer}</p>
                    {selectedEvent.organizerPhone && <p className="text-sm text-muted-foreground">{selectedEvent.organizerPhone}</p>}
                    {selectedEvent.organizerEmail && <p className="text-sm text-muted-foreground">{selectedEvent.organizerEmail}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">{formatDateTime(selectedEvent.dateTime || selectedEvent.eventDate || "").date}</p>
                    <p className="text-sm text-muted-foreground">{formatDateTime(selectedEvent.dateTime || selectedEvent.eventDate || "").time}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Venue</p>
                    <p className="font-medium">{selectedEvent.venue}</p>
                    {selectedEvent.venueLink && (
                      <a href={selectedEvent.venueLink} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />View on map
                      </a>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Submitted by</p>
                    <p className="font-medium">{selectedEvent.createdBy?.name}</p>
                  </div>
                  {selectedEvent.referencedBy && (
                    <div>
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedEvent.referencedBy}</p>
                    </div>
                  )}
                  {selectedEvent.description && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="mt-1 p-3 bg-gray-50 rounded-lg text-sm">{selectedEvent.description}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {selectedEvent.lastEditedAt ? (
                    <p className="text-xs text-muted-foreground italic">
                      Last edited by {selectedEvent.lastEditedBy?.name ?? 'Unknown'} on {new Date(selectedEvent.lastEditedAt).toLocaleString()}
                    </p>
                  ) : <span />}
                  <Button size="sm" variant="outline" onClick={() => handleOpenEdit(selectedEvent)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>

                {/* Post-Event Report */}
                {selectedEvent.isCompleted && (
                  <div className="border-t pt-4 space-y-4">
                    <p className="font-semibold text-indigo-900 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Post-Event Report
                      <span className="text-xs font-normal text-muted-foreground">
                        — submitted by {selectedEvent.completedBy?.name} on {formatDateShort(selectedEvent.completedAt)}
                      </span>
                    </p>

                    {selectedEvent.attendeesCount && (
                      <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg">
                        <Users className="h-4 w-4 text-indigo-600" />
                        <span className="font-medium">{selectedEvent.attendeesCount} attendees</span>
                      </div>
                    )}

                    {selectedEvent.keynotes && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Keynotes / Highlights</p>
                        <p className="p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">{selectedEvent.keynotes}</p>
                      </div>
                    )}

                    {selectedEvent.outcomeSummary && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Outcome Summary</p>
                        <p className="p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">{selectedEvent.outcomeSummary}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      {selectedEvent.driveLink && (
                        <a href={selectedEvent.driveLink} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-200">
                            <ExternalLink className="h-4 w-4 mr-1" />Drive Files
                          </Button>
                        </a>
                      )}
                      {selectedEvent.mediaLink && (
                        <a href={selectedEvent.mediaLink} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-200">
                            <Image className="h-4 w-4 mr-1" />Photos / Media
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Tour Dialog — editable details, available to all roles. Decision flow untouched. */}
        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditError(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit Tour Program
              </DialogTitle>
              <DialogDescription>
                Update the tour details. Your name and the time will be recorded.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-eventName">Event Name</Label>
                  <Input
                    id="edit-eventName"
                    value={editForm.eventName}
                    onChange={(e) => setEditForm((f) => ({ ...f, eventName: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-organizer">Organizer</Label>
                  <Input
                    id="edit-organizer"
                    value={editForm.organizer}
                    onChange={(e) => setEditForm((f) => ({ ...f, organizer: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-organizerPhone">Organizer Phone</Label>
                  <Input
                    id="edit-organizerPhone"
                    value={editForm.organizerPhone}
                    onChange={(e) => setEditForm((f) => ({ ...f, organizerPhone: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-organizerEmail">Organizer Email</Label>
                  <Input
                    id="edit-organizerEmail"
                    type="email"
                    value={editForm.organizerEmail}
                    onChange={(e) => setEditForm((f) => ({ ...f, organizerEmail: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-dateTime">Date &amp; Time</Label>
                  <Input
                    id="edit-dateTime"
                    type="datetime-local"
                    value={editForm.dateTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateTime: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-venue">Venue</Label>
                  <Input
                    id="edit-venue"
                    value={editForm.venue}
                    onChange={(e) => setEditForm((f) => ({ ...f, venue: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-venueLink">Venue Link</Label>
                  <Input
                    id="edit-venueLink"
                    value={editForm.venueLink}
                    onChange={(e) => setEditForm((f) => ({ ...f, venueLink: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-referencedBy">Referenced By</Label>
                  <Input
                    id="edit-referencedBy"
                    value={editForm.referencedBy}
                    onChange={(e) => setEditForm((f) => ({ ...f, referencedBy: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    className="mt-1 resize-y min-h-[100px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
