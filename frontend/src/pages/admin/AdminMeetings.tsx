import { useEffect, useState } from "react";
import {
  CalendarClock,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  MapPin,
  Users,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { meetingApi, type Meeting, type MeetingStatus } from "@/lib/api";

// "YYYY-MM-DD HH:mm:ss" (Catalyst IST) -> "YYYY-MM-DDTHH:mm" (datetime-local).
function toInputValue(dt: string | null): string {
  if (!dt) return "";
  return dt.replace(" ", "T").slice(0, 16);
}

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

type FormState = {
  title: string;
  dateTime: string;
  location: string;
  attendees: string;
  agenda: string;
  status: MeetingStatus;
  summary: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  dateTime: "",
  location: "",
  attendees: "",
  agenda: "",
  status: "SCHEDULED",
  summary: "",
};

const STATUS_STYLES: Record<MeetingStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  COMPLETED: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  CANCELLED: "bg-rose-100 text-rose-800 hover:bg-rose-100",
};

export default function AdminMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = create
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setMeetings(await meetingApi.getAll());
    } catch (e) {
      console.error("Failed to load meetings", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (m: Meeting) => {
    setEditingId(m.id);
    setForm({
      title: m.title ?? "",
      dateTime: toInputValue(m.dateTime),
      location: m.location ?? "",
      attendees: m.attendees ?? "",
      agenda: m.agenda ?? "",
      status: m.status,
      summary: m.summary ?? "",
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.dateTime) {
      setError("Date & time is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await meetingApi.update(editingId, {
          title: form.title.trim(),
          dateTime: form.dateTime,
          location: form.location.trim() || null,
          attendees: form.attendees.trim() || null,
          agenda: form.agenda.trim() || null,
          status: form.status,
          summary: form.summary.trim() || null,
        });
      } else {
        await meetingApi.create({
          title: form.title.trim(),
          dateTime: form.dateTime,
          location: form.location.trim() || undefined,
          attendees: form.attendees.trim() || undefined,
          agenda: form.agenda.trim() || undefined,
        });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save meeting");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkCompleted = async (m: Meeting) => {
    try {
      await meetingApi.update(m.id, { status: "COMPLETED" });
      await load();
    } catch (e) {
      console.error("Failed to mark completed", e);
    }
  };

  const handleDelete = async (m: Meeting) => {
    if (!window.confirm(`Delete meeting "${m.title}"? This cannot be undone.`)) return;
    try {
      await meetingApi.remove(m.id);
      await load();
    } catch (e) {
      console.error("Failed to delete meeting", e);
    }
  };

  const filtered = meetings.filter((m) => {
    if (tab === "all") return true;
    const past = isPast(m.dateTime) || m.status === "COMPLETED";
    return tab === "past" ? past : !past;
  });

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
                  <CalendarClock className="h-6 w-6" /> Meetings
                </h1>
                <p className="text-sm text-muted-foreground">
                  Schedule meetings and record a summary for each
                </p>
              </div>
              <Button
                onClick={openCreate}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1" /> Schedule Meeting
              </Button>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
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
                  filtered.map((m) => (
                    <Card
                      key={m.id}
                      className="rounded-2xl shadow-sm border border-indigo-100"
                    >
                      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                        <div className="min-w-0">
                          <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                            {m.title}
                            <Badge className={STATUS_STYLES[m.status]}>
                              {m.status}
                            </Badge>
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatDateTime(m.dateTime)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {m.status !== "COMPLETED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkCompleted(m)}
                              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(m)}
                            aria-label="Edit meeting"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(m)}
                            aria-label="Delete meeting"
                            className="text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
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
                            <p className="text-xs font-semibold text-indigo-800 mb-1">
                              Summary / Remarks
                            </p>
                            <p className="whitespace-pre-wrap text-foreground/90">
                              {m.summary}
                            </p>
                          </div>
                        ) : (
                          <Button
                            variant="link"
                            className="px-0 text-indigo-700"
                            onClick={() => openEdit(m)}
                          >
                            <FileText className="h-4 w-4 mr-1" /> Add summary / remarks
                          </Button>
                        )}

                        {/* Audit trail — who scheduled / last edited and when */}
                        <p className="text-xs text-muted-foreground pt-1">
                          Scheduled by {m.createdBy?.name ?? "—"}
                          {m.createdAt ? ` on ${formatDateTime(m.createdAt)}` : ""}
                          {m.lastEditedBy && m.lastEditedAt
                            ? ` · last edited by ${m.lastEditedBy.name} on ${formatDateTime(m.lastEditedAt)}`
                            : ""}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Meeting" : "Schedule Meeting"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update details or record the meeting summary."
                : "Fill in the meeting details."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="m-title">
                Title <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="m-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Weekly review with department heads"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-datetime">
                Date &amp; time <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="m-datetime"
                type="datetime-local"
                value={form.dateTime}
                onChange={(e) => setForm({ ...form, dateTime: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-location">Location</Label>
              <Input
                id="m-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Office conference room"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-attendees">Attendees</Label>
              <Input
                id="m-attendees"
                value={form.attendees}
                onChange={(e) => setForm({ ...form, attendees: e.target.value })}
                placeholder="Comma-separated names"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-agenda">Agenda</Label>
              <Textarea
                id="m-agenda"
                value={form.agenda}
                onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                rows={2}
                placeholder="Purpose / agenda"
              />
            </div>
            {editingId && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="m-status">Status</Label>
                  <select
                    id="m-status"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as MeetingStatus })
                    }
                  >
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="m-summary">Summary / Remarks</Label>
                  <Textarea
                    id="m-summary"
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    rows={4}
                    placeholder="What was discussed / decided"
                  />
                </div>
              </>
            )}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? "Save changes" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
