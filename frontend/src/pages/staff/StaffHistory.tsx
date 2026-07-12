import { useCallback, useEffect, useMemo, useState } from "react";
import {
  grievanceApi,
  trainRequestApi,
  tourProgramApi,
  type Grievance,
  type TrainRequest,
  type TourProgram,
  type CreateGrievanceRequest,
  type GrievanceType,
  type GrievancePriority,
  type GrievanceStatus,
} from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import type { CsvColumn } from "@/lib/exportCsv";
import { TableSkeleton } from "@/components/common/Skeletons";
import {
  History,
  FileCheck,
  Train,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  Eye,
  Pencil,
} from "lucide-react";

const GRIEVANCE_TYPES: GrievanceType[] = [
  "WATER", "ROAD", "POLICE", "HEALTH", "TRANSFER", "FINANCIAL_AID",
  "ELECTRICITY", "EDUCATION", "HOUSING", "TEMPLE_VISIT", "OTHER",
];
const GRIEVANCE_STATUSES: GrievanceStatus[] = [
  "OPEN", "IN_PROGRESS", "VERIFIED", "RESOLVED", "REJECTED",
];
const GRIEVANCE_PRIORITIES: GrievancePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Same class codes as the Train EQ create form.
const JOURNEY_CLASSES = [
  { value: "1A", label: "1A - First AC" },
  { value: "2A", label: "2A - Second AC" },
  { value: "3A", label: "3A - Third AC" },
  { value: "SL", label: "SL - Sleeper" },
  { value: "CC", label: "CC - Chair Car" },
  { value: "EC", label: "EC - Executive Chair" },
];

/** ISO string → value a datetime-local input expects (local time, no seconds). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type SubmissionItem = {
  id: string;
  type: 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM';
  referenceNo?: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  details: Grievance | TrainRequest | TourProgram;
};

export default function StaffHistory() {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<SubmissionItem | null>(null);

  // Inline edit (grievance / tour) — same capability as the Old Grievance page.
  const [editItem, setEditItem] = useState<SubmissionItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Client-side text filter over reference no / title / description.
  const filteredSubmissions = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return submissions;
    return submissions.filter((item) =>
      [item.referenceNo, item.title, item.description].some((field) =>
        (field ?? "").toLowerCase().includes(s)
      )
    );
  }, [submissions, search]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Sort the filtered rows before they're paginated (don't mutate the source).
  const sortedSubmissions = sortKey
    ? [...filteredSubmissions].sort((a, b) => {
        let c: number;
        if (sortKey === "createdAt") {
          c = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        } else {
          const av = sortKey === "type" ? a.type : a.status;
          const bv = sortKey === "type" ? b.type : b.status;
          c = av.toString().localeCompare(bv.toString(), undefined, { numeric: true });
        }
        return sortDir === "asc" ? c : -c;
      })
    : filteredSubmissions;

  const csvColumns: CsvColumn<SubmissionItem>[] = [
    { header: "Reference No", value: (r) => r.referenceNo ?? "" },
    { header: "Type", value: (r) => r.type },
    { header: "Title", value: (r) => r.title },
    { header: "Description", value: (r) => r.description },
    { header: "Status", value: (r) => r.status },
    { header: "Created", value: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  // Client-side pagination — 10 rows per page; pager.setPage on Prev/Next.
  const pager = usePagination(sortedSubmissions, 10);

  // Status options keyed by type
  const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
    ALL: [
      { value: "ALL", label: "All Statuses" },
      { value: "OPEN", label: "Open" },
      { value: "PENDING", label: "Pending" },
      { value: "IN_PROGRESS", label: "In Progress" },
      { value: "RESOLVED", label: "Resolved" },
      { value: "APPROVED", label: "Approved" },
      { value: "ACCEPTED", label: "Accepted" },
      { value: "REGRET", label: "Regret" },
      { value: "REJECTED", label: "Rejected" },
    ],
    GRIEVANCE: [
      { value: "ALL", label: "All Statuses" },
      { value: "OPEN", label: "Open" },
      { value: "IN_PROGRESS", label: "In Progress" },
      { value: "VERIFIED", label: "Verified" },
      { value: "RESOLVED", label: "Resolved" },
      { value: "REJECTED", label: "Rejected" },
    ],
    TRAIN_REQUEST: [
      { value: "ALL", label: "All Statuses" },
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "REJECTED", label: "Rejected" },
      { value: "RESOLVED", label: "Resolved" },
    ],
    TOUR_PROGRAM: [
      { value: "ALL", label: "All Statuses" },
      { value: "PENDING", label: "Pending" },
      { value: "ACCEPTED", label: "Accepted" },
      { value: "REGRET", label: "Regret" },
    ],
  };

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    setStatusFilter("ALL"); // reset status when type changes
  };

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const items: SubmissionItem[] = [];

      // Fetch grievances created by current user
      if (typeFilter === "ALL" || typeFilter === "GRIEVANCE") {
        try {
          const grievanceRes = await grievanceApi.getAll({ limit: '100' });
          console.log('StaffHistory - Grievances response:', grievanceRes);
          const grievances = Array.isArray(grievanceRes?.data) ? grievanceRes.data : [];
          
          // Get current user ID from localStorage
          const userStr = localStorage.getItem('user');
          let currentUserId: string | null = null;
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              currentUserId = user.id;
            } catch {
              // ignore
            }
          }

          grievances.forEach((g: Grievance) => {
            // Filter by current user if we have user ID, otherwise show all (API should filter)
            if (!currentUserId || g.createdBy?.id === currentUserId || g.createdById === currentUserId) {
              items.push({
                id: g.id,
                type: 'GRIEVANCE',
                referenceNo: g.referenceNo,
                title: `Grievance - ${g.grievanceType.replace(/_/g, ' ')}`,
                description: `${g.petitionerName} • ${g.constituency}`,
                status: g.status,
                createdAt: g.createdAt,
                details: g,
              });
            }
          });
        } catch (error: unknown) {
          console.error('Failed to fetch grievances:', error);
        }
      }

      // Fetch train requests created by current user
      if (typeFilter === "ALL" || typeFilter === "TRAIN_REQUEST") {
        try {
          const trainRes = await trainRequestApi.getAll({ limit: '100' });
          console.log('StaffHistory - Train requests response:', trainRes);
          const trainRequests = Array.isArray(trainRes?.data) ? trainRes.data : [];
          
          const userStr = localStorage.getItem('user');
          let currentUserId: string | null = null;
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              currentUserId = user.id;
            } catch {
              // ignore
            }
          }

          trainRequests.forEach((t: TrainRequest) => {
            if (!currentUserId || t.createdBy?.id === currentUserId || t.createdById === currentUserId) {
              items.push({
                id: t.id,
                type: 'TRAIN_REQUEST',
                title: `Train EQ - ${t.trainName || t.trainNumber || 'N/A'}`,
                description: `${t.passengerName} • PNR: ${t.pnrNumber}`,
                status: t.status,
                createdAt: t.createdAt,
                details: t,
              });
            }
          });
        } catch (error: unknown) {
          console.error('Failed to fetch train requests:', error);
        }
      }

      // Fetch tour programs created by current user
      if (typeFilter === "ALL" || typeFilter === "TOUR_PROGRAM") {
        try {
          const tourRes = await tourProgramApi.getAll({ limit: '100' });
          console.log('StaffHistory - Tour programs response:', tourRes);
          const tourPrograms = Array.isArray(tourRes?.data) ? tourRes.data : [];
          
          const userStr = localStorage.getItem('user');
          let currentUserId: string | null = null;
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              currentUserId = user.id;
            } catch {
              // ignore
            }
          }

          tourPrograms.forEach((tp: TourProgram) => {
            if (!currentUserId || tp.createdBy?.id === currentUserId || tp.createdById === currentUserId) {
              items.push({
                id: tp.id,
                type: 'TOUR_PROGRAM',
                title: `Tour - ${tp.eventName}`,
                description: `${tp.organizer} • ${tp.venue}`,
                status: tp.decision || 'PENDING',
                createdAt: tp.createdAt,
                details: tp,
              });
            }
          });
        } catch (error: unknown) {
          console.error('Failed to fetch tour programs:', error);
        }
      }

      // Apply status filter
      let filteredItems = items;
      if (statusFilter !== "ALL") {
        filteredItems = items.filter(item => item.status === statusFilter);
      }

      // Apply date filter
      if (startDate || endDate) {
        filteredItems = filteredItems.filter(item => {
          const itemDate = new Date(item.createdAt);
          if (startDate && itemDate < new Date(startDate)) return false;
          if (endDate && itemDate > new Date(endDate)) return false;
          return true;
        });
      }

      // Sort by date descending
      filteredItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log('StaffHistory - Final submissions:', filteredItems);
      setSubmissions(filteredItems);
    } catch (error: unknown) {
      console.error("Error fetching submissions:", error);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate, statusFilter, typeFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Tours and Train EQ requests are editable (corrections for typos in PNR /
  // name / date before reprinting the letter); grievances are editable only
  // when PUBLIC. Office grievances are admin-managed (Office Tasks page) —
  // staff cannot edit them.
  const isEditable = (item: SubmissionItem) => {
    if (item.type === "TOUR_PROGRAM") return true;
    if (item.type === "TRAIN_REQUEST") return true;
    if (item.type === "GRIEVANCE") {
      return (item.details as Grievance).source !== "OFFICE";
    }
    return false;
  };

  const openEdit = (item: SubmissionItem) => {
    setEditError(null);
    if (item.type === "GRIEVANCE") {
      const g = item.details as Grievance;
      setEditForm({
        petitionerName: g.petitionerName ?? "",
        mobileNumber: g.mobileNumber ?? "",
        constituency: g.constituency ?? "",
        wardVillage: g.wardVillage ?? "",
        grievanceType: g.grievanceType ?? "",
        description: g.description ?? "",
        monetaryValue: g.monetaryValue != null ? String(g.monetaryValue) : "",
        status: g.status ?? "",
        priority: g.priority ?? "MEDIUM",
      });
    } else if (item.type === "TRAIN_REQUEST") {
      const t = item.details as TrainRequest;
      setEditForm({
        passengerName: t.passengerName ?? "",
        pnrNumber: t.pnrNumber ?? "",
        trainName: t.trainName ?? "",
        trainNumber: t.trainNumber ?? "",
        journeyClass: t.journeyClass ?? "",
        // Catalyst "YYYY-MM-DD HH:mm:ss" or ISO → the date part for <input type="date">
        dateOfJourney: t.dateOfJourney ? String(t.dateOfJourney).slice(0, 10) : "",
        fromStation: t.fromStation ?? "",
        toStation: t.toStation ?? "",
        boardingPoint: t.boardingPoint ?? "",
        contactNumber: t.contactNumber ?? "",
        numberOfPassengers: t.numberOfPassengers != null ? String(t.numberOfPassengers) : "",
        remarks: t.remarks ?? "",
      });
    } else if (item.type === "TOUR_PROGRAM") {
      const tp = item.details as TourProgram;
      setEditForm({
        eventName: tp.eventName ?? "",
        organizer: tp.organizer ?? "",
        organizerPhone: tp.organizerPhone ?? "",
        organizerEmail: tp.organizerEmail ?? "",
        dateTime: toLocalInput(tp.dateTime),
        venue: tp.venue ?? "",
        venueLink: tp.venueLink ?? "",
        description: tp.description ?? "",
        referencedBy: tp.referencedBy ?? "",
      });
    }
    setEditItem(item);
  };

  const editChange = (field: string, value: string) =>
    setEditForm((p) => ({ ...p, [field]: value }));

  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    setEditError(null);
    try {
      if (editItem.type === "GRIEVANCE") {
        const monetary = editForm.monetaryValue.trim();
        const parsed = monetary === "" ? undefined : Number(monetary);
        if (parsed !== undefined && !Number.isFinite(parsed)) {
          setEditError("Monetary value must be a valid number.");
          setEditSaving(false);
          return;
        }
        const payload: Partial<CreateGrievanceRequest> & { status?: GrievanceStatus } = {
          petitionerName: editForm.petitionerName,
          mobileNumber: editForm.mobileNumber,
          constituency: editForm.constituency,
          wardVillage: editForm.wardVillage,
          grievanceType: editForm.grievanceType as GrievanceType,
          description: editForm.description,
          priority: editForm.priority as GrievancePriority,
          status: editForm.status as GrievanceStatus,
          monetaryValue: parsed,
        };
        await grievanceApi.update(editItem.id, payload);
      } else if (editItem.type === "TRAIN_REQUEST") {
        if (!editForm.passengerName.trim() || !editForm.pnrNumber.trim()) {
          setEditError("Passenger name and PNR number are required.");
          setEditSaving(false);
          return;
        }
        const passengerCount = editForm.numberOfPassengers.trim();
        const parsedCount = passengerCount === "" ? undefined : Number(passengerCount);
        if (parsedCount !== undefined && (!Number.isFinite(parsedCount) || parsedCount < 1)) {
          setEditError("Number of passengers must be a positive number.");
          setEditSaving(false);
          return;
        }
        await trainRequestApi.update(editItem.id, {
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
      } else if (editItem.type === "TOUR_PROGRAM") {
        await tourProgramApi.update(editItem.id, {
          eventName: editForm.eventName,
          organizer: editForm.organizer,
          organizerPhone: editForm.organizerPhone || undefined,
          organizerEmail: editForm.organizerEmail || undefined,
          dateTime: editForm.dateTime ? new Date(editForm.dateTime).toISOString() : undefined,
          venue: editForm.venue,
          venueLink: editForm.venueLink || undefined,
          description: editForm.description || undefined,
          referencedBy: editForm.referencedBy || undefined,
        });
      }
      setEditItem(null);
      await fetchSubmissions();
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "GRIEVANCE":
        return <FileCheck className="h-4 w-4 text-indigo-600" />;
      case "TRAIN_REQUEST":
        return <Train className="h-4 w-4 text-purple-600" />;
      case "TOUR_PROGRAM":
        return <Calendar className="h-4 w-4 text-amber-600" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      RESOLVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      ACCEPTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      VERIFIED: "bg-teal-100 text-teal-700 border-teal-200",
      REJECTED: "bg-red-100 text-red-700 border-red-200",
      REGRET: "bg-amber-100 text-amber-700 border-amber-200",
      IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
      PENDING: "bg-gray-100 text-gray-700 border-gray-200",
      OPEN: "bg-yellow-100 text-yellow-700 border-yellow-200",
    };
    return (
      <Badge className={variants[status] || "bg-gray-100 text-gray-700"} variant="outline">
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <History className="h-5 w-5 text-indigo-700" />
                </div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  My Submissions
                </h1>
              </div>
              <p className="text-sm text-muted-foreground ml-12">
                View all your submitted grievances, train requests, and tour programs
              </p>
            </div>
            <Button variant="outline" onClick={fetchSubmissions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-indigo-900 flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Type</label>
                  <Select value={typeFilter} onValueChange={handleTypeChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="GRIEVANCE">Grievances</SelectItem>
                      <SelectItem value="TRAIN_REQUEST">Train Requests</SelectItem>
                      <SelectItem value="TOUR_PROGRAM">Tour Programs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(STATUS_OPTIONS[typeFilter] ?? STATUS_OPTIONS.ALL).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm text-muted-foreground mb-1 block">Date Range</label>
                  <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search title or description"
                  className="w-full sm:w-64"
                />
                <ExportCsvButton
                  rows={filteredSubmissions}
                  columns={csvColumns}
                  filename="my-history"
                  className="sm:ml-auto"
                />
              </div>
            </CardContent>
          </Card>

          {/* Submissions Table */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-indigo-900">Submissions ({filteredSubmissions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : filteredSubmissions.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No submissions found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => toggleSort("type")}
                          >
                            Type{sortKey === "type" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                          </TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => toggleSort("status")}
                          >
                            Status{sortKey === "status" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => toggleSort("createdAt")}
                          >
                            Date/Time{sortKey === "createdAt" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                          </TableHead>
                          <TableHead className="text-right">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pager.pageItems.map((item) => (
                          <TableRow key={`${item.type}-${item.id}`} className="hover:bg-indigo-50/50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTypeIcon(item.type)}
                                <span className="text-sm">{item.type.replace(/_/g, " ")}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium max-w-[220px]">
                              <div className="truncate">{item.title}</div>
                              {item.referenceNo && (
                                <span className="font-mono text-[11px] text-indigo-700">
                                  {item.referenceNo}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px] truncate">
                              {item.description}
                            </TableCell>
                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(item.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedItem(item)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {isEditable(item) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openEdit(item)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination
                    page={pager.page}
                    totalPages={pager.totalPages}
                    total={pager.total}
                    rangeStart={pager.rangeStart}
                    rangeEnd={pager.rangeEnd}
                    onChange={pager.setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Dialog */}
        {selectedItem && (() => {
          const HIDDEN_KEYS = new Set([
            "id",
            "createdAt",
            "updatedAt",
            "createdBy",
            "createdById",
            "approvedBy",
            "approvedById",
            "train_passengers",
            "trainPassengers",
            "passengers",
            "lastEditedBy",
            "lastEditedById",
            "lastEditedAt",
          ]);
          const audit = selectedItem.details as { lastEditedBy?: { name?: string } | null; lastEditedAt?: string | null };
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedItem(null)}>
              <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{selectedItem.title}</h3>
                  <div className="flex items-center gap-1">
                    {isEditable(selectedItem) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { const it = selectedItem; setSelectedItem(null); openEdit(it); }}
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>×</Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {getStatusBadge(selectedItem.status)}
                    <span className="text-muted-foreground text-sm">
                      {formatDate(selectedItem.createdAt)}
                    </span>
                  </div>
                  {audit.lastEditedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last edited by {audit.lastEditedBy?.name ?? "Unknown"} on{" "}
                      {formatDate(audit.lastEditedAt)}
                    </p>
                  )}
                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {Object.entries(selectedItem.details).map(([key, value]) => {
                      if (value === null || value === undefined || value === "" || HIDDEN_KEYS.has(key)) return null;
                      if (typeof value === "object") return null;
                      const label = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase());
                      const isLikelyIsoDateString = (val: unknown): val is string =>
                        typeof val === 'string' && /\d{4}-\d{2}-\d{2}T/.test(val);
                      const displayValue = isLikelyIsoDateString(value)
                        ? formatDate(value)
                        : String(value);
                      return (
                        <div key={key} className="min-w-0">
                          <p className="text-muted-foreground text-xs uppercase tracking-wider">
                            {label}
                          </p>
                          <p className="font-medium break-words">{displayValue}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Edit Dialog (grievance / train EQ / tour) */}
        {editItem && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setEditItem(null)}
          >
            <div
              className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit {editItem.title}</h3>
                <Button variant="ghost" size="sm" onClick={() => setEditItem(null)}>×</Button>
              </div>

              {editItem.type === "GRIEVANCE" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Petitioner Name</Label>
                    <Input value={editForm.petitionerName} onChange={(e) => editChange("petitionerName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Mobile Number</Label>
                    <Input value={editForm.mobileNumber} onChange={(e) => editChange("mobileNumber", e.target.value)} maxLength={10} />
                  </div>
                  <div>
                    <Label>Constituency</Label>
                    <Input value={editForm.constituency} onChange={(e) => editChange("constituency", e.target.value)} />
                  </div>
                  <div>
                    <Label>Ward / Village</Label>
                    <Input value={editForm.wardVillage} onChange={(e) => editChange("wardVillage", e.target.value)} />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={editForm.grievanceType} onValueChange={(v) => editChange("grievanceType", v)}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {GRIEVANCE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Monetary Value</Label>
                    <Input type="number" value={editForm.monetaryValue} onChange={(e) => editChange("monetaryValue", e.target.value)} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => editChange("status", v)}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        {GRIEVANCE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={editForm.priority} onValueChange={(v) => editChange("priority", v)}>
                      <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                      <SelectContent>
                        {GRIEVANCE_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea value={editForm.description} onChange={(e) => editChange("description", e.target.value)} className="min-h-[90px]" />
                  </div>
                </div>
              ) : editItem.type === "TRAIN_REQUEST" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Passenger Name</Label>
                    <Input value={editForm.passengerName} onChange={(e) => editChange("passengerName", e.target.value)} />
                  </div>
                  <div>
                    <Label>PNR Number</Label>
                    <Input value={editForm.pnrNumber} onChange={(e) => editChange("pnrNumber", e.target.value)} />
                  </div>
                  <div>
                    <Label>Train Name</Label>
                    <Input value={editForm.trainName} onChange={(e) => editChange("trainName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Train Number</Label>
                    <Input value={editForm.trainNumber} onChange={(e) => editChange("trainNumber", e.target.value)} />
                  </div>
                  <div>
                    <Label>Class</Label>
                    <Select value={editForm.journeyClass} onValueChange={(v) => editChange("journeyClass", v)}>
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
                    <Input type="date" value={editForm.dateOfJourney} onChange={(e) => editChange("dateOfJourney", e.target.value)} />
                  </div>
                  <div>
                    <Label>From Station</Label>
                    <Input value={editForm.fromStation} onChange={(e) => editChange("fromStation", e.target.value)} />
                  </div>
                  <div>
                    <Label>To Station</Label>
                    <Input value={editForm.toStation} onChange={(e) => editChange("toStation", e.target.value)} />
                  </div>
                  <div>
                    <Label>Boarding Point</Label>
                    <Input value={editForm.boardingPoint} onChange={(e) => editChange("boardingPoint", e.target.value)} />
                  </div>
                  <div>
                    <Label>Contact Number</Label>
                    <Input value={editForm.contactNumber} onChange={(e) => editChange("contactNumber", e.target.value)} maxLength={10} />
                  </div>
                  <div>
                    <Label>Number of Passengers</Label>
                    <Input type="number" min={1} value={editForm.numberOfPassengers} onChange={(e) => editChange("numberOfPassengers", e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Remarks</Label>
                    <Textarea value={editForm.remarks} onChange={(e) => editChange("remarks", e.target.value)} className="min-h-[90px]" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Event Name</Label>
                    <Input value={editForm.eventName} onChange={(e) => editChange("eventName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Organizer</Label>
                    <Input value={editForm.organizer} onChange={(e) => editChange("organizer", e.target.value)} />
                  </div>
                  <div>
                    <Label>Organizer Phone</Label>
                    <Input value={editForm.organizerPhone} onChange={(e) => editChange("organizerPhone", e.target.value)} />
                  </div>
                  <div>
                    <Label>Organizer Email</Label>
                    <Input value={editForm.organizerEmail} onChange={(e) => editChange("organizerEmail", e.target.value)} />
                  </div>
                  <div>
                    <Label>Date &amp; Time</Label>
                    <Input type="datetime-local" value={editForm.dateTime} onChange={(e) => editChange("dateTime", e.target.value)} />
                  </div>
                  <div>
                    <Label>Venue</Label>
                    <Input value={editForm.venue} onChange={(e) => editChange("venue", e.target.value)} />
                  </div>
                  <div>
                    <Label>Venue Link</Label>
                    <Input value={editForm.venueLink} onChange={(e) => editChange("venueLink", e.target.value)} />
                  </div>
                  <div>
                    <Label>Referenced By</Label>
                    <Input value={editForm.referencedBy} onChange={(e) => editChange("referencedBy", e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea value={editForm.description} onChange={(e) => editChange("description", e.target.value)} className="min-h-[90px]" />
                  </div>
                </div>
              )}

              {editError && (
                <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  {editError}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setEditItem(null)} disabled={editSaving}>Cancel</Button>
                <Button onClick={saveEdit} disabled={editSaving} className="bg-indigo-600 hover:bg-indigo-700">
                  {editSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
