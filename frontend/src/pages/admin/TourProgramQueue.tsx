import { useEffect, useState } from "react";
import { Calendar, CheckCircle, XCircle, RefreshCw, MapPin, User, Clock, Eye, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { tourProgramApi, taskApi, type TourProgram } from "@/lib/api";
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
  const [priority, setPriority] = useState("NORMAL");
  const [assigning, setAssigning] = useState(false);

  const fetchPrograms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tourProgramApi.getPending();
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

  const handleOpenAssign = (program: TourProgram) => {
    setSelectedProgram(program);
    setTaskTitle(`Tour Program: ${program.eventName}`);
    setTaskDescription(
      `Event: ${program.eventName}\n` +
      `Organizer: ${program.organizer}\n` +
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
    setPriority("NORMAL");
  };

  const handleAssignTask = async () => {
    if (!selectedProgram || !assignToId || !taskTitle) {
      alert("Please select a staff member and enter task title");
      return;
    }
    setAssigning(true);
    try {
      let finalDueDate: string | undefined;
      if (dueDate?.trim()) {
        const dateObj = new Date(dueDate + "T00:00:00");
        if (!isNaN(dateObj.getTime())) finalDueDate = dateObj.toISOString();
      }
      await taskApi.create({
        title: taskTitle.trim(),
        description: taskDescription?.trim() || undefined,
        taskType: "TOUR_PROGRAM",
        priority: priority || "NORMAL",
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

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Tour Program Queue
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and decide on submitted invitations
              </p>
            </div>
            <Button variant="outline" onClick={fetchPrograms} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              ❌ {error}
            </div>
          )}

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Pending Invitations ({programs.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading invitations...</p>
              ) : programs.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending invitations!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All tour program invitations have been reviewed.
                  </p>
                </div>
              ) : (
                programs.map((p) => {
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
                          <p className="font-medium text-indigo-900">
                            {p.eventName}
                            <Badge className="ml-2 bg-amber-100 text-amber-800" variant="outline">
                              Pending
                            </Badge>
                          </p>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              {p.organizer}
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
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Event Name</p>
                    <p className="font-medium">{selectedProgram.eventName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer</p>
                    <p className="font-medium">{selectedProgram.organizer}</p>
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
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedProgram.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                {selectedProgram.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedProgram.description}</p>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="decisionNote">Decision Note (Optional)</Label>
                  <Textarea
                    id="decisionNote"
                    placeholder="Add a note for this decision..."
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-4 border-t">
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
                    className="bg-green-600 hover:bg-green-700"
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
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
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
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-2"
                    min={new Date().toISOString().split("T")[0]}
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
                disabled={assigning || !assignToId || !taskTitle}
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
      </main>
    </div>
  );
}
