import { useEffect, useState } from "react";
import { FileText, CheckCircle, XCircle, Download, RefreshCw, Eye, UserPlus } from "lucide-react";
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
import { SearchBar } from "@/components/common/SearchBar";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { CardListSkeleton } from "@/components/common/Skeletons";
import { StaffMultiSelect } from "@/components/StaffMultiSelect";
import { grievanceApi, pdfApi, taskApi, type Grievance, type TaskAssignment } from "@/lib/api";
import type { CsvColumn } from "@/lib/exportCsv";
import { usePrompt } from "@/components/common/PromptDialog";
import { CONSTITUENCY_OPTIONS } from "@/lib/constituencies";
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

export default function GrievanceVerification() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [, setVerifiedGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  
  // Status filter
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Source + priority filters
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  // Date range filter
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  // Client-side search box (narrows the already-fetched/server-filtered rows).
  const [query, setQuery] = useState<string>("");
  // Client-side constituency filter (narrows already-fetched rows).
  const [constituency, setConstituency] = useState("");

  const prompt = usePrompt();

  // Task assignment state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [verifiedGrievance, setVerifiedGrievance] = useState<Grievance | null>(null);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [assignToIds, setAssignToIds] = useState<string[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [_actionLoading, setActionLoading] = useState<string | null>(null);

  // Client-side search across petitioner, mobile and grievance type — narrows
  // the already server-filtered (status/source/priority/date) rows before paging.
  const filteredGrievances = grievances.filter((g) => {
    if (constituency && g.constituency !== constituency) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      g.petitionerName.toLowerCase().includes(q) ||
      g.mobileNumber.toLowerCase().includes(q) ||
      g.grievanceType.toLowerCase().includes(q)
    );
  });

  // CSV export — mirrors the currently filtered/visible rows.
  const csvColumns: CsvColumn<Grievance>[] = [
    { header: "Petitioner", value: (g) => g.petitionerName },
    { header: "Mobile", value: (g) => g.mobileNumber },
    { header: "Type", value: (g) => g.grievanceType },
    { header: "Constituency", value: (g) => g.constituency },
    { header: "Status", value: (g) => g.status },
    { header: "Priority", value: (g) => g.priority ?? "" },
    { header: "Created", value: (g) => new Date(g.createdAt).toLocaleString() },
  ];

  // Client-side pagination — 10 rows per page, matching the admin task tracker.
  const pager = usePagination(filteredGrievances, 10);

  const fetchGrievances = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use isVerified=false filter so the DB returns only unverified rows (fast index scan)
      const grievanceParams: Record<string, string> = { isVerified: 'false', limit: '50' };
      if (statusFilter !== "all") grievanceParams.status = statusFilter;
      if (sourceFilter !== "all") grievanceParams.source = sourceFilter;
      if (priorityFilter !== "all") grievanceParams.priority = priorityFilter;
      if (startDate) grievanceParams.startDate = startDate;
      if (endDate) grievanceParams.endDate = endDate;
      const [grievancesRes, tasksRes] = await Promise.all([
        grievanceApi.getAll(grievanceParams), // Get all grievances, not just OPEN
        taskApi.getAll({ limit: '50' }) // Get all tasks
      ]);
      
      console.log('GrievanceVerification - Grievances response:', grievancesRes);
      console.log('GrievanceVerification - Tasks response:', tasksRes);
      
      // Handle different response structures
      const tasksArray: TaskAssignment[] = Array.isArray(tasksRes?.data) ? tasksRes.data : [];
      
      // Get all task reference IDs (filter out undefined/null)
      const taskReferenceIds = new Set(
        tasksArray
          .map((t) => t.referenceId)
          .filter((id): id is string => Boolean(id))
      );
      
      console.log('GrievanceVerification - Task reference IDs:', Array.from(taskReferenceIds));
      
      // Handle grievances response structure
      let grievancesArray: Grievance[] = [];
      if (grievancesRes) {
        if (Array.isArray(grievancesRes)) {
          grievancesArray = grievancesRes;
        } else if (grievancesRes.data && Array.isArray(grievancesRes.data)) {
          grievancesArray = grievancesRes.data;
        }
      }
      
      // All rows are already unverified (filtered by backend)
      setGrievances(grievancesArray);

      // No verified grievances to track (they were excluded by the isVerified=false filter)
      setVerifiedGrievances([]);
      
      console.log('GrievanceVerification - Unverified grievances:', grievancesArray.length);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load grievances";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrievances();
    fetchStaffMembers();
  }, []);

  useEffect(() => {
    fetchGrievances();
  }, [statusFilter, sourceFilter, priorityFilter, startDate, endDate]);

  const fetchStaffMembers = async () => {
    try {
      const staff = await taskApi.getStaffMembers();
      setStaffMembers(staff);
    } catch (err) {
      console.error('Failed to fetch staff members:', err);
    }
  };

  const handleOpenAssignDialog = (grievance: Grievance) => {
    setVerifiedGrievance(grievance);
    setTaskTitle(`Follow up on ${grievance.grievanceType} - ${grievance.petitionerName}`);
    setTaskDescription(`Grievance Type: ${grievance.grievanceType}\nPetitioner: ${grievance.petitionerName}\nConstituency: ${grievance.constituency}\nDescription: ${grievance.description}`);
    setAssignDialogOpen(true);
  };

  const handleVerify = (id: string) => {
    // Just open the assign dialog — actual verify API call happens only on form submit
    const grievance = grievances.find((g) => g.id === id);
    if (grievance) {
      handleOpenAssignDialog(grievance);
    }
  };

  const handleAssignTask = async () => {
    if (assignToIds.length === 0 || !taskTitle || !verifiedGrievance) {
      setError("Please select at least one staff member and enter task title");
      return;
    }
    if (!priority) {
      setError("Please select a priority");
      return;
    }
    if (!dueDate?.trim()) {
      setError("Please select a due date");
      return;
    }

    setAssigning(true);
    try {
      // Step 1: Verify the grievance in the database
      await grievanceApi.verify(verifiedGrievance.id);

      // Step 2: Create the assigned task — one row per selected staff,
      // batched server-side via assignedToIds.
      await taskApi.create({
        title: taskTitle,
        description: taskDescription || undefined,
        taskType: 'GRIEVANCE',
        priority: priority as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
        referenceId: verifiedGrievance.id,
        referenceType: 'GRIEVANCE',
        assignedToIds: assignToIds,
        dueDate: dueDate || undefined,
      });

      // Remove from pending queue only after successful verify + assign
      setGrievances((prev) => prev.filter((g) => g.id !== verifiedGrievance.id));
      setAssignDialogOpen(false);
      resetAssignForm();
      setError(null);
      fetchGrievances();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to verify and assign task";
      setError(errorMessage);
    } finally {
      setAssigning(false);
    }
  };

  const resetAssignForm = () => {
    setAssignToIds([]);
    setTaskTitle("");
    setTaskDescription("");
    setDueDate("");
    setPriority("");
    setVerifiedGrievance(null);
  };

  const handleReject = async (id: string) => {
    const reason = await prompt({
      title: "Rejection reason",
      description: "Optional — staff will see this in their notification.",
      placeholder: "Enter a reason…",
      confirmText: "Reject",
    });
    if (reason === null) return; // user cancelled
    setActionLoading(id);
    try {
      await grievanceApi.updateStatus(id, 'REJECTED', reason.trim() || undefined);
      // Remove from list after rejection
      setGrievances((prev) => prev.filter((g) => g.id !== id));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reject grievance";
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      await pdfApi.downloadPDF(`/pdf/grievance/${id}`, `Grievance_Letter_${id}.pdf`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download PDF";
      setError(errorMessage);
    }
  };

  const handleViewDetails = (grievance: Grievance) => {
    setSelectedGrievance(grievance);
    setDetailsOpen(true);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Verify Grievances
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and approve submitted grievances
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2 shrink-0">
              <SearchBar
                value={query}
                onChange={setQuery}
                placeholder="Search petitioner, mobile, type…"
                className="w-[240px]"
              />
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <div className="w-[190px]">
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
              <div className="w-[140px]">
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="PUBLIC">Public</SelectItem>
                    <SelectItem value="OFFICE">Office</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[140px]">
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="CRITICAL">🚨 Critical</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[160px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <ExportCsvButton
                rows={filteredGrievances}
                columns={csvColumns}
                filename="grievance-verification"
              />
              <Button variant="outline" onClick={fetchGrievances} disabled={loading}>
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

          {/* Pending Verification Queue */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Pending Verification Queue ({filteredGrievances.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <CardListSkeleton rows={5} />
              ) : filteredGrievances.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">All grievances have been verified!</p>
                </div>
              ) : (
                pager.pageItems.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-4 rounded-xl border bg-white"
                  >
                    <div className="flex gap-4">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <FileText className="h-5 w-5 text-indigo-700" />
                      </div>

                      <div>
                        <div className="font-medium flex flex-wrap items-center gap-2">
                          <span>{g.petitionerName}</span>
                          <Badge variant="outline">{g.status}</Badge>
                          {g.source === 'OFFICE' && (
                            <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white">
                              Office
                            </Badge>
                          )}
                          {g.priority && g.priority !== 'MEDIUM' && (
                            <Badge
                              className={
                                g.priority === 'CRITICAL'
                                  ? 'bg-red-600 hover:bg-red-600 text-white'
                                  : g.priority === 'HIGH'
                                    ? 'bg-orange-500 hover:bg-orange-500 text-white'
                                    : 'bg-slate-400 hover:bg-slate-400 text-white'
                              }
                            >
                              {g.priority === 'CRITICAL' ? '🚨 Critical' : g.priority}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {g.grievanceType} • {g.constituency} • {formatCurrency(g.monetaryValue)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          📞 {g.mobileNumber} • Created by: {g.createdBy?.name || 'Unknown'}
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
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleVerify(g.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => handleDownloadPDF(g.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(g.id)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
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

        {/* Grievance Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Grievance Details
              </DialogTitle>
              <DialogDescription>
                Review full grievance information before taking action
              </DialogDescription>
            </DialogHeader>
            
            {selectedGrievance && (
              <div className="space-y-4">
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
                    <p className="text-sm text-muted-foreground">Grievance Type</p>
                    <p className="font-medium">{selectedGrievance.grievanceType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Monetary Value</p>
                    <p className="font-medium">{formatCurrency(selectedGrievance.monetaryValue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline">{selectedGrievance.status}</Badge>
                  </div>
                </div>
                
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
                  {!selectedGrievance.isVerified ? (
                    <>
                      <Button
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setDetailsOpen(false);
                          handleVerify(selectedGrievance.id);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Verify &amp; Assign
                      </Button>
                      <Button 
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => handleDownloadPDF(selectedGrievance.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download PDF
                      </Button>
                    </>
                  ) : (
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => {
                        handleOpenAssignDialog(selectedGrievance);
                        setDetailsOpen(false);
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign Task
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Task Assignment Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={(open) => {
          if (!open && !assigning) {
            // Dialog closed without assigning — grievance stays unverified in the pending queue
            setAssignToIds([]);
            setTaskTitle("");
            setTaskDescription("");
            setDueDate("");
            setPriority("");
            setVerifiedGrievance(null);
          }
          setAssignDialogOpen(open);
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Verify &amp; Assign Task
              </DialogTitle>
              <DialogDescription>
                Submitting this form will verify the grievance and assign a follow-up task to a staff member
              </DialogDescription>
            </DialogHeader>

            {verifiedGrievance && (
              <>
                {/* Scrollable middle — keeps the action buttons visible no matter how tall the staff list / description grow. */}
                <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
                  <div className="p-3 bg-indigo-50 rounded-lg">
                    <p className="text-sm font-medium text-indigo-900">Verified Grievance</p>
                    <p className="text-sm text-indigo-700">
                      {verifiedGrievance.petitionerName} • {verifiedGrievance.grievanceType} • {verifiedGrievance.constituency}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label>Assign To Staff *</Label>
                      <p className="text-xs text-muted-foreground mb-1">
                        Select one or more staff members. Each gets their own task row with shared progress.
                      </p>
                      <StaffMultiSelect
                        staff={staffMembers}
                        selectedIds={assignToIds}
                        onChange={setAssignToIds}
                      />
                    </div>

                    <div>
                      <Label htmlFor="taskTitle">Task Title *</Label>
                      <Input
                        id="taskTitle"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Enter task title"
                      />
                    </div>

                    <div>
                      <Label htmlFor="taskDescription">Task Description</Label>
                      <Textarea
                        id="taskDescription"
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Enter task description"
                        rows={4}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="priority">Priority <span className="text-red-500">*</span></Label>
                        <Select value={priority} onValueChange={setPriority}>
                          <SelectTrigger id="priority">
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
                        <Label htmlFor="dueDate">Due Date <span className="text-red-500">*</span></Label>
                        <Input
                          id="dueDate"
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sticky footer — always visible at the bottom of the dialog */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0 bg-background">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAssignDialogOpen(false);
                      resetAssignForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={handleAssignTask}
                    disabled={assigning || assignToIds.length === 0 || !taskTitle || !priority || !dueDate}
                  >
                    {assigning ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Verifying & Assigning...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Verify &amp; Assign
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
