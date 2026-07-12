import { useEffect, useState } from "react";
import { Train, RefreshCw, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { CardListSkeleton } from "@/components/common/Skeletons";
import { trainRequestApi, type TrainRequest } from "@/lib/api";
import type { CsvColumn } from "@/lib/exportCsv";
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

/**
 * Admin view of Train EQ entries.
 *
 * Train EQ is self-service for staff: they create the entry and print the
 * letter on their own. Admin observes here (no approve/assign flow) but CAN
 * correct any entry via the edit dialog — reprints pick up the corrections.
 */
export default function TrainEQQueue() {
  const [requests, setRequests] = useState<TrainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState("");

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      // limit=200 (was 50) so the log doesn't silently clip older entries;
      // stays under the ZCQL 299-row cap.
      const params: Record<string, string> = { limit: "200" };
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await trainRequestApi.getAll(params);
      setRequests(res.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load train requests";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter, startDate, endDate]);

  // Edit dialog — admin corrections to any Train EQ entry. Same fields as the
  // staff My History edit; the reprint picks the corrections up automatically.
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
      numberOfPassengers: r.numberOfPassengers != null ? String(r.numberOfPassengers) : "",
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
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Client-side text search across the obvious fields (incl. reference number).
  const filteredRequests = requests.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.referenceNo ?? "").toLowerCase().includes(q) ||
      r.passengerName.toLowerCase().includes(q) ||
      r.pnrNumber.toLowerCase().includes(q) ||
      r.fromStation.toLowerCase().includes(q) ||
      r.toStation.toLowerCase().includes(q)
    );
  });

  // CSV export — mirrors the currently filtered/visible rows.
  const csvColumns: CsvColumn<TrainRequest>[] = [
    { header: "Reference No", value: (r) => r.referenceNo ?? "" },
    { header: "Passenger", value: (r) => r.passengerName },
    { header: "PNR", value: (r) => r.pnrNumber },
    { header: "Contact", value: (r) => r.contactNumber },
    { header: "Train Name", value: (r) => r.trainName },
    { header: "Train No", value: (r) => r.trainNumber },
    { header: "Class", value: (r) => r.journeyClass },
    { header: "Journey Date", value: (r) => r.dateOfJourney },
    { header: "From", value: (r) => r.fromStation },
    { header: "To", value: (r) => r.toStation },
    { header: "Status", value: (r) => r.status },
    { header: "Created By", value: (r) => r.createdBy?.name },
    { header: "Created", value: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  // Client-side pagination — 10 rows per page, over the searched/filtered rows.
  const pager = usePagination(filteredRequests, 10);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Train EQ Requests
              </h1>
              <p className="text-sm text-muted-foreground">
                Log of staff-generated emergency quota letters — click the pencil to correct an entry
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2 shrink-0">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search ref no, passenger, PNR, station…"
                className="w-[240px]"
              />
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <div className="w-[160px]">
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
              <ExportCsvButton
                rows={filteredRequests}
                columns={csvColumns}
                filename="train-eq-requests"
              />
              <Button variant="outline" onClick={fetchRequests} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
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
                {statusFilter === "ALL" ? "All" : statusFilter} EQ Requests ({filteredRequests.length})
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <CardListSkeleton rows={5} />
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No train EQ requests in this filter.</p>
                </div>
              ) : (
                pager.pageItems.map((r) => (
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
                        PNR: {r.pnrNumber} • {r.fromStation} → {r.toStation} • {formatDate(r.dateOfJourney)} • {r.journeyClass}
                      </p>
                      {r.contactNumber && (
                        <p className="text-xs text-indigo-700 font-medium">Contact: {r.contactNumber}</p>
                      )}
                      {r.trainName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          🚂 {r.trainNumber} - {r.trainName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created by: {r.createdBy?.name || 'Unknown'} • {formatDate(r.createdAt)}
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
        <Dialog open={!!editReq} onOpenChange={(open) => { if (!open) setEditReq(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Train EQ — {editReq?.referenceNo ?? editReq?.passengerName}</DialogTitle>
              <DialogDescription>
                Correct the details below; a reprint of the letter uses the corrected values.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Passenger Name</Label>
                <Input value={editForm.passengerName ?? ""} onChange={(e) => editChange("passengerName", e.target.value)} />
              </div>
              <div>
                <Label>PNR Number</Label>
                <Input value={editForm.pnrNumber ?? ""} onChange={(e) => editChange("pnrNumber", e.target.value)} />
              </div>
              <div>
                <Label>Train Name</Label>
                <Input value={editForm.trainName ?? ""} onChange={(e) => editChange("trainName", e.target.value)} />
              </div>
              <div>
                <Label>Train Number</Label>
                <Input value={editForm.trainNumber ?? ""} onChange={(e) => editChange("trainNumber", e.target.value)} />
              </div>
              <div>
                <Label>Class</Label>
                <Select value={editForm.journeyClass ?? ""} onValueChange={(v) => editChange("journeyClass", v)}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {JOURNEY_CLASSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date of Journey</Label>
                <Input type="date" value={editForm.dateOfJourney ?? ""} onChange={(e) => editChange("dateOfJourney", e.target.value)} />
              </div>
              <div>
                <Label>From Station</Label>
                <Input value={editForm.fromStation ?? ""} onChange={(e) => editChange("fromStation", e.target.value)} />
              </div>
              <div>
                <Label>To Station</Label>
                <Input value={editForm.toStation ?? ""} onChange={(e) => editChange("toStation", e.target.value)} />
              </div>
              <div>
                <Label>Boarding Point</Label>
                <Input value={editForm.boardingPoint ?? ""} onChange={(e) => editChange("boardingPoint", e.target.value)} />
              </div>
              <div>
                <Label>Contact Number</Label>
                <Input value={editForm.contactNumber ?? ""} onChange={(e) => editChange("contactNumber", e.target.value)} maxLength={10} />
              </div>
              <div>
                <Label>Number of Passengers</Label>
                <Input type="number" min={1} value={editForm.numberOfPassengers ?? ""} onChange={(e) => editChange("numberOfPassengers", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Remarks</Label>
                <Textarea value={editForm.remarks ?? ""} onChange={(e) => editChange("remarks", e.target.value)} className="min-h-[70px]" />
              </div>
            </div>
            {editError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditReq(null)} disabled={editSaving}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={editSaving} className="bg-indigo-600 hover:bg-indigo-700">
                {editSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
