import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, RefreshCw, Eye, Download, Clock, CheckCircle, XCircle, AlertCircle, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { AttachmentsList } from "@/components/common/AttachmentsList";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import {
  grievanceApi,
  pdfApi,
  type Grievance,
  type GrievanceStatus,
  type GrievancePriority,
  type GrievanceType,
  type CreateGrievanceRequest,
  type GrievanceTimeline,
} from "@/lib/api";
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

// Editable subset of a grievance. Numeric/optional fields are held as strings
// in the form so empty inputs are representable; they're coerced on save.
type EditFormState = {
  petitionerName: string;
  mobileNumber: string;
  constituency: string;
  wardVillage: string;
  grievanceType: GrievanceType;
  description: string;
  monetaryValue: string;
  status: GrievanceStatus;
  priority: GrievancePriority;
};

const emptyEditForm: EditFormState = {
  petitionerName: "",
  mobileNumber: "",
  constituency: "",
  wardVillage: "",
  grievanceType: "OTHER",
  description: "",
  monetaryValue: "",
  status: "OPEN",
  priority: "MEDIUM",
};

const GRIEVANCE_TYPE_OPTIONS: GrievanceType[] = [
  "WATER",
  "ROAD",
  "POLICE",
  "HEALTH",
  "TRANSFER",
  "FINANCIAL_AID",
  "ELECTRICITY",
  "EDUCATION",
  "HOUSING",
  "TEMPLE_VISIT",
  "OTHER",
];

const STATUS_OPTIONS: GrievanceStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "VERIFIED",
  "RESOLVED",
  "REJECTED",
];

const PRIORITY_OPTIONS: GrievancePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function GrievanceView() {
  // Current user role — office grievances are admin-managed, so staff get a
  // read-only view of them (no Edit button). Admin/Super Admin can still edit.
  const userRole = (() => {
    const fromStore =
      sessionStorage.getItem("user_role") || localStorage.getItem("user_role");
    if (fromStore) return fromStore;
    const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (userStr) {
      try {
        return (JSON.parse(userStr) as { role?: string }).role ?? null;
      } catch {
        return null;
      }
    }
    return null;
  })();
  // Staff cannot edit OFFICE grievances; everyone can edit PUBLIC ones.
  const canEdit = (g: Grievance) =>
    userRole !== "STAFF" || (g.source ?? "PUBLIC") !== "OFFICE";

  const [searchParams, setSearchParams] = useSearchParams();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);

  // Progress timeline for the grievance shown in the details dialog. Loaded
  // lazily when the dialog opens; `timelineError` surfaces fetch failures
  // inline without blocking the rest of the details view.
  const [timeline, setTimeline] = useState<GrievanceTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Edit dialog state. `editGrievance` holds the row being edited (its id is
  // used for the update + to merge the returned record back into the list);
  // `editForm` is the in-progress, editable copy of the fields.
  const [editOpen, setEditOpen] = useState(false);
  const [editGrievance, setEditGrievance] = useState<Grievance | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Filters (search from URL for header search)
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") ?? "");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Deep-link target. Notifications carry ?id=<grievance> so we can open the
  // details dialog for that specific row once the list has loaded. We drop
  // the param after consuming it so a manual refresh doesn't re-open it.
  const targetId = searchParams.get("id");

  // Search is pushed to the BACKEND (so a reference-number / name search finds
  // grievances beyond the page's fetch window), then status/date refine client-
  // side. Defaults to the current search box value so Refresh keeps the query.
  const fetchGrievances = async (search: string = searchQuery) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (search.trim()) params.search = search.trim();
      const res = await grievanceApi.getAll(params);
      // Handle response structure
      let grievancesArray: Grievance[] = [];
      if (res) {
        if (Array.isArray(res)) {
          grievancesArray = res;
        } else if (res.data && Array.isArray(res.data)) {
          grievancesArray = res.data;
        }
      }
      setGrievances(grievancesArray);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load grievances";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Debounced backend search: refetch 350ms after the query settles. Runs on
  // mount too (with the initial URL search param).
  useEffect(() => {
    const handle = setTimeout(() => {
      fetchGrievances(searchQuery);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Once a ?id= deep-link target is present, open that grievance's details
  // dialog. We try the in-memory list first (cheap, no network). If the row
  // is older than the first 200 we fall back to fetching it directly by id.
  // Either way we drop the param after consuming it so dismissing the dialog
  // doesn't re-open it on a re-render.
  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    };
    const inList = grievances.find((g) => g.id === targetId);
    if (inList) {
      setSelectedGrievance(inList);
      setDetailsOpen(true);
      clearParam();
      return;
    }
    // Still loading the list — wait for it to finish before attempting a
    // direct fetch, otherwise we'd race and fire both.
    if (loading) return;
    (async () => {
      try {
        const g = await grievanceApi.getById(targetId);
        if (cancelled || !g) return;
        setSelectedGrievance(g);
        setDetailsOpen(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to open the linked grievance";
        setError(msg);
      } finally {
        if (!cancelled) clearParam();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, grievances, loading, searchParams, setSearchParams]);

  const handleViewDetails = (grievance: Grievance) => {
    setSelectedGrievance(grievance);
    setDetailsOpen(true);
  };

  // Load the progress timeline whenever the details dialog is open for a
  // grievance. Re-runs if the selected grievance changes (e.g. via deep-link).
  // We clear stale data while loading so the dialog never shows the previous
  // grievance's timeline.
  useEffect(() => {
    if (!detailsOpen || !selectedGrievance) return;
    let cancelled = false;
    const id = selectedGrievance.id;
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(true);
    (async () => {
      try {
        const res = await grievanceApi.getTimeline(id);
        if (!cancelled) setTimeline(res);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load timeline";
        setTimelineError(msg);
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, selectedGrievance]);

  // Open the edit dialog pre-filled from the chosen grievance.
  const handleEdit = (grievance: Grievance) => {
    setEditGrievance(grievance);
    setEditForm({
      petitionerName: grievance.petitionerName,
      mobileNumber: grievance.mobileNumber,
      constituency: grievance.constituency,
      wardVillage: grievance.wardVillage ?? "",
      grievanceType: grievance.grievanceType,
      description: grievance.description,
      monetaryValue:
        grievance.monetaryValue != null ? String(grievance.monetaryValue) : "",
      status: grievance.status,
      priority: grievance.priority ?? "MEDIUM",
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editGrievance) return;
    setEditSaving(true);
    setEditError(null);
    try {
      // Build only the changed fields so we don't clobber unrelated data.
      const payload: Partial<CreateGrievanceRequest> & { status?: typeof editForm.status } = {};
      if (editForm.petitionerName !== editGrievance.petitionerName)
        payload.petitionerName = editForm.petitionerName;
      if (editForm.mobileNumber !== editGrievance.mobileNumber)
        payload.mobileNumber = editForm.mobileNumber;
      if (editForm.constituency !== editGrievance.constituency)
        payload.constituency = editForm.constituency;
      if (editForm.wardVillage !== (editGrievance.wardVillage ?? ""))
        payload.wardVillage = editForm.wardVillage;
      if (editForm.grievanceType !== editGrievance.grievanceType)
        payload.grievanceType = editForm.grievanceType;
      if (editForm.description !== editGrievance.description)
        payload.description = editForm.description;
      if (editForm.priority !== (editGrievance.priority ?? "MEDIUM"))
        payload.priority = editForm.priority;

      // monetaryValue: blank clears it (0), otherwise parse the number.
      const currentMonetary =
        editGrievance.monetaryValue != null ? String(editGrievance.monetaryValue) : "";
      if (editForm.monetaryValue !== currentMonetary) {
        const parsed = editForm.monetaryValue.trim() === ""
          ? undefined
          : Number(editForm.monetaryValue);
        if (parsed !== undefined && !Number.isFinite(parsed)) {
          setEditError("Monetary value must be a valid number.");
          setEditSaving(false);
          return;
        }
        payload.monetaryValue = parsed;
      }

      // Status goes through the same open PUT /:id so any role can change it
      // (the admin-only /status endpoint isn't used for the shared edit).
      if (editForm.status !== editGrievance.status) {
        payload.status = editForm.status;
      }

      const merged = await grievanceApi.update(editGrievance.id, payload);

      // Merge the fresh record into local state so the list + open details
      // dialog reflect the edit (including the new audit fields) immediately.
      setGrievances((prev) =>
        prev.map((g) => (g.id === merged.id ? { ...g, ...merged } : g)),
      );
      setSelectedGrievance((prev) =>
        prev && prev.id === merged.id ? { ...prev, ...merged } : prev,
      );
      setEditOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save changes";
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDownloadPDF = async (g: Grievance) => {
    try {
      if (g.grievanceType === "TEMPLE_VISIT") {
        // Temple-visit endpoint also flips status -> RESOLVED on the server.
        // Refresh the list so the badge updates without a page reload.
        await pdfApi.downloadTempleVisitLetter(g.id);
        await fetchGrievances();
      } else {
        await pdfApi.downloadPDF(`/pdf/grievance/${g.id}`, `Grievance_Letter_${g.id}.pdf`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download PDF";
      setError(errorMessage);
    }
  };

  // Preview = HTML render in a new tab. Does NOT close the grievance, so
  // staff can sanity-check formatting before committing to the PDF (which
  // auto-resolves the ticket on download).
  const handlePreviewTempleLetter = async (id: string) => {
    try {
      const html = await pdfApi.previewTempleVisit(id);
      const blob = new Blob([html], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      // Release the blob URL once the new tab takes ownership of the document.
      // 60s is overkill but cheap — the tab has loaded the bytes long before.
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      if (!w) {
        setError("Please allow pop-ups for this site to preview the letter.");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to preview letter";
      setError(errorMessage);
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: GrievanceStatus, isVerified: boolean) => {
    if (status === 'REJECTED') {
      return <Badge variant="destructive">Rejected</Badge>;
    }
    if (status === 'RESOLVED') {
      return <Badge className="bg-green-100 text-green-800">Resolved</Badge>;
    }
    if (isVerified) {
      return <Badge className="bg-blue-100 text-blue-800">Verified</Badge>;
    }
    if (status === 'IN_PROGRESS') {
      return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  // Small coloured badge for a timeline event's type.
  const getTimelineTypeBadge = (type: GrievanceTimeline["timeline"][number]["type"]) => {
    if (type === "CREATED") {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Created</Badge>;
    }
    if (type === "EDITED") {
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Edited</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Remark</Badge>;
  };

  const getStatusIcon = (status: GrievanceStatus, isVerified: boolean) => {
    if (status === 'REJECTED') return <XCircle className="h-4 w-4 text-red-600" />;
    if (status === 'RESOLVED') return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (isVerified) return <CheckCircle className="h-4 w-4 text-blue-600" />;
    if (status === 'IN_PROGRESS') return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <Clock className="h-4 w-4 text-gray-600" />;
  };

  // Filter and search grievances
  const filteredGrievances = grievances.filter(g => {
    if (filterStatus !== "all") {
      if (filterStatus === "verified" && !g.isVerified) return false;
      if (filterStatus === "pending" && g.isVerified) return false;
      if (filterStatus !== "verified" && filterStatus !== "pending" && g.status !== filterStatus) return false;
    }
    // Date range filter against created-at. End date is inclusive of the
    // whole day, so anything created before midnight UTC of (endDate + 1)
    // matches.
    if (startDate || endDate) {
      const created = new Date(g.createdAt).getTime();
      if (startDate) {
        const from = new Date(startDate).getTime();
        if (Number.isFinite(from) && created < from) return false;
      }
      if (endDate) {
        const to = new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (Number.isFinite(to) && created > to) return false;
      }
    }
    // Text search is handled server-side (see fetchGrievances); no client filter.
    return true;
  });

  // Client-side pagination — 10 rows per page.
  const pager = usePagination(filteredGrievances, 10);

  // Stats
  const totalCount = grievances.length;
  const verifiedCount = grievances.filter(g => g.isVerified).length;
  const pendingCount = grievances.filter(g => !g.isVerified && g.status === 'OPEN').length;
  const resolvedCount = grievances.filter(g => g.status === 'RESOLVED').length;

  // CSV export — mirrors the currently filtered/visible rows.
  const csvColumns: CsvColumn<Grievance>[] = [
    { header: "Reference No", value: (g) => g.referenceNo ?? "" },
    { header: "Petitioner", value: (g) => g.petitionerName },
    { header: "Mobile", value: (g) => g.mobileNumber },
    { header: "Type", value: (g) => g.grievanceType },
    { header: "Constituency", value: (g) => g.constituency },
    { header: "Status", value: (g) => g.status },
    { header: "Priority", value: (g) => g.priority },
    { header: "Source", value: (g) => g.source },
    { header: "Description", value: (g) => g.description },
    { header: "Created", value: (g) => new Date(g.createdAt).toLocaleString() },
    { header: "Created By", value: (g) => g.createdBy?.name },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  View Grievances
                </h1>
                <p className="text-sm text-muted-foreground">
                  View and track all submitted grievances
                </p>
              </div>
              <Button variant="outline" onClick={() => fetchGrievances()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="rounded-xl bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-indigo-900">{totalCount}</p>
                  <p className="text-sm text-indigo-700">Total</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-amber-50 border-amber-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-amber-900">{pendingCount}</p>
                  <p className="text-sm text-amber-700">Pending</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-blue-50 border-blue-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-blue-900">{verifiedCount}</p>
                  <p className="text-sm text-blue-700">Verified</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-green-50 border-green-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-900">{resolvedCount}</p>
                  <p className="text-sm text-green-700">Resolved</p>
                </CardContent>
              </Card>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <Input
                  placeholder="Search by reference no, name, phone, constituency, ward/village..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                {(filterStatus !== "all" || searchQuery || startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus("all");
                      setSearchQuery("");
                      setStartDate("");
                      setEndDate("");
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
                <ExportCsvButton
                  rows={filteredGrievances}
                  columns={csvColumns}
                  filename="grievances"
                  className="ml-auto"
                />
              </CardContent>
            </Card>

            {/* Grievances List */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Grievances ({filteredGrievances.length})</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading grievances...</p>
                ) : filteredGrievances.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No grievances found</p>
                  </div>
                ) : (
                  pager.pageItems.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-4 rounded-xl border bg-white hover:shadow-md transition"
                    >
                      <div className="flex gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          {getStatusIcon(g.status, g.isVerified)}
                        </div>

                        <div>
                          <div className="font-medium flex flex-wrap items-center gap-2">
                            <span>{g.petitionerName}</span>
                            {g.referenceNo && (
                              <span className="font-mono text-xs font-normal text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                {g.referenceNo}
                              </span>
                            )}
                            {getStatusBadge(g.status, g.isVerified)}
                            {g.source === 'OFFICE' && (
                              <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white">
                                Office
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {g.grievanceType} • {g.constituency}
                            {g.wardVillage ? ` / ${g.wardVillage}` : ''} • {formatCurrency(g.monetaryValue)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            📞 {g.mobileNumber} • Created: {formatDate(g.createdAt)}
                          </p>
                          {g.description && (
                            <p className="text-sm mt-2 line-clamp-2">{g.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(g)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {canEdit(g) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(g)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                        {g.grievanceType === "TEMPLE_VISIT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviewTempleLetter(g.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                        )}
                        {(g.isVerified || g.grievanceType === "TEMPLE_VISIT") && (
                          <Button
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => handleDownloadPDF(g)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            {g.grievanceType === "TEMPLE_VISIT" ? "Letter" : "PDF"}
                          </Button>
                        )}
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
        </div>

        {/* Grievance Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Grievance Details
              </DialogTitle>
              <DialogDescription>
                Full details of the submitted grievance
              </DialogDescription>
              {selectedGrievance?.referenceNo && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Reference No</span>
                  <span className="font-mono text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">
                    {selectedGrievance.referenceNo}
                  </span>
                </div>
              )}
            </DialogHeader>
            
            {selectedGrievance && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(selectedGrievance.status, selectedGrievance.isVerified)}
                  {selectedGrievance.source === 'OFFICE' && (
                    <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white">
                      Office
                    </Badge>
                  )}
                  {selectedGrievance.isVerified && (
                    <span className="text-sm text-green-600">✓ Verified by {selectedGrievance.verifiedBy?.name || 'Admin'}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Petitioner Name</p>
                    <p className="font-medium">{selectedGrievance.petitionerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Mobile Number</p>
                    <p className="font-medium">{selectedGrievance.mobileNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Constituency</p>
                    <p className="font-medium">{selectedGrievance.constituency}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ward / Village</p>
                    <p className="font-medium">{selectedGrievance.wardVillage || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Grievance Type</p>
                    <p className="font-medium">{selectedGrievance.grievanceType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Monetary Value</p>
                    <p className="font-medium">{formatCurrency(selectedGrievance.monetaryValue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created At</p>
                    <p className="font-medium">{formatDate(selectedGrievance.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <p className="font-medium">{selectedGrievance.priority ?? 'MEDIUM'}</p>
                  </div>
                </div>

                {selectedGrievance.lastEditedAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                    <span>
                      Last edited by {selectedGrievance.lastEditedBy?.name ?? 'Unknown'} on{' '}
                      {new Date(selectedGrievance.lastEditedAt).toLocaleString()}
                    </span>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedGrievance.description}</p>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Action Required</p>
                  <p className="font-medium">{selectedGrievance.actionRequired}</p>
                </div>
                
                {selectedGrievance.referencedBy && (
                  <div>
                    <p className="text-sm text-muted-foreground">Referenced By</p>
                    <p className="font-medium">{selectedGrievance.referencedBy}</p>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    Progress Timeline
                  </p>
                  {timelineLoading ? (
                    <p className="text-sm text-muted-foreground py-2">Loading timeline...</p>
                  ) : timelineError ? (
                    <p className="text-sm text-red-600 py-2">{timelineError}</p>
                  ) : !timeline || timeline.timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No timeline events recorded yet.
                    </p>
                  ) : (
                    <ol className="relative ml-2 space-y-5 border-l border-indigo-100 pl-5">
                      {timeline.timeline.map((event, idx) => (
                        <li key={idx} className="relative">
                          <span className="absolute -left-[1.43rem] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                          <div className="flex flex-wrap items-center gap-2">
                            {getTimelineTypeBadge(event.type)}
                            {event.status && (
                              <Badge variant="outline" className="text-xs">
                                {event.status}
                              </Badge>
                            )}
                          </div>
                          {event.note && (
                            <p className="mt-1.5 text-sm text-gray-800">{event.note}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {event.by ?? "Unknown"}
                            {" • "}
                            {event.at ? new Date(event.at).toLocaleString() : "Unknown date"}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="pt-2 border-t">
                  <AttachmentsList
                    contextType="GRIEVANCE"
                    contextId={selectedGrievance.id}
                    emptyMessage="No supporting files were uploaded with this grievance."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                  {canEdit(selectedGrievance) && (
                    <Button variant="outline" onClick={() => handleEdit(selectedGrievance)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  {selectedGrievance.grievanceType === "TEMPLE_VISIT" && (
                    <Button
                      variant="outline"
                      onClick={() => handlePreviewTempleLetter(selectedGrievance.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                  )}
                  {(selectedGrievance.isVerified ||
                    selectedGrievance.grievanceType === "TEMPLE_VISIT") && (
                    <Button
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => handleDownloadPDF(selectedGrievance)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      {selectedGrievance.grievanceType === "TEMPLE_VISIT"
                        ? "Download Letter"
                        : "Download PDF"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Grievance Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit Grievance
              </DialogTitle>
              <DialogDescription>
                Update the grievance details and save your changes.
              </DialogDescription>
            </DialogHeader>

            {editGrievance && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-petitionerName">Petitioner Name</Label>
                    <Input
                      id="edit-petitionerName"
                      value={editForm.petitionerName}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, petitionerName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-mobileNumber">Mobile Number</Label>
                    <Input
                      id="edit-mobileNumber"
                      value={editForm.mobileNumber}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, mobileNumber: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-constituency">Constituency</Label>
                    <Input
                      id="edit-constituency"
                      value={editForm.constituency}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, constituency: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-wardVillage">Ward / Village</Label>
                    <Input
                      id="edit-wardVillage"
                      value={editForm.wardVillage}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, wardVillage: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-grievanceType">Grievance Type</Label>
                    <Select
                      value={editForm.grievanceType}
                      onValueChange={(v) =>
                        setEditForm((f) => ({ ...f, grievanceType: v as GrievanceType }))
                      }
                    >
                      <SelectTrigger id="edit-grievanceType">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {GRIEVANCE_TYPE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-monetaryValue">Monetary Value (₹)</Label>
                    <Input
                      id="edit-monetaryValue"
                      type="number"
                      min="0"
                      value={editForm.monetaryValue}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, monetaryValue: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select
                      value={editForm.status}
                      onValueChange={(v) =>
                        setEditForm((f) => ({ ...f, status: v as GrievanceStatus }))
                      }
                    >
                      <SelectTrigger id="edit-status">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-priority">Priority</Label>
                    <Select
                      value={editForm.priority}
                      onValueChange={(v) =>
                        setEditForm((f) => ({ ...f, priority: v as GrievancePriority }))
                      }
                    >
                      <SelectTrigger id="edit-priority">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    rows={4}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </div>

                {editGrievance.lastEditedAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Last edited by {editGrievance.lastEditedBy?.name ?? 'Unknown'} on{' '}
                      {new Date(editGrievance.lastEditedAt).toLocaleString()}
                    </span>
                  </div>
                )}

                {editError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm">
                    {editError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={editSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={handleSaveEdit}
                    disabled={editSaving}
                  >
                    {editSaving ? "Saving..." : "Save Changes"}
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
