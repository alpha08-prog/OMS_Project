import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { visitorApi, type Visitor } from "@/lib/api";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import type { CsvColumn } from "@/lib/exportCsv";

// Same designation options as the visitor log form / filter.
const DESIGNATIONS = ["Party Worker", "Official", "Public", "Business", "Media", "Other"];

export default function ViewVisitors() {
  const [dateFilter, setDateFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Debounce the search input so we don't fire one request per keystroke.
  // 350ms is a good balance — feels responsive without spamming the backend.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Server-side filters → part of the query key. Same key = same cache entry,
  // so navigating away and back is instant within staleTime (30s).
  const queryParams: Record<string, string> = { limit: "50" };
  if (debouncedSearch.trim()) queryParams.search = debouncedSearch.trim();
  if (dateFilter) {
    queryParams.startDate = dateFilter;
    queryParams.endDate = dateFilter;
  }

  const queryClient = useQueryClient();

  const {
    data: visitors = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["visitors", "list", queryParams],
    queryFn: async () => {
      const res = await visitorApi.getAll(queryParams);
      return res.data;
    },
    // keepPreviousData behavior in v5: previous data stays while new data loads
    placeholderData: (prev) => prev,
  });

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
      queryClient.invalidateQueries({ queryKey: ["visitors"] });
    } catch (err: unknown) {
      setEditError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : null;

  // Designation is a client-side filter (the backend doesn't support it),
  // so we apply it to whatever the query returned.
  const filteredVisitors = visitors.filter((v) => {
    if (designationFilter !== "all" && v.designation !== designationFilter) return false;
    return true;
  });

  const formatDate = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };

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

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  View Visitors
                </h1>
                <p className="text-sm text-muted-foreground">
                  Visitor entries logged by staff
                </p>
              </div>
              <ExportCsvButton
                rows={filteredVisitors}
                columns={csvColumns}
                filename="visitors"
              />
            </div>

            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>

              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Designation</Label>
                  <Select
                    value={designationFilter}
                    onValueChange={setDesignationFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Party Worker">Party Worker</SelectItem>
                      <SelectItem value="Official">Official</SelectItem>
                      <SelectItem value="Public">Public</SelectItem>
                      <SelectItem value="Business">Business</SelectItem>
                      <SelectItem value="Media">Media</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <Label>Search (Name / Phone)</Label>
                  <Input
                    placeholder="Enter name or phone number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Visitors ({filteredVisitors.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {errorMessage && (
                  <p className="text-sm text-red-600">{errorMessage}</p>
                )}
                {isLoading && (
                  <p className="text-sm text-muted-foreground">Loading visitors...</p>
                )}
                {!isLoading && !errorMessage && filteredVisitors.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No visitors found for selected filters.
                  </p>
                )}

                {filteredVisitors.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded-xl border bg-white"
                  >
                    <div>
                      <p className="font-medium text-indigo-900">{v.name}</p>
                      <p className="text-sm text-muted-foreground">
                        📞 {v.phone || "—"} • {v.designation}
                      </p>
                      {v.referencedBy && (
                        <p className="text-xs text-muted-foreground">
                          Referred by: {v.referencedBy}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {v.dob && (
                        <Badge variant="outline">🎂 {formatDate(v.dob)}</Badge>
                      )}
                      <Badge variant="secondary">{formatDate(v.visitDate)}</Badge>
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => openEdit(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>
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
                <Input value={editForm.constituency ?? ""} onChange={(e) => editChange("constituency", e.target.value)} />
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
      </main>
    </div>
  );
}
