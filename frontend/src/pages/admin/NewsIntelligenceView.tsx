import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Newspaper,
  AlertTriangle,
  RefreshCw,
  Filter,
  Eye,
  Trash2,
  Pencil,
  ExternalLink,
  MapPin,
  User,
  Clock
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { AttachmentsList } from "@/components/common/AttachmentsList";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { CardListSkeleton } from "@/components/common/Skeletons";
import { useConfirm } from "@/components/common/ConfirmDialog";
import type { CsvColumn } from "@/lib/exportCsv";
import { newsApi, type NewsIntelligence, type NewsPriority } from "@/lib/api";
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

export default function NewsIntelligenceView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const [news, setNews] = useState<NewsIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsIntelligence | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState("");

  // Client-side text filter over headline + description.
  const filteredNews = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return news;
    return news.filter((item) =>
      [item.headline, item.description].some((field) =>
        (field ?? "").toLowerCase().includes(s)
      )
    );
  }, [news, search]);

  const csvColumns: CsvColumn<NewsIntelligence>[] = [
    { header: "Headline", value: (r) => r.headline },
    { header: "Category", value: (r) => r.category },
    { header: "Priority", value: (r) => r.priority },
    { header: "Source", value: (r) => r.mediaSource },
    { header: "Region", value: (r) => r.region },
    { header: "Description", value: (r) => r.description },
    { header: "Created By", value: (r) => r.createdBy?.name },
    { header: "Created", value: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  // Client-side pagination — 10 rows per page, over the searched/filtered rows.
  const pager = usePagination(filteredNews, 10);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterPriority !== "all") {
        params.priority = filterPriority;
      }
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await newsApi.getAll(params);
      console.log('NewsIntelligenceView - News response:', res);
      const newsArray = Array.isArray(res?.data) ? res.data : [];
      console.log('NewsIntelligenceView - News array:', newsArray);
      setNews(newsArray);
    } catch (err: unknown) {
      console.error('Failed to fetch news:', err);
      const errorObj = err as Record<string, unknown> | null;
      const message = errorObj && typeof errorObj === 'object' && typeof errorObj.message === 'string' ? errorObj.message : String(err);
      setError(message || "Failed to load news");
      setNews([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, [filterPriority, startDate, endDate]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const handleViewDetails = (item: NewsIntelligence) => {
    setSelectedNews(item);
    setDetailsOpen(true);
  };

  // Deep-link: critical-news notifications carry /news/view?id=<row>. Open
  // the details dialog for the linked story once the list has loaded, then
  // strip the param so dismissing the dialog doesn't keep re-opening it.
  const targetNewsId = searchParams.get("id");
  useEffect(() => {
    if (!targetNewsId || news.length === 0) return;
    const match = news.find((n) => n.id === targetNewsId);
    if (match) {
      setSelectedNews(match);
      setDetailsOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }, [targetNewsId, news, searchParams, setSearchParams]);

  const handleDelete = async (id: string) => {
    if (!(await confirm({
      title: "Delete this news item?",
      description: "This action cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    }))) return;

    try {
      await newsApi.delete(id);
      setNews(prev => prev.filter(n => n.id !== id));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to delete news");
    }
  };

  // Edit dialog — corrections to headline / source / region / priority etc.
  const [editNews, setEditNews] = useState<NewsIntelligence | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (item: NewsIntelligence) => {
    setEditError(null);
    setEditForm({
      headline: item.headline ?? "",
      category: item.category ?? "",
      priority: item.priority ?? "NORMAL",
      mediaSource: item.mediaSource ?? "",
      region: item.region ?? "",
      description: item.description ?? "",
    });
    setEditNews(item);
  };

  const editChange = (field: string, value: string) =>
    setEditForm((p) => ({ ...p, [field]: value }));

  const saveEdit = async () => {
    if (!editNews) return;
    if (!editForm.headline.trim()) {
      setEditError("Headline is required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await newsApi.update(editNews.id, {
        headline: editForm.headline,
        category: editForm.category,
        priority: editForm.priority as NewsPriority,
        mediaSource: editForm.mediaSource,
        region: editForm.region,
        description: editForm.description || undefined,
      });
      setEditNews(null);
      fetchNews();
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCategory = (category: string) => {
    const categoryMap: Record<string, string> = {
      'DEVELOPMENT_WORK': 'Development Work',
      'CONSPIRACY_FAKE_NEWS': 'Conspiracy / Fake News',
      'LEADER_ACTIVITY': 'Leader Activity',
      'PARTY_ACTIVITY': 'Party Activity',
      'OPPOSITION': 'Opposition Activity',
      'OTHER': 'Other',
    };
    return categoryMap[category] || category;
  };

  const getPriorityBadge = (priority: NewsPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return <Badge className="bg-red-100 text-red-800 border-red-300">🚨 Critical</Badge>;
      case 'HIGH':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">⚠️ High</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Normal</Badge>;
    }
  };

  const getCardStyle = (priority: NewsPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'border-l-4 border-l-red-500 bg-red-50/50';
      case 'HIGH':
        return 'border-l-4 border-l-amber-500 bg-amber-50/50';
      default:
        return 'border-l-4 border-l-gray-300';
    }
  };

  const criticalCount = news.filter(n => n.priority === 'CRITICAL').length;
  const highCount = news.filter(n => n.priority === 'HIGH').length;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                News & Intelligence
              </h1>
              <p className="text-sm text-muted-foreground">
                View all intelligence entries submitted by staff
              </p>
            </div>
            <Button variant="outline" onClick={fetchNews} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-xl bg-red-50 border-red-200">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-3xl font-bold text-red-900 leading-tight">{criticalCount}</p>
                  <p className="text-sm text-red-700 mt-1">Critical Alerts</p>
                </div>
                <div className="p-3 bg-red-100 rounded-lg flex-shrink-0">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-3xl font-bold text-amber-900 leading-tight">{highCount}</p>
                  <p className="text-sm text-amber-700 mt-1">High Priority</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-lg flex-shrink-0">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl bg-indigo-50 border-indigo-200">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-3xl font-bold text-indigo-900 leading-tight">{news.length}</p>
                  <p className="text-sm text-indigo-700 mt-1">Total Entries</p>
                </div>
                <div className="p-3 bg-indigo-100 rounded-lg flex-shrink-0">
                  <Newspaper className="h-6 w-6 text-indigo-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              ❌ {error}
            </div>
          )}

          {/* Filters */}
          <Card className="rounded-2xl border border-indigo-100">
            <CardContent className="px-5 py-5 space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="flex items-center gap-2 lg:flex-1 lg:min-w-0">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Priority:</span>
                  <div className="flex-1 min-w-0">
                    <Select value={filterPriority} onValueChange={setFilterPriority}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="CRITICAL">🚨 Critical</SelectItem>
                        <SelectItem value="HIGH">⚠️ High</SelectItem>
                        <SelectItem value="NORMAL">Normal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search headline or description"
                  className="w-full sm:w-72"
                />
                <ExportCsvButton
                  rows={filteredNews}
                  columns={csvColumns}
                  filename="news-intelligence"
                  className="sm:ml-auto"
                />
              </div>
            </CardContent>
          </Card>

          {/* News List */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Intelligence Feed ({filteredNews.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <CardListSkeleton rows={5} />
              ) : filteredNews.length === 0 ? (
                <div className="text-center py-8">
                  <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-muted-foreground">No news entries found</p>
                </div>
              ) : (
                pager.pageItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border bg-white ${getCardStyle(item.priority)} hover:shadow-md transition`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex gap-4 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${
                          item.priority === 'CRITICAL' ? 'bg-red-100' :
                          item.priority === 'HIGH' ? 'bg-amber-100' : 'bg-gray-100'
                        }`}>
                          {item.priority === 'CRITICAL' ? (
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                          ) : (
                            <Newspaper className={`h-5 w-5 ${
                              item.priority === 'HIGH' ? 'text-amber-600' : 'text-gray-600'
                            }`} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-indigo-900">{item.headline}</p>
                            {getPriorityBadge(item.priority)}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Newspaper className="h-3.5 w-3.5" />
                              {formatCategory(item.category)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {item.region}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(item.createdAt)}
                            </span>
                          </div>
                          
                          <p className="text-sm text-muted-foreground">
                            Source: {item.mediaSource}
                          </p>
                          
                          {item.description && (
                            <p className="text-sm line-clamp-2">{item.description}</p>
                          )}
                          
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Reported by: {item.createdBy?.name || 'Unknown'}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(item)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Edit"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
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

        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editNews} onOpenChange={(open) => { if (!open) setEditNews(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit News Entry</DialogTitle>
              <DialogDescription>
                Correct the details of this news / intelligence entry.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Headline</Label>
                <Input value={editForm.headline ?? ""} onChange={(e) => editChange("headline", e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={editForm.category ?? ""} onChange={(e) => editChange("category", e.target.value)} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={editForm.priority ?? "NORMAL"} onValueChange={(v) => editChange("priority", v)}>
                  <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Media Source</Label>
                <Input value={editForm.mediaSource ?? ""} onChange={(e) => editChange("mediaSource", e.target.value)} />
              </div>
              <div>
                <Label>Region</Label>
                <Input value={editForm.region ?? ""} onChange={(e) => editChange("region", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={editForm.description ?? ""} onChange={(e) => editChange("description", e.target.value)} className="min-h-[90px]" />
              </div>
            </div>
            {editError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditNews(null)} disabled={editSaving}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={editSaving} className="bg-indigo-600 hover:bg-indigo-700">
                {editSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Newspaper className="h-5 w-5" />
                Intelligence Details
              </DialogTitle>
              <DialogDescription>
                Full details of the news/intelligence entry
              </DialogDescription>
            </DialogHeader>
            
            {selectedNews && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getPriorityBadge(selectedNews.priority)}
                  <Badge variant="outline">{formatCategory(selectedNews.category)}</Badge>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">{selectedNews.headline}</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Region</p>
                    <p className="font-medium">{selectedNews.region}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Media Source</p>
                    <p className="font-medium">{selectedNews.mediaSource}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reported By</p>
                    <p className="font-medium">{selectedNews.createdBy?.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">
                      {new Date(selectedNews.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {selectedNews.referencedBy && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedNews.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                {selectedNews.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {selectedNews.description}
                    </p>
                  </div>
                )}
                
                {selectedNews.imageUrl && (
                  <div>
                    <p className="text-sm text-muted-foreground">Evidence Image</p>
                    <a
                      href={selectedNews.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-indigo-600 hover:underline mt-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Image
                    </a>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <AttachmentsList
                    contextType="NEWS"
                    contextId={selectedNews.id}
                    emptyMessage="No supporting files were uploaded with this news entry."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
