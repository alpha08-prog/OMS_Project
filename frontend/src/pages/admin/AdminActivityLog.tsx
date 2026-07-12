import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import type { CsvColumn } from "@/lib/exportCsv";
import { activityApi, type ActivityEvent, type ActivityAction } from "@/lib/api";
import { TableSkeleton } from "@/components/common/Skeletons";

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

const CSV_COLUMNS: CsvColumn<ActivityEvent>[] = [
  { header: "When", value: (r) => fmt(r.at) },
  { header: "Module", value: (r) => r.entity },
  { header: "Action", value: (r) => (r.action === "CREATED" ? "Created" : "Edited") },
  { header: "Record", value: (r) => r.label },
  { header: "By", value: (r) => r.by ?? "" },
];

export default function AdminActivityLog() {
  const [rows, setRows] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState<"" | ActivityAction>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (opts: { page: number; append: boolean }) => {
      setLoading(true);
      try {
        const { rows: r, total: t } = await activityApi.getAll({
          entity: entity || undefined,
          action: action || undefined,
          search: debouncedSearch.trim() || undefined,
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
    [entity, action, debouncedSearch]
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

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Sort a copy of the currently-loaded rows for display (never mutate `rows`).
  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        let c: number;
        if (sortKey === "at") {
          c =
            new Date(String(a.at ?? "").replace(" ", "T")).getTime() -
            new Date(String(b.at ?? "").replace(" ", "T")).getTime();
        } else {
          const av = sortKey === "entity" ? a.entity : a.action;
          const bv = sortKey === "entity" ? b.entity : b.action;
          c = (av ?? "").toString().localeCompare((bv ?? "").toString(), undefined, { numeric: true });
        }
        return sortDir === "asc" ? c : -c;
      })
    : rows;

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
              <ExportCsvButton
                rows={rows}
                columns={CSV_COLUMNS}
                filename="activity-log"
              />
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
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search record…"
                className="w-64"
              />
            </div>

            {total > 0 && (
              <p className="text-sm text-muted-foreground">
                Showing {rows.length} of {total} results
              </p>
            )}

            <Card className="rounded-2xl border border-indigo-100 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-indigo-50/60 text-indigo-900">
                      <tr>
                        <th
                          className="text-left px-4 py-2.5 font-medium cursor-pointer select-none"
                          onClick={() => toggleSort("at")}
                        >
                          When{sortKey === "at" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                        </th>
                        <th
                          className="text-left px-4 py-2.5 font-medium cursor-pointer select-none"
                          onClick={() => toggleSort("entity")}
                        >
                          Module{sortKey === "entity" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                        </th>
                        <th
                          className="text-left px-4 py-2.5 font-medium cursor-pointer select-none"
                          onClick={() => toggleSort("action")}
                        >
                          Action{sortKey === "action" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium">Record</th>
                        <th className="text-left px-4 py-2.5 font-medium">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((r, i) => (
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
                  <div className="p-4">
                    <TableSkeleton rows={6} cols={5} />
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
