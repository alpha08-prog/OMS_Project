import { useEffect, useState } from "react";
import { Calendar, Clock, RefreshCw, MapPin, User, Search, Filter, ExternalLink, Image, Users, FileText, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { tourProgramApi, type TourProgram } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: "500" };
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
            <CardContent className="py-4">
              <div className="flex flex-wrap items-end gap-3">
                <Filter className="h-4 w-4 text-muted-foreground mt-6 flex-shrink-0" />

                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs text-muted-foreground mb-1">Search</p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Event name, organizer, venue..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                  </div>
                </div>

                {/* Date From */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">From Date</p>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                </div>

                {/* Date To */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">To Date</p>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                </div>

                {/* Report Status */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Report Status</p>
                  <Select value={completionFilter} onValueChange={setCompletionFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="completed">Report Submitted</SelectItem>
                      <SelectItem value="pending">Awaiting Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleSearch} className="bg-indigo-600 hover:bg-indigo-700">
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
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
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); setDetailsOpen(true); }}>
                          View Details
                        </Button>
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
      </main>
    </div>
  );
}
