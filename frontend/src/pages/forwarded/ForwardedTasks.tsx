import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox,
  CheckCircle2,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  History as HistoryIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { taskApi, grievanceApi, type ForwardedItem } from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  ASSIGNED: "bg-slate-100 text-slate-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ON_HOLD: "bg-rose-100 text-rose-800",
  OPEN: "bg-slate-100 text-slate-800",
  VERIFIED: "bg-indigo-100 text-indigo-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

// A single timeline row, normalised across task audit + grievance timeline.
type TimelineRow = {
  at: string | null;
  by: string | null;
  note: string;
  status: string | null;
};

const keyFor = (item: ForwardedItem) => `${item.entityType}-${item.id}`;

export default function ForwardedTasks() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ForwardedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Per-card timeline expansion.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, TimelineRow[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await taskApi.getForwarded());
    } catch (e) {
      console.error("Failed to load forwarded items", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Mark a forwarded item complete. Writes to the live source row (task →
  // COMPLETED, grievance → RESOLVED) so it shows complete everywhere and drops
  // off this list.
  const complete = async (item: ForwardedItem) => {
    setCompletingId(item.id);
    try {
      if (item.entityType === "GRIEVANCE") {
        await grievanceApi.update(item.id, { status: "RESOLVED" });
      } else {
        await taskApi.editShared(item.id, { status: "COMPLETED" });
      }
      await load();
    } catch (e: unknown) {
      alert(
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to mark complete."
      );
    } finally {
      setCompletingId(null);
    }
  };

  // Toggle + lazily load the timeline for one card.
  const toggleTimeline = async (item: ForwardedItem) => {
    const k = keyFor(item);
    if (openKey === k) {
      setOpenKey(null);
      return;
    }
    setOpenKey(k);
    if (timelines[k]) return;
    setTimelineLoading(k);
    try {
      let rows: TimelineRow[] = [];
      if (item.entityType === "GRIEVANCE") {
        const res = await grievanceApi.getTimeline(item.id);
        rows = res.timeline.map((e) => ({
          at: e.at,
          by: e.by,
          note: e.note,
          status: e.status,
        }));
      } else {
        const audit = await taskApi.getAudit(item.id);
        rows = audit.map((h) => ({
          at: h.createdAt,
          by: h.createdBy?.name ?? null,
          note: h.note,
          status: h.status ?? null,
        }));
      }
      setTimelines((prev) => ({ ...prev, [k]: rows }));
    } catch (e) {
      console.error("Failed to load timeline", e);
      setTimelines((prev) => ({ ...prev, [k]: [] }));
    } finally {
      setTimelineLoading(null);
    }
  };

  const openSource = (item: ForwardedItem) => {
    if (item.entityType === "GRIEVANCE") {
      navigate(`/grievances/view?id=${encodeURIComponent(item.id)}`);
    } else {
      navigate("/tasks/all");
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
                <Inbox className="h-6 w-6" />
                Forwarded to Me
              </h1>
              <p className="text-sm text-muted-foreground">
                Tasks and grievances other people have forwarded to you. Open the
                timeline to see the full history, or mark an item complete when
                it's done — that updates it everywhere.
              </p>
            </div>

            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Items ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing has been forwarded to you yet.
                  </p>
                ) : (
                  items.map((item) => {
                    const k = keyFor(item);
                    const isOpen = openKey === k;
                    const rows = timelines[k];
                    return (
                      <div
                        key={k}
                        className="rounded-xl border border-indigo-100 bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openSource(item)}
                                className="font-semibold text-indigo-900 hover:underline break-words text-left"
                                title="Open source record"
                              >
                                {item.title}
                              </button>
                              <Badge variant="outline">
                                {item.entityType === "GRIEVANCE" ? "Grievance" : "Task"}
                              </Badge>
                              {item.referenceNo && (
                                <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                  {item.referenceNo}
                                </span>
                              )}
                              <Badge className={STATUS_TONE[item.status ?? ""] ?? ""}>
                                {item.status ? item.status.replace("_", " ") : "—"}
                              </Badge>
                            </div>

                            {item.description && (
                              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                                {item.description}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                Forwarded by:{" "}
                                <span className="font-medium text-slate-700">
                                  {item.forwardedBy?.name ?? "—"}
                                </span>
                              </span>
                              {item.forwardedAt && (
                                <span>
                                  On {new Date(item.forwardedAt).toLocaleString()}
                                </span>
                              )}
                            </div>

                            {item.forwardRemark && (
                              <p className="mt-1 text-xs text-slate-600">
                                Note: {item.forwardRemark}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-indigo-700 px-2"
                                onClick={() => toggleTimeline(item)}
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4 mr-1" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 mr-1" />
                                )}
                                <HistoryIcon className="h-3.5 w-3.5 mr-1" />
                                Timeline
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openSource(item)}
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Open
                              </Button>
                            </div>

                            {isOpen && (
                              <div className="mt-3 border-t pt-3">
                                {timelineLoading === k ? (
                                  <p className="text-xs text-muted-foreground">Loading…</p>
                                ) : !rows || rows.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No activity yet.
                                  </p>
                                ) : (
                                  <ul className="space-y-2 max-h-56 overflow-auto">
                                    {rows.map((h, idx) => (
                                      <li key={idx} className="text-xs">
                                        <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                                          <Clock className="h-3 w-3" />
                                          {h.at ? new Date(h.at).toLocaleString() : ""}
                                          {" • "}
                                          <span className="font-medium text-gray-700">
                                            {h.by ?? "Unknown"}
                                          </span>
                                          {h.status && (
                                            <Badge className={STATUS_TONE[h.status] ?? ""}>
                                              {h.status.replace("_", " ")}
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-gray-700">{h.note}</p>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>

                          <Button
                            className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={completingId === item.id}
                            onClick={() => complete(item)}
                          >
                            {completingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                            )}
                            Complete
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
