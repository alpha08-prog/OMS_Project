import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, CheckCircle, XCircle, RefreshCw, MapPin, User, Clock, Eye, UserPlus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { AttachmentsList } from "@/components/common/AttachmentsList";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { tourProgramApi, taskApi, type TourProgram } from "@/lib/api";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface StaffMember {
  id: string;
  name: string;
  email: string;
}

export default function TourProgramQueue() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<TourProgram | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignToId, setAssignToId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState("");

  // Edit dialog state — available to all roles; does NOT touch the decision flow.
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<TourProgram | null>(null);
  const [editForm, setEditForm] = useState({
    eventName: "",
    organizer: "",
    organizerPhone: "",
    organizerEmail: "",
    dateTime: "",
    venue: "",
    venueLink: "",
    description: "",
    referencedBy: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchPrograms = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: "50" };
      if (decisionFilter === "ACCEPTED") params.decision = "ACCEPTED";
      else if (decisionFilter === "REGRET") params.decision = "REGRET";
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = decisionFilter === "ALL"
        ? await tourProgramApi.getPending(params)
        : await tourProgramApi.getAll(params);
      setPrograms(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tour programs");
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const staff = await taskApi.getStaffMembers();
      setStaffMembers(Array.isArray(staff) ? staff : []);
    } catch {
      setStaffMembers([]);
    }
  };

  useEffect(() => {
    fetchPrograms();
    fetchStaff();
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [decisionFilter, startDate, endDate]);

  const handleDecision = async (id: string, decision: 'ACCEPTED' | 'REGRET') => {
    setActionLoading(id);
    try {
      await tourProgramApi.updateDecision(id, decision, decisionNote);
      // Remove from list after decision
      setPrograms((prev) => prev.filter((p) => p.id !== id));
      setDetailsOpen(false);
      setDecisionNote("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = (program: TourProgram) => {
    setSelectedProgram(program);
    setDecisionNote("");
    setDetailsOpen(true);
  };

  // Convert an ISO date string to the value a datetime-local input expects (local time, no seconds).
  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenEdit = (program: TourProgram) => {
    setEditProgram(program);
    setEditError(null);
    setEditForm({
      eventName: program.eventName ?? "",
      organizer: program.organizer ?? "",
      organizerPhone: program.organizerPhone ?? "",
      organizerEmail: program.organizerEmail ?? "",
      dateTime: toLocalInput(program.dateTime || program.eventDate),
      venue: program.venue ?? "",
      venueLink: program.venueLink ?? "",
      description: program.description ?? "",
      referencedBy: program.referencedBy ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editProgram) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      // Build a diff of only the fields the user actually changed.
      const original = {
        eventName: editProgram.eventName ?? "",
        organizer: editProgram.organizer ?? "",
        organizerPhone: editProgram.organizerPhone ?? "",
        organizerEmail: editProgram.organizerEmail ?? "",
        dateTime: toLocalInput(editProgram.dateTime || editProgram.eventDate),
        venue: editProgram.venue ?? "",
        venueLink: editProgram.venueLink ?? "",
        description: editProgram.description ?? "",
        referencedBy: editProgram.referencedBy ?? "",
      };
      const changed: Partial<typeof editForm> = {};
      (Object.keys(editForm) as (keyof typeof editForm)[]).forEach((key) => {
        if (editForm[key] !== original[key]) changed[key] = editForm[key];
      });

      if (Object.keys(changed).length === 0) {
        setEditDialogOpen(false);
        return;
      }

      // dateTime from a datetime-local input is local; convert back to ISO for the API.
      const payload: Record<string, string> = { ...changed };
      if (changed.dateTime !== undefined) {
        const d = new Date(changed.dateTime);
        if (isNaN(d.getTime())) {
          setEditError("Please enter a valid date and time.");
          setSavingEdit(false);
          return;
        }
        payload.dateTime = d.toISOString();
      }

      await tourProgramApi.update(editProgram.id, payload);
      setEditDialogOpen(false);
      await fetchPrograms();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenAssign = (program: TourProgram) => {
    setSelectedProgram(program);
    setTaskTitle(`Tour Program: ${program.eventName}`);
    setTaskDescription(
      `Event: ${program.eventName}\n` +
      `Organizer: ${program.organizer}\n` +
      (program.organizerPhone ? `Organizer phone: ${program.organizerPhone}\n` : "") +
      (program.organizerEmail ? `Organizer email: ${program.organizerEmail}\n` : "") +
      `Date & Time: ${formatDateTime(program.dateTime || program.eventDate || "").date}\n` +
      `Venue: ${program.venue}\n` +
      (program.description ? `Description: ${program.description}` : "")
    );
    setAssignDialogOpen(true);
  };

  const resetAssignForm = () => {
    setAssignToId("");
    setTaskTitle("");
    setTaskDescription("");
    setDueDate("");
    setPriority("");
  };

  const handleAssignTask = async () => {
    if (!selectedProgram || !assignToId || !taskTitle) {
      alert("Please select a staff member and enter task title");
      return;
    }
    if (!priority) {
      alert("Please select a priority");
      return;
    }
    if (!dueDate?.trim()) {
      alert("Please select a due date");
      return;
    }
    const dateObj = new Date(dueDate + "T00:00:00");
    if (isNaN(dateObj.getTime())) {
      alert("Please select a valid due date");
      return;
    }
    setAssigning(true);
    try {
      const finalDueDate = dateObj.toISOString();
      await taskApi.create({
        title: taskTitle.trim(),
        description: taskDescription?.trim() || undefined,
        taskType: "TOUR_PROGRAM",
        priority: priority,
        referenceId: selectedProgram.id,
        referenceType: "TOUR_PROGRAM",
        assignedToId: assignToId,
        dueDate: finalDueDate,
      });
      await tourProgramApi.updateDecision(selectedProgram.id, "ACCEPTED", decisionNote || undefined);
      setAssignDialogOpen(false);
      resetAssignForm();
      setDetailsOpen(false);
      await fetchPrograms();
      alert("Verified and assigned to staff. Tour invitation accepted.");
      navigate("/admin/events");
    } catch (err: unknown) {
      const e = err as Record<string, unknown> | null;
      const msg = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : undefined;
      alert(msg || "Failed to assign task");
    } finally {
      setAssigning(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: "N/A", time: "" };
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return { date: "N/A", time: "" };
    return {
      date: date.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  // Client-side text search across the obvious fields (incl. reference number).
  const filteredPrograms = programs.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.referenceNo ?? "").toLowerCase().includes(q) ||
      p.eventName.toLowerCase().includes(q) ||
      p.organizer.toLowerCase().includes(q) ||
      p.venue.toLowerCase().includes(q)
    );
  });

  // CSV export — mirrors the currently filtered/visible rows.
  const csvColumns: CsvColumn<TourProgram>[] = [
    { header: "Reference No", value: (p) => p.referenceNo ?? "" },
    { header: "Event", value: (p) => p.eventName },
    { header: "Organizer", value: (p) => p.organizer },
    { header: "Date/Time", value: (p) => p.dateTime },
    { header: "Venue", value: (p) => p.venue },
    { header: "Decision", value: (p) => p.decision },
    { header: "Created By", value: (p) => p.createdBy?.name },
    { header: "Created", value: (p) => new Date(p.createdAt).toLocaleString() },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Tour Program Queue
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and decide on submitted invitations
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2 shrink-0">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search ref no, event, organizer, venue…"
                className="w-[240px]"
              />
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <div className="w-[160px]">
              <Select value={decisionFilter} onValueChange={setDecisionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Pending (All)</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="REGRET">Regret</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <ExportCsvButton
                rows={filteredPrograms}
                columns={csvColumns}
                filename="tour-invitations"
              />
              <Button variant="outline" onClick={fetchPrograms} disabled={loading}>
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
              {decisionFilter === "ACCEPTED" ? "Accepted" : decisionFilter === "REGRET" ? "Regret" : "Pending"} Invitations ({filteredPrograms.length})
            </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading invitations...</p>
              ) : filteredPrograms.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending invitations!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All tour program invitations have been reviewed.
                  </p>
                </div>
              ) : (
                filteredPrograms.map((p) => {
                  const { date, time } = formatDateTime(p.eventDate || p.dateTime);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-4 rounded-xl border bg-white hover:bg-indigo-50/30 transition"
                    >
                      <div className="flex gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          <Calendar className="h-5 w-5 text-indigo-700" />
                        </div>

                        <div className="space-y-1">
                          <p className="font-medium text-indigo-900 flex flex-wrap items-center gap-2">
                            <span>{p.eventName}</span>
                            {p.referenceNo && (
                              <span className="font-mono text-xs font-normal text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                {p.referenceNo}
                              </span>
                            )}
                            <Badge className="bg-amber-100 text-amber-800" variant="outline">
                              Pending
                            </Badge>
                          </p>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              {p.organizer}
                              {(p.organizerPhone || p.organizerEmail) && (
                                <span className="text-xs">
                                  {p.organizerPhone ? ` • ${p.organizerPhone}` : ""}
                                  {p.organizerEmail ? ` • ${p.organizerEmail}` : ""}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {date} at {time}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {p.venue}
                            </span>
                          </div>
                          {p.referencedBy && (
                            <p className="text-xs text-muted-foreground">
                              Referenced by: {p.referencedBy}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Submitted by: {p.createdBy?.name || 'Unknown'} • {new Date(p.createdAt).toLocaleDateString()}
                          </p>
                          {p.lastEditedAt && (
                            <p className="text-xs text-muted-foreground italic">
                              Last edited by {p.lastEditedBy?.name ?? 'Unknown'} on {new Date(p.lastEditedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(p)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(p)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          size="sm" 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleOpenAssign(p)}
                          disabled={assigning}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Verify and Assign to Staff
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDecision(p.id, 'REGRET')}
                          disabled={actionLoading === p.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Regret
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

        </div>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Invitation Details
              </DialogTitle>
              <DialogDescription>
                Review the invitation and make a decision
              </DialogDescription>
            </DialogHeader>
            
            {selectedProgram && (
              <div className="space-y-4 w-full overflow-x-hidden p-1">
                {selectedProgram.referenceNo && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Reference No</span>
                    <span className="font-mono text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">
                      {selectedProgram.referenceNo}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Event Name</p>
                    <p className="font-medium">{selectedProgram.eventName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer</p>
                    <p className="font-medium">{selectedProgram.organizer}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer phone</p>
                    <p className="font-medium">{selectedProgram.organizerPhone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer email</p>
                    <p className="font-medium break-all">{selectedProgram.organizerEmail || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">
                      {formatDateTime(selectedProgram.eventDate || selectedProgram.dateTime).date} at {formatDateTime(selectedProgram.eventDate || selectedProgram.dateTime).time}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Venue</p>
                    <p className="font-medium">{selectedProgram.venue}</p>
                  </div>
                  {selectedProgram.referencedBy && (
                    <div className="col-span-1 sm:col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium break-words">{selectedProgram.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                {selectedProgram.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedProgram.description}</p>
                  </div>
                )}

                {selectedProgram.lastEditedAt && (
                  <p className="text-xs text-muted-foreground italic">
                    Last edited by {selectedProgram.lastEditedBy?.name ?? 'Unknown'} on {new Date(selectedProgram.lastEditedAt).toLocaleString()}
                  </p>
                )}

                <div className="pt-2 border-t">
                  <AttachmentsList
                    contextType="TOUR"
                    contextId={selectedProgram.id}
                    emptyMessage="No supporting files were uploaded with this tour program."
                  />
                </div>

                <div>
                  <Label htmlFor="decisionNote">Decision Note (Optional)</Label>
                  <Textarea
                    id="decisionNote"
                    placeholder="Add a note for this decision..."
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    className="mt-1 resize-y"
                  />
                </div>
                
                <div className="flex flex-wrap justify-end gap-3 pt-5 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => handleDecision(selectedProgram.id, "REGRET")}
                    disabled={actionLoading === selectedProgram.id}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Regret (Send Letter)
                  </Button>
                  <Button 
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={() => {
                      setDetailsOpen(false);
                      handleOpenAssign(selectedProgram);
                    }}
                    disabled={assigning}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Verify and Assign to Staff
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Verify and Assign to Staff Dialog */}
        <Dialog
          open={assignDialogOpen}
          onOpenChange={(open) => {
            setAssignDialogOpen(open);
            if (!open) resetAssignForm();
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Verify and Assign to Staff
              </DialogTitle>
              <DialogDescription>
                Accept this tour invitation and create a task assigned to a staff member
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Assign To <span className="text-red-500">*</span></Label>
                <Select value={assignToId} onValueChange={setAssignToId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.email}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Task Title <span className="text-red-500">*</span></Label>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="mt-2"
                  placeholder="Task title"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="mt-2 min-h-[100px]"
                  placeholder="Task description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority <span className="text-red-500">*</span></Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="NORMAL">Normal</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due Date <span className="text-red-500">*</span></Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-2"
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-4 border-t justify-end">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={handleAssignTask}
                disabled={assigning || !assignToId || !taskTitle || !priority || !dueDate}
              >
                {assigning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Verify and Assign to Staff
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Tour Dialog — editable details, available to all roles. Decision flow untouched. */}
        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditError(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit Tour Program
              </DialogTitle>
              <DialogDescription>
                Update the tour details. Your name and the time will be recorded.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-eventName">Event Name</Label>
                  <Input
                    id="edit-eventName"
                    value={editForm.eventName}
                    onChange={(e) => setEditForm((f) => ({ ...f, eventName: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-organizer">Organizer</Label>
                  <Input
                    id="edit-organizer"
                    value={editForm.organizer}
                    onChange={(e) => setEditForm((f) => ({ ...f, organizer: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-organizerPhone">Organizer Phone</Label>
                  <Input
                    id="edit-organizerPhone"
                    value={editForm.organizerPhone}
                    onChange={(e) => setEditForm((f) => ({ ...f, organizerPhone: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-organizerEmail">Organizer Email</Label>
                  <Input
                    id="edit-organizerEmail"
                    type="email"
                    value={editForm.organizerEmail}
                    onChange={(e) => setEditForm((f) => ({ ...f, organizerEmail: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-dateTime">Date &amp; Time</Label>
                  <Input
                    id="edit-dateTime"
                    type="datetime-local"
                    value={editForm.dateTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateTime: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-venue">Venue</Label>
                  <Input
                    id="edit-venue"
                    value={editForm.venue}
                    onChange={(e) => setEditForm((f) => ({ ...f, venue: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-venueLink">Venue Link</Label>
                  <Input
                    id="edit-venueLink"
                    value={editForm.venueLink}
                    onChange={(e) => setEditForm((f) => ({ ...f, venueLink: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-referencedBy">Referenced By</Label>
                  <Input
                    id="edit-referencedBy"
                    value={editForm.referencedBy}
                    onChange={(e) => setEditForm((f) => ({ ...f, referencedBy: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    className="mt-1 resize-y min-h-[100px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
