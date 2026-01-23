import { useEffect, useState } from "react";
import { Train, Printer, CheckCircle, XCircle, RefreshCw, Eye, Download, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { trainRequestApi, pdfApi, taskApi, type TrainRequest } from "@/lib/api";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface StaffMember {
  id: string;
  name: string;
  email: string;
}

export default function TrainEQQueue() {
  const [requests, setRequests] = useState<TrainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  
  // Task assignment states
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TrainRequest | null>(null);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [assignToId, setAssignToId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [assigning, setAssigning] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await trainRequestApi.getAll({ status: 'PENDING' });
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
    fetchStaffMembers();
  }, []);

  const fetchStaffMembers = async () => {
    try {
      const staffRes = await taskApi.getStaffMembers();
      setStaffMembers(staffRes || []);
    } catch (err) {
      console.error('Failed to fetch staff members:', err);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await trainRequestApi.approve(id);
      // Remove from list after approval
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to approve request";
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await trainRequestApi.reject(id);
      // Remove from list after rejection
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reject request";
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePreview = async (id: string) => {
    setPreviewLoading(true);
    setSelectedRequestId(id);
    try {
      const html = await pdfApi.previewTrainEQLetter(id);
      setPreviewContent(html as string);
      setPreviewOpen(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load preview";
      setError(errorMessage);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      await pdfApi.downloadPDF(`/pdf/train-eq/${id}`, `TrainEQ_Letter_${id}.pdf`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download PDF";
      setError(errorMessage);
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const handleOpenAssign = (request: TrainRequest) => {
    setSelectedRequest(request);
    setTaskTitle(`Train EQ: ${request.passengerName} - PNR ${request.pnrNumber}`);
    setTaskDescription(
      `Passenger: ${request.passengerName}\n` +
      `PNR: ${request.pnrNumber}\n` +
      `Train: ${request.trainName || 'N/A'} (${request.trainNumber || 'N/A'})\n` +
      `Journey Date: ${formatDate(request.dateOfJourney)}\n` +
      `Route: ${request.fromStation} → ${request.toStation}\n` +
      `Class: ${request.journeyClass}`
    );
    setAssignDialogOpen(true);
  };

  const resetAssignForm = () => {
    setAssignToId("");
    setTaskTitle("");
    setTaskDescription("");
    setDueDate("");
    setPriority("NORMAL");
    setSelectedRequest(null);
  };

  const handleAssignTask = async () => {
    if (!assignToId || !taskTitle || !selectedRequest) {
      alert('Please select a staff member and enter task title');
      return;
    }
    
    setAssigning(true);
    try {
      // Format dueDate - convert YYYY-MM-DD to ISO8601 format
      let finalDueDate: string | undefined = undefined;
      if (dueDate && dueDate.trim()) {
        try {
          const dateObj = new Date(dueDate + 'T00:00:00');
          if (!isNaN(dateObj.getTime())) {
            finalDueDate = dateObj.toISOString();
          } else {
            finalDueDate = dueDate.trim();
          }
        } catch (e) {
          console.error('Date parsing error:', e);
          finalDueDate = dueDate.trim();
        }
      }
      
      // Validate assignedToId is a UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(assignToId)) {
        alert('Invalid staff member selected. Please select a valid staff member.');
        setAssigning(false);
        return;
      }
      
      console.log('Creating task with:', {
        title: taskTitle.trim(),
        taskType: 'TRAIN_REQUEST',
        assignedToId: assignToId,
        dueDate: finalDueDate,
        referenceId: selectedRequest.id,
        referenceType: 'TRAIN_REQUEST',
        priority,
      });
      
      const createdTask = await taskApi.create({
        title: taskTitle.trim(),
        description: taskDescription?.trim() || undefined,
        taskType: 'TRAIN_REQUEST',
        priority: priority || 'NORMAL',
        referenceId: selectedRequest.id,
        referenceType: 'TRAIN_REQUEST',
        assignedToId: assignToId,
        dueDate: finalDueDate,
      });
      
      console.log('Task created successfully:', createdTask);
      
      // Show success message
      const staffName = createdTask.assignedTo?.name || 'Staff member';
      alert(`✅ Task assigned successfully!\n\nAssigned to: ${staffName}\nTask: ${createdTask.title}`);
      
      // Close dialog and reset form
      setAssignDialogOpen(false);
      resetAssignForm();
      
      // Refresh requests
      await fetchRequests();
    } catch (error: any) {
      console.error('Failed to assign task - Full error:', error);
      console.error('Error response:', error?.response?.data);
      
      let errorMessage = 'Failed to assign task. Please check all fields and try again.';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      if (error?.errors && Array.isArray(error.errors)) {
        const validationErrors = error.errors.map((e: any) => {
          const field = e.field || e.path || 'field';
          const msg = e.message || e.msg || 'Invalid value';
          return `${field}: ${msg}`;
        }).join('\n');
        if (validationErrors) {
          errorMessage = `Validation Errors:\n${validationErrors}`;
        }
      } else if (error?.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const validationErrors = error.response.data.errors.map((e: any) => {
          const field = e.field || 'field';
          const msg = e.message || 'Invalid value';
          return `${field}: ${msg}`;
        }).join('\n');
        if (validationErrors) {
          errorMessage = `Validation Errors:\n${validationErrors}`;
        }
      }
      alert(`Task Assignment Failed:\n\n${errorMessage}\n\nPlease check the console for more details.`);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Train EQ Requests
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and issue emergency quota letters
              </p>
            </div>
            <Button variant="outline" onClick={fetchRequests} disabled={loading}>
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
              <CardTitle>Pending EQ Requests ({requests.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading requests...</p>
              ) : requests.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending train EQ requests!</p>
                </div>
              ) : (
                requests.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-4 rounded-xl border bg-white"
                  >
                    <div className="flex gap-4">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <Train className="h-5 w-5 text-indigo-700" />
                      </div>

                      <div>
                        <p className="font-medium">
                          {r.passengerName}
                          <Badge className="ml-2" variant="outline">
                            {r.status}
                          </Badge>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          PNR: {r.pnrNumber} • {r.fromStation} → {r.toStation} • {new Date(r.dateOfJourney).toLocaleDateString()} • {r.journeyClass}
                        </p>
                        {r.trainName && (
                          <p className="text-xs text-muted-foreground mt-1">
                            🚂 {r.trainNumber} - {r.trainName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Created by: {r.createdBy?.name || 'Unknown'} • {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handlePreview(r.id)}
                        disabled={previewLoading && selectedRequestId === r.id}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {previewLoading && selectedRequestId === r.id ? "..." : "Preview"}
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => handleDownloadPDF(r.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download PDF
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-blue-600 border-blue-600 hover:bg-blue-50"
                        onClick={() => handleOpenAssign(r)}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Assign Task
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(r.id)}
                        disabled={actionLoading === r.id}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {actionLoading === r.id ? "..." : "Approve"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleReject(r.id)}
                        disabled={actionLoading === r.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>

        {/* Letter Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Train EQ Letter Preview
              </DialogTitle>
            </DialogHeader>
            <div 
              className="border rounded-lg p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: previewContent }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              {selectedRequestId && (
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => handleDownloadPDF(selectedRequestId)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download PDF
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Assign Task Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={(open) => {
          setAssignDialogOpen(open);
          if (!open) {
            resetAssignForm();
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Assign Task to Staff</DialogTitle>
              <DialogDescription>
                Create a task for this Train EQ request and assign it to a staff member
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Assign To <span className="text-red-500">*</span></Label>
                <Select value={assignToId} onValueChange={setAssignToId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.name} ({staff.email})
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
                  className="mt-1"
                  placeholder="Enter task title"
                />
              </div>
              
              <div>
                <Label>Description</Label>
                <Textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="mt-1"
                  placeholder="Enter task description and instructions"
                  rows={4}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="mt-1">
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
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleAssignTask}
                  disabled={assigning || !assignToId || !taskTitle}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {assigning ? "Assigning..." : "Assign Task"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
