import { useCallback, useEffect, useState } from "react";
import {
  Newspaper,
  RefreshCw,
  Filter,
  Eye,
  ExternalLink,
  MapPin,
  User,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { TruncationNotice } from "@/components/common/TruncationNotice";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { SearchBar } from "@/components/common/SearchBar";
import type { CsvColumn } from "@/lib/exportCsv";
import { newsApi, type NewsIntelligence, type NewsPriority } from "@/lib/api";
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

/**
 * Super Admin — News Intelligence overview.
 *
 * Read-only. No delete, no edit. Same look as the admin NewsIntelligenceView,
 * but on a separate page so the admin's own page stays untouched.
 */
/** Inner content (no sidebar wrapper). Reused by the standalone page
 *  and the dashboard popup on the SUPER_ADMIN home screen. */
export function SuperAdminNewsContent() {
  const [news, setNews] = useState<NewsIntelligence[]>([]);
  // Rows the SERVER handed us, plus the server's real total when it has one.
  // Tracked separately from `news` because the client-side search narrows the
  // list — counting post-filter rows would fire the truncation notice on every
  // search, which is exactly the kind of wrong warning people learn to ignore.
  const [loadedCount, setLoadedCount] = useState(0);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [totalKnown, setTotalKnown] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<NewsIntelligence | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Explicit limit: the API defaults to 10 when none is sent, and the
      // client pager then computes totalPages=1 and hides itself — so the
      // page looked complete while showing only the first 10 rows.
      const params: Record<string, string> = { limit: "200" };
      if (filterPriority !== "all") params.priority = filterPriority;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await newsApi.getAll(params);
      const arr = Array.isArray(res?.data) ? res.data : [];
      // Sort latest-first by createdAt so newest news appear at the top.
      const sorted = [...arr].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNews(sorted);
      setLoadedCount(arr.length);
      setTotal(res?.meta?.total);
      setTotalKnown(res?.meta?.totalKnown);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load news';
      setError(message);
      setNews([]);
      setLoadedCount(0);
      setTotal(undefined);
      setTotalKnown(undefined);
    } finally {
      setLoading(false);
    }
  }, [filterPriority, startDate, endDate]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffH < 48) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCategory = (c: string) => {
    const map: Record<string, string> = {
      DEVELOPMENT_WORK: 'Development Work',
      CONSPIRACY_FAKE_NEWS: 'Conspiracy / Fake News',
      LEADER_ACTIVITY: 'Leader Activity',
      PARTY_ACTIVITY: 'Party Activity',
      OPPOSITION: 'Opposition Activity',
      OTHER: 'Other',
    };
    return map[c] || c;
  };

  const getPriorityBadge = (p: NewsPriority) => {
    switch (p) {
      case 'CRITICAL':
        return <Badge className="bg-red-100 text-red-800 border-red-300">🚨 Critical</Badge>;
      case 'HIGH':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">⚠️ High</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Normal</Badge>;
    }
  };

  const getCardStyle = (p: NewsPriority) => {
    switch (p) {
      case 'CRITICAL':
        return 'border-l-4 border-l-red-500 bg-red-50/50';
      case 'HIGH':
        return 'border-l-4 border-l-amber-500 bg-amber-50/50';
      default:
        return 'border-l-4 border-l-gray-300';
    }
  };

  // Priority/date filters happen server-side in fetchNews; the free-text
  // search runs client-side over the already-fetched window (headline, source).
  const q = query.trim().toLowerCase();
  const filteredNews = q
    ? news.filter((n) =>
        `${n.headline ?? ""} ${n.mediaSource ?? ""}`.toLowerCase().includes(q)
      )
    : news;

  const CSV_COLUMNS: CsvColumn<NewsIntelligence>[] = [
    { header: "Headline", value: (n) => n.headline },
    { header: "Category", value: (n) => n.category },
    { header: "Priority", value: (n) => n.priority },
    { header: "Region", value: (n) => n.region },
    { header: "Media Source", value: (n) => n.mediaSource },
    { header: "Created", value: (n) => new Date(n.createdAt).toLocaleString() },
  ];

  const pager = usePagination(filteredNews, 10);

  return (
    <div className="space-y-6">

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">News</h1>
                <p className="text-sm text-muted-foreground">News intelligence feed (read-only)</p>
              </div>
              <Button variant="outline" onClick={fetchNews} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  placeholder="Search headline or media source…"
                  className="w-64"
                />
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Priority:</span>
                </div>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                  </SelectContent>
                </Select>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                <ExportCsvButton
                  rows={filteredNews}
                  columns={CSV_COLUMNS}
                  filename="news"
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>News ({filteredNews.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* The 200-row cap above is deliberate; hiding it is not. Sits
                    above the feed so it is read before the rows, not after. */}
                <TruncationNotice
                  loaded={loadedCount}
                  total={total}
                  totalKnown={totalKnown}
                  hint="Narrow the priority or date range to reach older news — search only looks inside what is loaded here."
                />
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading…</p>
                ) : filteredNews.length === 0 ? (
                  <div className="text-center py-8">
                    <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No news entries</p>
                  </div>
                ) : (
                  pager.pageItems.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border bg-white hover:shadow-md transition ${getCardStyle(item.priority)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-semibold text-indigo-900 break-words">{item.headline}</p>
                            {getPriorityBadge(item.priority)}
                            <Badge variant="outline">{formatCategory(item.category)}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {item.region && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {item.region}
                              </span>
                            )}
                            {item.referencedBy && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {item.referencedBy}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTime(item.createdAt)}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-sm mt-2 line-clamp-2">{item.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelected(item);
                              setDetailsOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <Pagination
                  page={pager.page}
                  totalPages={pager.totalPages}
                  total={pager.total}
                  rangeStart={pager.rangeStart}
                  rangeEnd={pager.rangeEnd}
                  onChange={pager.setPage}
                />
              </CardContent>
            </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              News Details
            </DialogTitle>
          </DialogHeader>
            {selected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {getPriorityBadge(selected.priority)}
                  <Badge variant="outline">{formatCategory(selected.category)}</Badge>
                </div>
                <h3 className="text-lg font-semibold">{selected.headline}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Region</p>
                    <p className="font-medium">{selected.region || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Referenced By</p>
                    <p className="font-medium">{selected.referencedBy || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Captured</p>
                    <p className="font-medium">{formatTime(selected.createdAt)}</p>
                  </div>
                </div>
                {selected.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 rounded bg-slate-50 text-sm whitespace-pre-wrap">
                      {selected.description}
                    </p>
                  </div>
                )}
                {selected.imageUrl && (
                  <a
                    href={selected.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 text-sm"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open image
                  </a>
                )}
              </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Standalone page (route /super-admin/news). */
export default function SuperAdminNews() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <SuperAdminNewsContent />
          </div>
        </div>
      </main>
    </div>
  );
}
