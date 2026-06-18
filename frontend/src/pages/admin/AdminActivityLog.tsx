import { useCallback, useEffect, useState } from "react";
import { Activity, Download, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { activityApi, type ActivityEvent, type ActivityAction } from "@/lib/api";

const ENTITIES = [
  "Grievance",
  "Visitor",
  "Train Request",
  "Tour Program",
  "News",
  "Birthday",
  "Meeting",
  "Task",
];
const PAGE_SIZE = 100;

function fmt(at: string | null): string {
  if (!at) return "—";
  const d = new Date(String(at).replace(" ", "T"));
  if (isNaN(d.getTime())) return String(at);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportCsv(rows: ActivityEvent[]) {
  const header = ["When", "Module", "Action", "Record", "By"];
  const esc = (c: unknown) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [fmt(r.at), r.entity, r.action, r.label, r.by ?? ""].map(esc).join(",")
  );
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "activity-log.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminActivityLog() {
  const [rows, setRows] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState<"" | ActivityAction>("");
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (opts: { page: number; append: boolean }) => {
      setLoading(true);
      try {
        const { rows: r, total: t } = await activityApi.getAll({
          entity: entity || undefined,
          action: action || undefined,
          search: search.trim() || undefined,
          page: String(opts.page),
          limit: String(PAGE_SIZE),
        });
        setTotal(t);
        setRows((prev) => (opts.append ? [...prev, ...r] : r));
      } catch (e) {
        console.error("Failed to load activity", e);
      } finally {
        setLoading(false);
      }
    },
    [entity, action, search]
  );

  useEffect(() => {
    setPage(1);
    load({ page: 1, append: false });
  }, [load]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load({ page: next, append: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-6xl mx-auto space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
                  <Activity className="h-6 w-6" /> Activity Log
                </h1>
                <p className="text-sm text-muted-foreground">
                  Every record created or edited — who and when, across all
                  modules.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => exportCsv(rows)}
                disabled={rows.length === 0}
              >
                <Download className="h-4 w-4 mr-1.5" /> Export CSV
              </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
              >
                <option value="">All modules</option>
                {ENTITIES.map((en) => (
                  <option key={en} value={en}>
                    {en}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={action}
                onChange={(e) => setAction(e.target.value as "" | ActivityAction)}
              >
                <option value="">All actions</option>
                <option value="CREATED">Created</option>
                <option value="EDITED">Edited</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 w-64"
                  placeholder="Search record…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <Card className="rounded-2xl border border-indigo-100 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-indigo-50/60 text-indigo-900">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium">When</th>
                        <th className="text-left px-4 py-2.5 font-medium">Module</th>
                        <th className="text-left px-4 py-2.5 font-medium">Action</th>
                        <th className="text-left px-4 py-2.5 font-medium">Record</th>
                        <th className="text-left px-4 py-2.5 font-medium">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={`${r.entity}-${r.entityId}-${r.action}-${i}`}
                          className="border-t border-gray-100 hover:bg-indigo-50/30"
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                            {fmt(r.at)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {r.entity}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              className={
                                r.action === "CREATED"
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                  : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                              }
                            >
                              {r.action === "CREATED" ? "Created" : "Edited"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">{r.label}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {r.by ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!loading && rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-12 text-center text-muted-foreground"
                          >
                            No activity found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {loading && (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" /> Loading…
                  </div>
                )}
              </CardContent>
            </Card>

            {rows.length < total && !loading && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={loadMore}>
                  Load more ({rows.length} of {total})
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
