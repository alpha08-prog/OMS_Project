import { useEffect, useState } from "react";
import { Train, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { trainRequestApi, type TrainRequest } from "@/lib/api";
import type { CsvColumn } from "@/lib/exportCsv";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Read-only admin view of Train EQ entries.
 *
 * Train EQ is now self-service for staff: they create the entry and print
 * the letter on their own. Admin observes here but no longer approves /
 * assigns / generates the PDF themselves.
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
      const params: Record<string, string> = { limit: "50" };
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
                Read-only log of staff-generated emergency quota letters
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
                <p className="text-muted-foreground text-center py-8">Loading requests...</p>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No train EQ requests in this filter.</p>
                </div>
              ) : (
                filteredRequests.map((r) => (
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
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
