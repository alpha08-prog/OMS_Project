import { useEffect, useRef, useState } from "react";
import {
  Printer,
  FileText,
  Download,
  Eye,
  Filter,
  Train,
  Calendar,
  RefreshCw,
  Landmark,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchBar } from "@/components/common/SearchBar";
import { TruncationNotice } from "@/components/common/TruncationNotice";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { grievanceApi, trainRequestApi, tourProgramApi, pdfApi, http, type Grievance, type TrainRequest, type TourProgram } from "@/lib/api";
import { useToast } from "@/components/AuthForm/Toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PrintableItem = {
  id: string;
  type: 'grievance' | 'temple' | 'train' | 'tour';
  title: string;
  subtitle: string;
  date: string;
  status: string;
  data: Grievance | TrainRequest | TourProgram;
};

/**
 * Rows per request. The server clamps keyset pages to MAX_KEYSET_LIMIT (250),
 * which is what this is sized to: 250 turns the ~2,100-row train table into 9
 * round-trips instead of 22.
 */
const PAGE_SIZE = 250;
/** Hard stop per source: 40 x 250 = 10,000 rows. Anything beyond is reported by the notice. */
const MAX_PAGES_PER_SOURCE = 40;
/**
 * Offset paging costs more the deeper it goes, so the fallback for sources that
 * are not keyset-paged yet is kept shallow on purpose.
 */
const MAX_LEGACY_PAGES = 4;

// Row -> printable card. Pure, and defined once rather than rebuilt per fetch,
// because a streaming load re-maps the accumulated rows on every page arrival.
const toGrievanceItem = (g: Grievance): PrintableItem =>
  g.grievanceType === 'TEMPLE_VISIT'
    ? {
        id: g.id,
        type: 'temple',
        title: `Temple Visit Letter - ${g.petitionerName}`,
        subtitle: `${g.memberCount ?? '?'} member(s) • ${g.constituency}`,
        date: g.resolvedAt || g.createdAt,
        status: g.status === 'RESOLVED' ? 'Resolved' : g.status === 'REJECTED' ? 'Rejected' : g.status === 'IN_PROGRESS' ? 'In Progress' : 'Open',
        data: g,
      }
    : {
        id: g.id,
        type: 'grievance',
        title: `Grievance Letter - ${g.grievanceType.replace(/_/g, ' ')}`,
        subtitle: `${g.petitionerName} • ${g.constituency}`,
        date: g.verifiedAt || g.createdAt,
        status: g.status === 'RESOLVED' ? 'Resolved' : g.status === 'IN_PROGRESS' ? 'In Progress' : g.status === 'REJECTED' ? 'Rejected' : g.isVerified ? 'Verified' : 'Open',
        data: g,
      };

const toTrainItem = (t: TrainRequest): PrintableItem => ({
  id: t.id,
  type: 'train',
  title: `Train EQ Letter - ${t.trainName || 'N/A'}`,
  subtitle: `${t.passengerName} • PNR: ${t.pnrNumber}`,
  date: t.approvedAt || t.createdAt,
  status: t.status === 'APPROVED' ? 'Approved' : t.status === 'REJECTED' ? 'Rejected' : 'Pending',
  data: t,
});

const toTourItem = (t: TourProgram): PrintableItem => ({
  id: t.id,
  type: 'tour',
  title: `Tour Invitation - ${t.eventName}`,
  subtitle: `${t.organizer} • ${t.venue}`,
  date: t.dateTime || t.createdAt,
  status: t.decision === 'ACCEPTED' ? 'Accepted' : t.decision === 'REGRET' ? 'Regret' : 'Pending',
  data: t,
});

export default function PrintCenter() {
  const { push } = useToast();
  const [printableItems, setPrintableItems] = useState<PrintableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tally, setTally] = useState<{ loaded: number; total?: number; totalKnown: boolean }>({
    loaded: 0,
    totalKnown: false,
  });
  // True while later pages are still arriving behind an already-rendered list.
  // Distinct from `loading`, which now only covers the wait for the FIRST rows.
  const [streaming, setStreaming] = useState(false);
  // Changing the date range restarts the fetch. Without this, a slow walk from
  // the previous range would keep publishing its rows over the new results.
  const fetchRunId = useRef(0);

  const fetchPrintableItems = async () => {
    setLoading(true);
    setStreaming(true);
    setError(null);
    const runId = ++fetchRunId.current;

    const dateParams: Record<string, string> = {};
    if (startDate) dateParams.startDate = startDate;
    if (endDate) dateParams.endDate = endDate;

    // Rows per source, kept separate and re-assembled in a FIXED order on every
    // publish. The three sources are fetched concurrently, so appending to one
    // shared array would order the list by whichever response happened to land
    // first — the rendered order would change run to run.
    const raw = {
      grievances: [] as Grievance[],
      trains: [] as TrainRequest[],
      tours: [] as TourProgram[],
    };
    const counts = {
      grievances: { total: undefined as number | undefined, known: true },
      trains: { total: undefined as number | undefined, known: true },
      tours: { total: undefined as number | undefined, known: true },
    };

    // Paint whatever has arrived so far. Because every source is walked
    // newest-first, the rows that land first are the ones page 1 shows — later
    // pages append older records underneath and do not disturb what is already
    // on screen.
    const publish = () => {
      if (fetchRunId.current !== runId) return; // a newer fetch owns the screen
      setPrintableItems([
        ...raw.grievances.map(toGrievanceItem),
        ...raw.trains.map(toTrainItem),
        ...raw.tours.map(toTourItem),
      ]);
      let total = 0;
      let known = true;
      for (const c of [counts.grievances, counts.trains, counts.tours]) {
        if (!c.known || typeof c.total !== 'number') known = false;
        else total += c.total;
      }
      setTally({
        loaded: raw.grievances.length + raw.trains.length + raw.tours.length,
        total: known ? total : undefined,
        totalKnown: known,
      });
      setLoading(false); // rows are on screen; the skeleton has done its job
    };

    /**
     * Walk one source to the end.
     *
     * Cursor-first, and that is the entire performance fix. A keyset cursor
     * costs the same at page 20 as at page 1 (~110ms measured). `page=N` does
     * not: the server must re-walk from the first row to skip N pages, so the
     * cost grows with depth (measured 216ms at page 1 -> 1046ms at page 20)
     * and a 22-page walk becomes quadratic. The previous version never sent
     * `sort`, so it never entered cursor mode, never received a nextCursor,
     * and fell back to page=N for all 22 pages -- 63s for the train table.
     *
     * Not every list endpoint is keyset-paged yet: tour-programs still answers
     * without a cursor. For those we fall back to page=N deliberately, but for
     * only a few pages, and anything we miss is reported by the truncation
     * notice rather than silently dropped.
     */
    const walk = async <T,>(
      fetcher: (p: Record<string, string>) => Promise<{
        data?: T[];
        meta?: { total?: number; totalKnown?: boolean; hasMore?: boolean; nextCursor?: string | null };
      }>,
      sink: T[],
      count: { total?: number; known: boolean }
    ): Promise<void> => {
      let cursor: string | null = null;
      let pageNum = 1;

      for (let i = 0; i < MAX_PAGES_PER_SOURCE; i++) {
        const params: Record<string, string> = {
          ...dateParams,
          limit: String(PAGE_SIZE),
          sort: 'newest', // opts into cursor mode; ordering is unchanged
        };
        if (cursor) params.cursor = cursor;
        else if (pageNum > 1) params.page = String(pageNum);

        const res = await fetcher(params);
        if (fetchRunId.current !== runId) return; // abandoned mid-walk

        const rows = Array.isArray(res?.data) ? res.data : [];
        sink.push(...rows);

        const t = res?.meta?.total;
        // Keep the SERVER's total even when we stop early, so the notice can
        // report the shortfall instead of reporting the list as complete.
        if (res?.meta?.totalKnown === false || typeof t !== 'number') count.known = false;
        else count.total = t;

        publish();

        if (!res?.meta?.hasMore || rows.length === 0) return; // whole source loaded
        if (res.meta.nextCursor) {
          cursor = res.meta.nextCursor;
        } else if (cursor) {
          return; // was cursoring and the server stopped offering one
        } else if (pageNum >= MAX_LEGACY_PAGES) {
          return; // offset fallback is quadratic; refuse to walk it deep
        } else {
          pageNum++;
        }
      }
    };

    try {
      // Concurrent, not sequential. Previously each source waited for the one
      // before it, so the page cost the SUM of all three walks.
      await Promise.all([
        walk((p) => grievanceApi.getAll(p), raw.grievances, counts.grievances),
        walk((p) => trainRequestApi.getAll(p), raw.trains, counts.trains),
        walk((p) => tourProgramApi.getAll(p), raw.tours, counts.tours),
      ]);
    } catch (err: unknown) {
      if (fetchRunId.current !== runId) return;
      console.error('Failed to fetch printable items:', err);
      const e = err as Record<string, unknown> | null;
      const msg =
        (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ||
        'Failed to load printable letters. Check your connection and that the server is running.';
      setError(msg);
      setPrintableItems([]);
      setTally({ loaded: 0, totalKnown: false });
    } finally {
      if (fetchRunId.current === runId) {
        setLoading(false);
        setStreaming(false);
      }
    }
  };

  useEffect(() => {
    fetchPrintableItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const filteredItems = printableItems.filter(item => {
    if (filter !== "all" && item.type !== filter) return false;
    // Free-text search across title, subtitle (name / PNR / venue), reference
    // number, and status — client-side, same pattern as My History.
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const ref = (item.data as { referenceNo?: string | null }).referenceNo ?? "";
    return [item.title, item.subtitle, ref, item.status].some((f) =>
      String(f ?? "").toLowerCase().includes(q)
    );
  });

  const { page, setPage, totalPages, rangeStart, rangeEnd, pageItems } = usePagination(filteredItems, 20);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return date.toLocaleDateString();
  };

  const endpointFor = (item: PrintableItem): string | null => {
    if (item.type === 'grievance') return `/pdf/grievance/${item.id}`;
    if (item.type === 'temple') return `/pdf/grievance/${item.id}/temple-visit`;
    if (item.type === 'train') return `/pdf/train-eq/${item.id}`;
    if (item.type === 'tour') return `/pdf/tour-program/${item.id}`;
    return null;
  };

  const filenameFor = (item: PrintableItem): string => {
    if (item.type === 'grievance') return `Grievance_Letter_${item.id}.pdf`;
    if (item.type === 'temple') return `TempleVisit_Letter_${item.id}.pdf`;
    if (item.type === 'train') return `TrainEQ_Letter_${item.id}.pdf`;
    return `Tour_Invitation_${item.id}.pdf`;
  };

  const handleDownloadPDF = async (item: PrintableItem) => {
    try {
      console.log('Downloading PDF for item:', item);
      const endpoint = endpointFor(item);
      if (!endpoint) return;
      await pdfApi.downloadPDF(endpoint, filenameFor(item));
      // Temple-visit download flips the grievance to RESOLVED on the server.
      // Refresh so the row's status badge updates without a manual refresh.
      if (item.type === 'temple') {
        await fetchPrintableItems();
      }
    } catch (error: unknown) {
      console.error('Failed to download PDF:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      push({ type: "error", title: "Error", message: `Failed to download PDF: ${msg}` });
    }
  };

  const handlePreview = async (item: PrintableItem) => {
    setPreviewLoading(true);
    try {
      console.log('Loading preview for item:', item);
      let html: string;
      if (item.type === 'train') {
        html = await pdfApi.previewTrainEQLetter(item.id) as string;
      } else if (item.type === 'grievance') {
        html = await pdfApi.previewGrievanceLetter(item.id) as string;
      } else if (item.type === 'temple') {
        html = await pdfApi.previewTempleVisit(item.id);
      } else if (item.type === 'tour') {
        html = await pdfApi.previewTourProgram(item.id);
      } else {
        setPreviewLoading(false);
        return;
      }
      console.log('Preview HTML loaded, length:', html?.length);
      setPreviewContent(html);
      setPreviewOpen(true);
    } catch (error: unknown) {
      console.error('Failed to load preview:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      push({ type: "error", title: "Error", message: `Failed to load preview: ${msg}` });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePrint = async (item: PrintableItem) => {
    try {
      console.log('Printing item:', item);
      const endpoint = endpointFor(item);
      if (!endpoint) return;

      const res = await http.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      // Printing a temple-visit letter resolves the grievance server-side;
      // refresh so the list reflects the new status.
      if (item.type === 'temple') {
        await fetchPrintableItems();
      }
    } catch (error: unknown) {
      console.error('Failed to print:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      push({ type: "error", title: "Error", message: `Failed to open PDF for printing: ${msg}` });
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'train':
        return <Train className="h-5 w-5 text-indigo-700" />;
      case 'tour':
        return <Calendar className="h-5 w-5 text-indigo-700" />;
      case 'temple':
        return <Landmark className="h-5 w-5 text-orange-700" />;
      default:
        return <FileText className="h-5 w-5 text-indigo-700" />;
    }
  };

  const getItemBadgeColor = (type: string) => {
    switch (type) {
      case 'train':
        return 'bg-blue-100 text-blue-800';
      case 'tour':
        return 'bg-green-100 text-green-800';
      case 'temple':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-amber-100 text-amber-800';
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  Print Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Generate, preview, and print official letters
                </p>
              </div>
              <Button variant="outline" onClick={fetchPrintableItems} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="px-5 py-5 space-y-4">
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by name, PNR, reference no, or event…"
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <Button
                    variant={filter === "all" ? "default" : "outline"}
                    onClick={() => setFilter("all")}
                    className="h-10 w-full justify-center"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    All ({printableItems.length})
                  </Button>
                  <Button
                    variant={filter === "grievance" ? "default" : "outline"}
                    onClick={() => setFilter("grievance")}
                    className="h-10 w-full justify-center"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Grievance Letters ({printableItems.filter(i => i.type === 'grievance').length})
                  </Button>
                  <Button
                    variant={filter === "temple" ? "default" : "outline"}
                    onClick={() => setFilter("temple")}
                    className="h-10 w-full justify-center"
                  >
                    <Landmark className="h-4 w-4 mr-2" />
                    Temple Visit ({printableItems.filter(i => i.type === 'temple').length})
                  </Button>
                  <Button
                    variant={filter === "train" ? "default" : "outline"}
                    onClick={() => setFilter("train")}
                    className="h-10 w-full justify-center"
                  >
                    <Train className="h-4 w-4 mr-2" />
                    Train EQ ({printableItems.filter(i => i.type === 'train').length})
                  </Button>
                  <Button
                    variant={filter === "tour" ? "default" : "outline"}
                    onClick={() => setFilter("tour")}
                    className="h-10 w-full justify-center"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Tour Invitation ({printableItems.filter(i => i.type === 'tour').length})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Letters Queue */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Printable Letters ({filteredItems.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/*
                  Sits ABOVE the loading/empty/rows branch on purpose. The empty
                  state is the single most misleading moment on this page: an
                  admin who searches for an old letter, finds nothing, and is
                  not told the fetch was capped will conclude the letter does
                  not exist. There is no pager here, so a capped source is
                  genuinely unreachable rather than merely further down.
                */}
                {!loading && !error && streaming && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Loaded {tally.loaded.toLocaleString()}
                    {typeof tally.total === 'number' ? ` of ${tally.total.toLocaleString()}` : ''} — still
                    loading older letters, so search and the tab counts are incomplete for a moment.
                  </p>
                )}
                {/* Suppressed while streaming: mid-load every list is legitimately
                    short, and a notice that says so on every page arrival would
                    cry truncation at a list that is about to be complete. */}
                {!loading && !error && !streaming && (
                  <TruncationNotice
                    loaded={tally.loaded}
                    total={tally.total}
                    totalKnown={tally.totalKnown}
                    hint="Narrow the date range to reach older letters — search and the tabs only cover what is loaded."
                  />
                )}
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading...</p>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-destructive font-medium mb-2">{error}</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      If the database is unreachable, check that the Catalyst credentials in the backend are configured correctly.
                    </p>
                    <Button variant="outline" onClick={fetchPrintableItems}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Printer className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No letters ready for printing</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Verified grievances, temple-visit letters, approved train EQ requests, and accepted tour invitations will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    {pageItems.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 hover:bg-indigo-50/40 transition relative z-10"
                      >
                        {/* Left */}
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            {getItemIcon(item.type)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-indigo-900 break-words">
                              {item.title}
                            </p>
                            <p className="text-sm text-muted-foreground break-words">
                              {item.subtitle}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(item.date)}
                            </p>
                          </div>
                        </div>

                        {/* Right */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0 relative z-20">
                          <Badge className={getItemBadgeColor(item.type)}>
                            {item.type === 'grievance'
                              ? 'Grievance'
                              : item.type === 'temple'
                              ? 'Temple Visit'
                              : item.type === 'train'
                              ? 'Train EQ'
                              : 'Tour Invitation'}
                          </Badge>

                          {(item.type === 'train' || item.type === 'grievance' || item.type === 'temple' || item.type === 'tour') && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Preview"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreview(item);
                              }}
                              disabled={previewLoading}
                              className="relative z-20"
                            >
                              <Eye className="h-4 w-4 flex-shrink-0" />
                            </Button>
                          )}

                          <Button 
                            size="icon" 
                            variant="ghost" 
                            title="Download PDF"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadPDF(item);
                            }}
                            className="relative z-20"
                          >
                            <Download className="h-4 w-4 flex-shrink-0" />
                          </Button>

                          <Button
                            size="icon"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white relative z-20"
                            title="Print"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrint(item);
                            }}
                          >
                            <Printer className="h-4 w-4 flex-shrink-0" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      total={filteredItems.length}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      onChange={setPage}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Letter Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Letter Preview
              </DialogTitle>
            </DialogHeader>
            <div 
              className="border rounded-lg p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: previewContent }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
