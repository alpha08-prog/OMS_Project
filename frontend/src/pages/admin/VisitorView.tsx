import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Users,
  RefreshCw,
  Filter,
  Eye,
  Trash2,
  Pencil,
  Phone,
  Calendar,
  Briefcase,
  Clock
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { visitorApi, type Visitor } from "@/lib/api";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { SearchBar } from "@/components/common/SearchBar";
import { CardListSkeleton } from "@/components/common/Skeletons";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { CONSTITUENCY_OPTIONS } from "@/lib/constituencies";
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

// Same designation options as the visitor log form / filter.
const DESIGNATIONS = ["Party Worker", "Official", "Public", "Business", "Media", "Other"];

export default function VisitorView() {
  const [searchParams] = useSearchParams();
  const confirm = useConfirm();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [filterDesignation, setFilterDesignation] = useState<string>("all");
  const [constituency, setConstituency] = useState("");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") ?? "");
  const [dateFilter, setDateFilter] = useState<string>("");

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (searchQuery) {
        params.search = searchQuery;
      }
      if (dateFilter) {
        params.startDate = dateFilter;
        params.endDate = dateFilter;
      }
      const res = await visitorApi.getAll(params);
      let filteredData = res.data;
      
      // Client-side filter for designation
      if (filterDesignation !== "all") {
        filteredData = filteredData.filter(v => v.designation === filterDesignation);
      }
      
      setVisitors(filteredData);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to load visitors");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, filterDesignation, searchQuery]);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  const handleSearch = () => {
    fetchVisitors();
  };

  const handleViewDetails = (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setDetailsOpen(true);
  };

  // Edit dialog — corrections to a logged visitor entry.
  const [editVisitor, setEditVisitor] = useState<Visitor | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (v: Visitor) => {
    setEditError(null);
    setEditForm({
      name: v.name ?? "",
      designation: v.designation ?? "",
      phone: v.phone ?? "",
      // Catalyst "YYYY-MM-DD ..." or ISO → the date part for <input type="date">
      dob: v.dob ? String(v.dob).slice(0, 10) : "",
      purpose: v.purpose ?? "",
      referencedBy: v.referencedBy ?? "",
      constituency: v.constituency ?? "",
      wardVillage: v.wardVillage ?? "",
    });
    setEditVisitor(v);
  };

  const editChange = (field: string, value: string) =>
    setEditForm((p) => ({ ...p, [field]: value }));

  const saveEdit = async () => {
    if (!editVisitor) return;
    if (!editForm.name.trim() || !editForm.purpose.trim()) {
      setEditError("Name and purpose are required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await visitorApi.update(editVisitor.id, {
        name: editForm.name,
        designation: editForm.designation,
        phone: editForm.phone || undefined,
        dob: editForm.dob || undefined,
        purpose: editForm.purpose,
        referencedBy: editForm.referencedBy || undefined,
        constituency: editForm.constituency || undefined,
        wardVillage: editForm.wardVillage || undefined,
      });
      setEditVisitor(null);
      fetchVisitors();
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({
      title: "Delete this visitor entry?",
      description: "This action cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    }))) return;


    try {
      await visitorApi.delete(id);
      setVisitors(prev => prev.filter(v => v.id !== id));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to delete visitor");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDesignationBadge = (designation: string) => {
    const colors: Record<string, string> = {
      'Party Worker': 'bg-orange-100 text-orange-800 border-orange-300',
      'Official': 'bg-blue-100 text-blue-800 border-blue-300',
      'Public': 'bg-green-100 text-green-800 border-green-300',
      'Business': 'bg-purple-100 text-purple-800 border-purple-300',
      'Media': 'bg-pink-100 text-pink-800 border-pink-300',
      'Other': 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return <Badge className={colors[designation] || colors['Other']}>{designation}</Badge>;
  };

  const todaysVisitors = visitors.filter(v => {
    const visitDate = new Date(v.visitDate).toDateString();
    const today = new Date().toDateString();
    return visitDate === today;
  });

  const csvColumns: CsvColumn<Visitor>[] = [
    { header: "Name", value: (v) => v.name },
    { header: "Designation", value: (v) => v.designation },
    { header: "Phone", value: (v) => v.phone },
    { header: "DOB", value: (v) => v.dob },
    { header: "Purpose", value: (v) => v.purpose },
    { header: "Referenced By", value: (v) => v.referencedBy },
    { header: "Constituency", value: (v) => v.constituency },
    { header: "Ward/Village", value: (v) => v.wardVillage },
    { header: "Visit Date", value: (v) => v.visitDate },
    { header: "Logged By", value: (v) => v.createdBy?.name },
  ];

  // Client-side constituency filter over the fetched visitor list (the
  // designation filter is applied inside fetchVisitors; this narrows further).
  const filteredVisitors = constituency
    ? visitors.filter((v) => v.constituency === constituency)
    : visitors;

  // Client-side pagination — 10 rows per page over the filtered visitor records.
  const pager = usePagination(filteredVisitors, 10);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Visitor Log
              </h1>
              <p className="text-sm text-muted-foreground">
                View all visitor entries logged by staff
              </p>
            </div>
            <Button variant="outline" onClick={fetchVisitors} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-xl bg-indigo-50 border-indigo-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-900">{visitors.length}</p>
                  <p className="text-sm text-indigo-700">Total Visitors</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="rounded-xl bg-green-50 border-green-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Calendar className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-900">{todaysVisitors.length}</p>
                  <p className="text-sm text-green-700">Today's Visitors</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="rounded-xl bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Briefcase className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-900">
                    {visitors.filter(v => v.designation === 'Party Worker').length}
                  </p>
                  <p className="text-sm text-amber-700">Party Workers</p>
                </div>
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
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSubmit={handleSearch}
                  placeholder="Search by name or purpose..."
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSearch}>Search</Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="w-40">
                <Select value={filterDesignation} onValueChange={setFilterDesignation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Designations</SelectItem>
                    <SelectItem value="Party Worker">Party Worker</SelectItem>
                    <SelectItem value="Official">Official</SelectItem>
                    <SelectItem value="Public">Public</SelectItem>
                    <SelectItem value="Business">Business</SelectItem>
                    <SelectItem value="Media">Media</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                </div>
                <div className="w-48">
                <Select
                  value={constituency || "all"}
                  onValueChange={(v) => setConstituency(v === "all" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Constituency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All constituencies</SelectItem>
                    {CONSTITUENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-40"
                />
                {dateFilter && (
                  <Button size="sm" variant="ghost" onClick={() => setDateFilter("")}>
                    Clear
                  </Button>
                )}
              </div>

              <div className="ml-auto">
                <ExportCsvButton
                  rows={filteredVisitors}
                  columns={csvColumns}
                  filename="visitors"
                />
              </div>
            </CardContent>
          </Card>

          {/* Visitor List */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Visitor Records ({filteredVisitors.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <CardListSkeleton rows={5} />
              ) : filteredVisitors.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-muted-foreground">No visitor records found</p>
                </div>
              ) : (
                pager.pageItems.map((visitor) => (
                  <div
                    key={visitor.id}
                    className="p-4 rounded-xl border bg-white hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-4 flex-1">
                        <div className="p-2 rounded-lg bg-indigo-100">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-indigo-900">{visitor.name}</p>
                            {getDesignationBadge(visitor.designation)}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {visitor.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5" />
                                {visitor.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(visitor.visitDate)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(visitor.createdAt)}
                            </span>
                            {(visitor.constituency || visitor.wardVillage) && (
                              <span>
                                {visitor.constituency || 'N/A'}
                                {visitor.wardVillage ? ` / ${visitor.wardVillage}` : ''}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm">
                            <span className="text-muted-foreground">Purpose:</span> {visitor.purpose}
                          </p>
                          
                          {visitor.referencedBy && (
                            <p className="text-xs text-muted-foreground">
                              Referenced by: {visitor.referencedBy}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(visitor)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Edit"
                          onClick={() => openEdit(visitor)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(visitor.id)}
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
        <Dialog open={!!editVisitor} onOpenChange={(open) => { if (!open) setEditVisitor(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Visitor — {editVisitor?.name}</DialogTitle>
              <DialogDescription>
                Correct the details of this visitor entry.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={editForm.name ?? ""} onChange={(e) => editChange("name", e.target.value)} />
              </div>
              <div>
                <Label>Designation</Label>
                <Select value={editForm.designation ?? ""} onValueChange={(v) => editChange("designation", v)}>
                  <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                  <SelectContent>
                    {DESIGNATIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={editForm.phone ?? ""} onChange={(e) => editChange("phone", e.target.value)} maxLength={10} />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input type="date" value={editForm.dob ?? ""} onChange={(e) => editChange("dob", e.target.value)} />
              </div>
              <div>
                <Label>Referenced By</Label>
                <Input value={editForm.referencedBy ?? ""} onChange={(e) => editChange("referencedBy", e.target.value)} />
              </div>
              <div>
                <Label>Constituency</Label>
                <Select
                  value={editForm.constituency || "none"}
                  onValueChange={(v) => editChange("constituency", v === "none" ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select constituency" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {CONSTITUENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ward / Village</Label>
                <Input value={editForm.wardVillage ?? ""} onChange={(e) => editChange("wardVillage", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Purpose</Label>
                <Textarea value={editForm.purpose ?? ""} onChange={(e) => editChange("purpose", e.target.value)} className="min-h-[70px]" />
              </div>
            </div>
            {editError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditVisitor(null)} disabled={editSaving}>
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
                <Users className="h-5 w-5" />
                Visitor Details
              </DialogTitle>
              <DialogDescription>
                Full details of the visitor entry
              </DialogDescription>
            </DialogHeader>
            
            {selectedVisitor && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getDesignationBadge(selectedVisitor.designation)}
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">{selectedVisitor.name}</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedVisitor.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Visit Date</p>
                    <p className="font-medium">{formatDate(selectedVisitor.visitDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Logged By</p>
                    <p className="font-medium">{selectedVisitor.createdBy?.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">
                      {selectedVisitor.dob ? formatDate(selectedVisitor.dob) : 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Constituency</p>
                    <p className="font-medium">{selectedVisitor.constituency || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ward / Village</p>
                    <p className="font-medium">{selectedVisitor.wardVillage || 'Not provided'}</p>
                  </div>
                  {selectedVisitor.referencedBy && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedVisitor.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Purpose of Visit</p>
                  <p className="mt-1 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap">
                    {selectedVisitor.purpose}
                  </p>
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
