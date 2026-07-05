import { useEffect, useState } from "react";
import {
  CalendarClock,
  Loader2,
  RefreshCw,
  MapPin,
  Users,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { SearchBar } from "@/components/common/SearchBar";
import type { CsvColumn } from "@/lib/exportCsv";
import { meetingApi, type Meeting, type MeetingStatus } from "@/lib/api";

function formatDateTime(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt.replace(" ", "T"));
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPast(dt: string | null): boolean {
  if (!dt) return false;
  const d = new Date(dt.replace(" ", "T"));
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

const STATUS_STYLES: Record<MeetingStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  COMPLETED: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  CANCELLED: "bg-rose-100 text-rose-800 hover:bg-rose-100",
};

/**
 * Super Admin — Meetings overview.
 *
 * Read-only. Shows every scheduled/past meeting with its summary and details so
 * the super admin can see what was discussed. No create/edit/delete — that
 * lives on the admin Meetings page.
 *
 * Inner content (no sidebar / page chrome). Reused by the standalone
 * /super-admin/meetings page AND the dashboard popup on the SUPER_ADMIN home.
 */
export function SuperAdminMeetingsContent() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMeetings(await meetingApi.getAll());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load meetings");
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Split by time bucket so each tab can show a live count.
  const upcomingMeetings = meetings.filter(
    (m) => !(isPast(m.dateTime) || m.status === "COMPLETED")
  );
  const pastMeetings = meetings.filter(
    (m) => isPast(m.dateTime) || m.status === "COMPLETED"
  );
  const tabMeetings =
    tab === "past" ? pastMeetings : tab === "upcoming" ? upcomingMeetings : meetings;

  // Free-text search runs client-side over the active tab's list.
  const q = query.trim().toLowerCase();
  const filtered = q
    ? tabMeetings.filter((m) =>
        `${m.title ?? ""} ${m.agenda ?? ""} ${m.summary ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : tabMeetings;

  const CSV_COLUMNS: CsvColumn<Meeting>[] = [
    { header: "Title", value: (m) => m.title },
    { header: "Date & Time", value: (m) => formatDateTime(m.dateTime) },
    { header: "Status", value: (m) => m.status },
    { header: "Location", value: (m) => m.location ?? "" },
    { header: "Attendees", value: (m) => m.attendees ?? "" },
    { header: "Agenda", value: (m) => m.agenda ?? "" },
    { header: "Scheduled By", value: (m) => m.createdBy?.name ?? "" },
  ];

  const pager = usePagination(filtered, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
            <CalendarClock className="h-6 w-6" /> Meetings
          </h1>
          <p className="text-sm text-muted-foreground">
            Meetings held and scheduled, with summaries (read-only)
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          ❌ {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search title, agenda, or summary…"
          className="w-64"
        />
        <ExportCsvButton
          rows={filtered}
          columns={CSV_COLUMNS}
          filename="meetings"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcomingMeetings.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({pastMeetings.length})</TabsTrigger>
          <TabsTrigger value="all">All ({meetings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading meetings…
            </div>
          ) : filtered.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                No {tab === "all" ? "" : tab} meetings yet.
              </CardContent>
            </Card>
          ) : (
            <>
            {pager.pageItems.map((m) => (
              <Card
                key={m.id}
                className="rounded-2xl shadow-sm border border-indigo-100"
              >
                <CardContent className="p-5 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-indigo-900">
                      {m.title}
                    </span>
                    <Badge className={STATUS_STYLES[m.status]}>{m.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {formatDateTime(m.dateTime)}
                  </p>
                  {m.location && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" /> {m.location}
                    </p>
                  )}
                  {m.attendees && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" /> {m.attendees}
                    </p>
                  )}
                  {m.agenda && (
                    <p className="text-foreground/80">
                      <span className="font-medium">Agenda: </span>
                      {m.agenda}
                    </p>
                  )}
                  {m.summary ? (
                    <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3">
                      <p className="text-xs font-semibold text-indigo-800 mb-1 flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> Summary / Remarks
                      </p>
                      <p className="whitespace-pre-wrap text-foreground/90">
                        {m.summary}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No summary recorded yet.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground pt-1">
                    Scheduled by {m.createdBy?.name ?? "—"}
                    {m.createdAt ? ` on ${formatDateTime(m.createdAt)}` : ""}
                    {m.lastEditedBy && m.lastEditedAt
                      ? ` · last edited by ${m.lastEditedBy.name} on ${formatDateTime(m.lastEditedAt)}`
                      : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              total={pager.total}
              rangeStart={pager.rangeStart}
              rangeEnd={pager.rangeEnd}
              onChange={pager.setPage}
            />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Standalone page (route /super-admin/meetings) — wraps the content with the
 *  dashboard sidebar + page chrome. */
export default function SuperAdminMeetings() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-5xl mx-auto">
            <SuperAdminMeetingsContent />
          </div>
        </div>
      </main>
    </div>
  );
}
