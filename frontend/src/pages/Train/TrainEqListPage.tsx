import { useCallback, useEffect, useRef, useState } from "react";
import { Train, RefreshCw, Pencil, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { CursorPagination, useCursorPager } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { CardListSkeleton } from "@/components/common/Skeletons";
import { trainRequestApi, type TrainRequest } from "@/lib/api";
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

// Same class codes as the Train EQ create form / My History edit.
const JOURNEY_CLASSES = [
  { value: "1A", label: "1A - First AC" },
  { value: "2A", label: "2A - Second AC" },
  { value: "3A", label: "3A - Third AC" },
  { value: "SL", label: "SL - Sleeper" },
  { value: "CC", label: "CC - Chair Car" },
  { value: "EC", label: "EC - Executive Chair" },
];

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

interface TrainEqListPageProps {
  /** Admin sees every entry; staff see only their own (scoped server-side). */
  scope: "admin" | "staff";
}

/**
 * Train EQ list — server-paged.
 *
 * Shared by the admin log and the staff "My Train EQ" page. The backend scopes
 * rows by role, so the only real difference is copy and whether the edit
 * affordance is framed as a correction or your own entry.
 *
 * Paging, searching and filtering all happen on the SERVER. That is the point:
 * the previous version fetched a hardcoded 200 rows and did everything in
 * memory, so entry 201 was unreachable and a search for an old PNR confidently
 * reported "no results" for a record that existed.
 */
export default function TrainEqListPage({ scope }: TrainEqListPageProps) {
  const [requests, setRequests] = useState<TrainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  // Two search states: what's typed, and what's been sent. Debouncing the
  // second keeps every keystroke from becoming a request.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [meta, setMeta] = useState<{
    total?: number;
    totalKnown?: boolean;
    hasMore?: boolean;
    nextCursor?: string | null;
  }>({});

  // Any change to the query invalidates the cursor stack — a cursor is only
  // meaningful against the filters that produced it.
  const pager = useCursorPager([statusFilter, startDate, endDate, search, sort]);
  const { cursor } = pager;

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const buildParams = useCallback(() => {
    const params: Record<string, string> = { sort };
    if (statusFilter !== "ALL") params.status = statusFilter;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (search) params.search = search;
    return params;
  }, [statusFilter, startDate, endDate, search, sort]);

  // Guards against out-of-order responses: type fast or click Next twice and a
  // slow earlier request can land after a newer one, painting the wrong page.
  const requestSeq = useRef(0);

  const fetchRequests = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        ...buildParams(),
        limit: String(PAGE_SIZE),
      };
      if (cursor) params.cursor = cursor;

      const res = await trainRequestApi.getAll(params);
      if (seq !== requestSeq.current) return; // a newer request won
      setRequests(Array.isArray(res.data) ? res.data : []);
      setMeta({
        total: res.meta?.total,
        totalKnown: res.meta?.totalKnown,
        hasMore: res.meta?.hasMore,
        nextCursor: res.meta?.nextCursor,
      });
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Failed to load train requests");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [buildParams, cursor]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      // Exports the whole filtered set from the server, not just this page.
      await trainRequestApi.exportCsv(buildParams());
    } catch {
      setError("Export failed. Try narrowing the date range.");
    } finally {
      setExporting(false);
    }
  };

  // ── Edit dialog ───────────────────────────────────────────────────────────
  const [editReq, setEditReq] = useState<TrainRequest | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (r: TrainRequest) => {
    setEditError(null);
    setEditForm({
      passengerName: r.passengerName ?? "",
      pnrNumber: r.pnrNumber ?? "",
      trainName: r.trainName ?? "",
      trainNumber: r.trainNumber ?? "",
      journeyClass: r.journeyClass ?? "",
      dateOfJourney: r.dateOfJourney ? String(r.dateOfJourney).slice(0, 10) : "",
      fromStation: r.fromStation ?? "",
      toStation: r.toStation ?? "",
      boardingPoint: r.boardingPoint ?? "",
      contactNumber: r.contactNumber ?? "",
      numberOfPassengers:
        r.numberOfPassengers != null ? String(r.numberOfPassengers) : "",
      remarks: r.remarks ?? "",
    });
    setEditReq(r);
  };

  const editChange = (field: string, value: string) =>
    setEditForm((p) => ({ ...p, [field]: value }));

  const saveEdit = async () => {
    if (!editReq) return;
    if (!editForm.passengerName.trim() || !editForm.pnrNumber.trim()) {
      setEditError("Passenger name and PNR number are required.");
      return;
    }
    const passengerCount = editForm.numberOfPassengers.trim();
    const parsedCount = passengerCount === "" ? undefined : Number(passengerCount);
    if (parsedCount !== undefined && (!Number.isFinite(parsedCount) || parsedCount < 1)) {
      setEditError("Number of passengers must be a positive number.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await trainRequestApi.update(editReq.id, {
        passengerName: editForm.passengerName,
        pnrNumber: editForm.pnrNumber,
        trainName: editForm.trainName || undefined,
        trainNumber: editForm.trainNumber || undefined,
        journeyClass: editForm.journeyClass || undefined,
        dateOfJourney: editForm.dateOfJourney
          ? new Date(editForm.dateOfJourney).toISOString()
          : undefined,
        fromStation: editForm.fromStation,
        toStation: editForm.toStation,
        boardingPoint: editForm.boardingPoint || undefined,
        contactNumber: editForm.contactNumber || undefined,
        numberOfPassengers: parsedCount,
        remarks: editForm.remarks || undefined,
      });
      setEditReq(null);
      fetchRequests();
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const isAdmin = scope === "admin";
  const heading = isAdmin ? "Train EQ Requests" : "My Train EQ Requests";
  const subheading = isAdmin
    ? "Log of staff-generated emergency quota letters — click the pencil to correct an entry"
    : "Every emergency quota letter you have created — click the pencil to correct one";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">{heading}</h1>
              <p className="text-sm text-muted-foreground">{subheading}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2 shrink-0">
              <SearchBar
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={() => setSearch(searchInput.trim())}
                placeholder="Search ref no, passenger, PNR…"
                className="w-[240px]"
              />
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <div className="w-[150px]">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/*
                Sort is how you reach the far end of the table. The oldest
                record is row 1 of an oldest-first list, so "show me the very
                first entry" costs one query no matter how many rows exist.
              */}
              <div className="w-[150px]">
                <Select
                  value={sort}
                  onValueChange={(v) => setSort(v as "newest" | "oldest")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Exporting…" : "Export CSV"}
              </Button>
              <Button variant="outline" onClick={fetchRequests} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              ❌ {error}
            </div>
          )}

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>
                {statusFilter === "ALL" ? "All" : statusFilter} EQ Requests
                {/*
                  Only ever show a count the server actually computed. The old
                  header printed the number of rows it happened to have loaded,
                  which read as a total and wasn't one.
                */}
                {meta.totalKnown !== false && typeof meta.total === "number"
                  ? ` (${meta.total.toLocaleString()})`
                  : ""}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <CardListSkeleton rows={5} />
              ) : requests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {search
                      ? `No train EQ requests match "${search}".`
                      : "No train EQ requests in this filter."}
                  </p>
                </div>
              ) : (
                requests.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-4 p-4 rounded-xl border bg-white"
                  >
                    <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                      <Train className="h-5 w-5 text-indigo-700" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-medium flex flex-wrap items-center gap-2">
                        <span>{r.passengerName}</span>
                        {r.referenceNo && (
                          <span className="font-mono text-xs font-normal text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                            {r.referenceNo}
                          </span>
                        )}
                        <Badge variant="outline">{r.status}</Badge>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        PNR: {r.pnrNumber} • {r.fromStation} → {r.toStation} •{" "}
                        {formatDate(r.dateOfJourney)} • {r.journeyClass}
                      </p>
                      {r.contactNumber && (
                        <p className="text-xs text-indigo-700 font-medium">
                          Contact: {r.contactNumber}
                        </p>
                      )}
                      {r.trainName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          🚂 {r.trainNumber} - {r.trainName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created by: {r.createdBy?.name || "Unknown"} •{" "}
                        {formatDate(r.createdAt)}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      title="Edit"
                      className="shrink-0"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}

              <CursorPagination
                pageIndex={pager.pageIndex}
                count={requests.length}
                canPrev={pager.canPrev}
                hasNext={Boolean(meta.hasMore && meta.nextCursor)}
                total={meta.total}
                totalKnown={meta.totalKnown}
                onPrev={pager.prev}
                onNext={() => meta.nextCursor && pager.next(meta.nextCursor)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog
          open={!!editReq}
          onOpenChange={(open) => {
            if (!open) setEditReq(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit Train EQ — {editReq?.referenceNo ?? editReq?.passengerName}
              </DialogTitle>
              <DialogDescription>
                Correct the details below; a reprint of the letter uses the corrected values.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Passenger Name</Label>
                <Input
                  value={editForm.passengerName ?? ""}
                  onChange={(e) => editChange("passengerName", e.target.value)}
                />
              </div>
              <div>
                <Label>PNR Number</Label>
                <Input
                  value={editForm.pnrNumber ?? ""}
                  onChange={(e) => editChange("pnrNumber", e.target.value)}
                />
              </div>
              <div>
                <Label>Train Name</Label>
                <Input
                  value={editForm.trainName ?? ""}
                  onChange={(e) => editChange("trainName", e.target.value)}
                />
              </div>
              <div>
                <Label>Train Number</Label>
                <Input
                  value={editForm.trainNumber ?? ""}
                  onChange={(e) => editChange("trainNumber", e.target.value)}
                />
              </div>
              <div>
                <Label>Class</Label>
                <Select
                  value={editForm.journeyClass ?? ""}
                  onValueChange={(v) => editChange("journeyClass", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOURNEY_CLASSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date of Journey</Label>
                <Input
                  type="date"
                  value={editForm.dateOfJourney ?? ""}
                  onChange={(e) => editChange("dateOfJourney", e.target.value)}
                />
              </div>
              <div>
                <Label>From Station</Label>
                <Input
                  value={editForm.fromStation ?? ""}
                  onChange={(e) => editChange("fromStation", e.target.value)}
                />
              </div>
              <div>
                <Label>To Station</Label>
                <Input
                  value={editForm.toStation ?? ""}
                  onChange={(e) => editChange("toStation", e.target.value)}
                />
              </div>
              <div>
                <Label>Boarding Point</Label>
                <Input
                  value={editForm.boardingPoint ?? ""}
                  onChange={(e) => editChange("boardingPoint", e.target.value)}
                />
              </div>
              <div>
                <Label>Contact Number</Label>
                <Input
                  value={editForm.contactNumber ?? ""}
                  onChange={(e) => editChange("contactNumber", e.target.value)}
                  maxLength={10}
                />
              </div>
              <div>
                <Label>Number of Passengers</Label>
                <Input
                  type="number"
                  min={1}
                  value={editForm.numberOfPassengers ?? ""}
                  onChange={(e) => editChange("numberOfPassengers", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Remarks</Label>
                <Textarea
                  value={editForm.remarks ?? ""}
                  onChange={(e) => editChange("remarks", e.target.value)}
                  className="min-h-[70px]"
                />
              </div>
            </div>
            {editError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setEditReq(null)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={editSaving}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
