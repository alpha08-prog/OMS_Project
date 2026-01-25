import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FileText, 
  Train, 
  Calendar,
  CheckCircle,
  XCircle,
  Eye,
  UserPlus,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { 
  grievanceApi, 
  trainRequestApi, 
  tourProgramApi,
  taskApi,
  type Grievance, 
  type TrainRequest, 
  type TourProgram,
} from "@/lib/api";
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

type ActionType = 'grievance' | 'train' | 'tour';

interface StaffMember {
  id: string;
  name: string;
  email: string;
}

export default function AdminActionCenter() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingGrievances, setPendingGrievances] = useState<Grievance[]>([]);
  const [pendingTrainRequests, setPendingTrainRequests] = useState<TrainRequest[]>([]);
  const [pendingTourPrograms, setPendingTourPrograms] = useState<TourProgram[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  
  // Dialog states
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<ActionType>('grievance');
  
  // Assignment form
  const [assignToId, setAssignToId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [assigning, setAssigning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all items, not just pending ones - we'll filter client-side
      const [grievancesRes, trainRes, tourRes, staffRes] = await Promise.all([
        grievanceApi.getAll({ limit: '200' }), // Get more grievances
        trainRequestApi.getAll({ limit: '200' }), // Get all train requests
        tourProgramApi.getAll({ limit: '200' }), // Get all tour programs
        taskApi.getStaffMembers(),
      ]);
      
      console.log('ActionCenter - Grievances response:', grievancesRes);
      console.log('ActionCenter - Train Requests response:', trainRes);
      console.log('ActionCenter - Tour Programs response:', tourRes);
      console.log('ActionCenter - Staff Members response:', staffRes);
      
      // Ensure data exists and is an array
      // All API responses are ApiResponse<T>, so they have { success, message, data: T[], meta }
      const grievances = Array.isArray(grievancesRes?.data) 
        ? grievancesRes.data 
        : Array.isArray(grievancesRes) 
          ? grievancesRes 
          : [];
      const trainRequests = Array.isArray(trainRes?.data) 
        ? trainRes.data 
        : Array.isArray(trainRes) 
          ? trainRes 
          : [];
      const tourPrograms = Array.isArray(tourRes?.data) 
        ? tourRes.data 
        : Array.isArray(tourRes) 
          ? tourRes 
          : [];
      // getStaffMembers() returns res.data.data, so it's already the array
      const staff = Array.isArray(staffRes) 
        ? staffRes 
        : Array.isArray(staffRes?.data) 
          ? staffRes.data 
          : [];
      
      console.log('ActionCenter - Processed grievances:', grievances.length);
      console.log('ActionCenter - Processed train requests:', trainRequests.length);
      console.log('ActionCenter - Processed tour programs:', tourPrograms.length);
      
      // Filter for pending items: OPEN grievances that are not verified, PENDING train requests, PENDING tour programs
      const pendingGrievances = grievances.filter((g: Grievance) => 
        g.status === 'OPEN' && !g.isVerified
      );
      const pendingTrainRequests = trainRequests.filter((t: TrainRequest) => 
        t.status === 'PENDING'
      );
      const pendingTourPrograms = tourPrograms.filter((tp: TourProgram) => 
        !tp.decision || tp.decision === 'PENDING'
      );
      
      console.log('ActionCenter - Pending grievances:', pendingGrievances.length);
      console.log('ActionCenter - Pending train requests:', pendingTrainRequests.length);
      console.log('ActionCenter - Pending tour programs:', pendingTourPrograms.length);
      
      setPendingGrievances(pendingGrievances);
      setPendingTrainRequests(pendingTrainRequests);
      setPendingTourPrograms(pendingTourPrograms);
      setStaffMembers(staff);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      console.error('Error details:', error?.response?.data || error?.message);
      // Set empty arrays on error to prevent undefined errors
      setPendingGrievances([]);
      setPendingTrainRequests([]);
      setPendingTourPrograms([]);
      setStaffMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleViewDetails = (item: any, type: ActionType) => {
    setSelectedItem(item);
    setSelectedType(type);
    setDetailsOpen(true);
  };

  const handleOpenAssign = (item: any, type: ActionType) => {
    setSelectedItem(item);
    setSelectedType(type);
    
    // Pre-fill task title and description based on type
    if (type === 'grievance') {
      setTaskTitle(`Follow up on ${item.grievanceType} - ${item.petitionerName}`);
      setTaskDescription(
        `Grievance Type: ${item.grievanceType}\n` +
        `Petitioner: ${item.petitionerName}\n` +
        `Mobile: ${item.mobileNumber}\n` +
        `Constituency: ${item.constituency}\n` +
        `Description: ${item.description || 'N/A'}`
      );
    } else if (type === 'train') {
      setTaskTitle(`Train EQ: ${item.passengerName} - PNR ${item.pnrNumber}`);
      setTaskDescription(
        `Passenger: ${item.passengerName}\n` +
        `PNR: ${item.pnrNumber}\n` +
        `Train: ${item.trainName} (${item.trainNumber})\n` +
        `Journey Date: ${formatDate(item.dateOfJourney)}\n` +
        `Route: ${item.fromStation} → ${item.toStation}\n` +
        `Class: ${item.journeyClass}`
      );
    } else if (type === 'tour') {
      setTaskTitle(`Tour Program: ${item.eventName}`);
      setTaskDescription(
        `Event: ${item.eventName}\n` +
        `Organizer: ${item.organizer}\n` +
        `Date & Time: ${formatDate(item.dateTime || item.eventDate)}\n` +
        `Venue: ${item.venue}\n` +
        `${item.description ? `Description: ${item.description}` : ''}`
      );
    }
    
    setAssignDialogOpen(true);
  };

  const handleVerifyGrievance = async (id: string) => {
    try {
      await grievanceApi.verify(id);
      fetchData();
    } catch (error) {
      console.error('Failed to verify:', error);
    }
  };

  const handleApproveTrainRequest = async (id: string) => {
    try {
      await trainRequestApi.approve(id);
      fetchData();
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleRejectTrainRequest = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (reason !== null) {
      try {
        await trainRequestApi.reject(id, reason);
        fetchData();
      } catch (error) {
        console.error('Failed to reject:', error);
      }
    }
  };

  const handleTourDecision = async (id: string, decision: 'ACCEPTED' | 'REGRET') => {
    const note = decision === 'REGRET' ? prompt('Enter regret note:') : undefined;
    try {
      await tourProgramApi.updateDecision(id, decision, note || undefined);
      fetchData();
    } catch (error) {
      console.error('Failed to update decision:', error);
    }
  };

  const handleAssignTask = async () => {
    if (!assignToId || !taskTitle) {
      alert('Please select a staff member and enter task title');
      return;
    }
    
    setAssigning(true);
    try {
      let taskType: 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM' = 'GRIEVANCE';
      let referenceType = 'GRIEVANCE';
      
      if (selectedType === 'train') {
        taskType = 'TRAIN_REQUEST';
        referenceType = 'TRAIN_REQUEST';
      } else if (selectedType === 'tour') {
        taskType = 'TOUR_PROGRAM';
        referenceType = 'TOUR_PROGRAM';
      }
      
      // Format dueDate - convert YYYY-MM-DD to ISO8601 format
      let finalDueDate: string | undefined = undefined;
      if (dueDate && dueDate.trim()) {
        try {
          // HTML date input gives YYYY-MM-DD format
          const dateObj = new Date(dueDate + 'T00:00:00');
          if (!isNaN(dateObj.getTime())) {
            finalDueDate = dateObj.toISOString();
          }
        } catch (e) {
          console.error('Date parsing error:', e);
        }
      }
      
      // Validate assignedToId is a UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(assignToId)) {
        alert('Invalid staff member selected. Please select a valid staff member.');
        setAssigning(false);
        return;
      }
      
      // Ensure selectedItem exists
      if (!selectedItem || !selectedItem.id) {
        alert('No item selected for task assignment. Please try again.');
        setAssigning(false);
        return;
      }
      
      // Debug log
      console.log('Creating task with:', {
        title: taskTitle.trim(),
        taskType,
        assignedToId: assignToId,
        dueDate: finalDueDate,
        referenceId: selectedItem.id,
        referenceType,
        priority,
      });
      
      const createdTask = await taskApi.create({
        title: taskTitle.trim(),
        description: taskDescription?.trim() || undefined,
        taskType,
        priority: priority || 'NORMAL',
        referenceId: selectedItem.id,
        referenceType,
        assignedToId: assignToId,
        dueDate: finalDueDate,
      });
      
      console.log('Task created successfully:', createdTask);
      
      // Show success message with details
      const staffName = createdTask.assignedTo?.name || 'Staff member';
      alert(`✅ Task assigned successfully!\n\nAssigned to: ${staffName}\nTask: ${createdTask.title}`);
      
      // Close dialog and reset form
      setAssignDialogOpen(false);
      resetAssignForm();
      
      // Refresh data to show updated counts
      await fetchData();
    } catch (error: any) {
      console.error('Failed to assign task - Full error:', error);
      console.error('Error response:', error?.response?.data);
      console.error('Error status:', error?.status);
      
      // Extract error message from response
      let errorMessage = 'Failed to assign task. Please check all fields and try again.';
      
      // The interceptor assigns response.data to the error object
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      // Also check for validation errors
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

  const resetAssignForm = () => {
    setAssignToId("");
    setTaskTitle("");
    setTaskDescription("");
    setDueDate("");
    setPriority("NORMAL");
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

  const totalPending = pendingGrievances.length + pendingTrainRequests.length + pendingTourPrograms.length;

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
                  Action Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Review, verify and assign tasks to staff
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fetchData()} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button variant="outline" onClick={() => navigate('/admin/history')}>
                  View Full History
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button onClick={() => navigate('/admin/task-tracker')}>
                  View Task Tracker
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>

            {/* Summary Card */}
            <Card className="rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-indigo-100">Total Pending Actions</p>
                    <p className="text-4xl font-bold">{totalPending}</p>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{pendingGrievances.length}</p>
                      <p className="text-sm text-indigo-100">Grievances</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{pendingTrainRequests.length}</p>
                      <p className="text-sm text-indigo-100">Train EQ</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{pendingTourPrograms.length}</p>
                      <p className="text-sm text-indigo-100">Tour Programs</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Tiles Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Grievances Tile */}
              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    Pending Grievances
                  </CardTitle>
                  <Badge variant={pendingGrievances.length > 0 ? "destructive" : "secondary"}>
                    {pendingGrievances.length}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
                  {pendingGrievances.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No pending grievances</p>
                  ) : (
                    pendingGrievances.slice(0, 5).map((g) => (
                      <div key={g.id} className="p-3 rounded-lg bg-gray-50 hover:bg-indigo-50 transition">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-sm">{g.petitionerName}</p>
                            <p className="text-xs text-muted-foreground">{g.grievanceType}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">{formatDate(g.createdAt)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{g.description}</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleViewDetails(g, 'grievance')}>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => handleVerifyGrievance(g.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verify
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600" onClick={() => handleOpenAssign(g, 'grievance')}>
                            <UserPlus className="h-3 w-3 mr-1" />
                            Assign
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  {pendingGrievances.length > 5 && (
                    <Button variant="link" className="w-full" onClick={() => navigate('/grievances/verify')}>
                      View all {pendingGrievances.length} grievances
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Train Requests Tile */}
              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Train className="h-5 w-5 text-amber-600" />
                    Train EQ Requests
                  </CardTitle>
                  <Badge variant={pendingTrainRequests.length > 0 ? "destructive" : "secondary"}>
                    {pendingTrainRequests.length}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
                  {pendingTrainRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No pending requests</p>
                  ) : (
                    pendingTrainRequests.slice(0, 5).map((t) => (
                      <div key={t.id} className="p-3 rounded-lg bg-gray-50 hover:bg-amber-50 transition">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-sm">{t.passengerName}</p>
                            <p className="text-xs text-muted-foreground">PNR: {t.pnrNumber}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">{formatDate(t.dateOfJourney)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t.fromStation} → {t.toStation} | Class: {t.journeyClass}
                        </p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleViewDetails(t, 'train')}>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => handleApproveTrainRequest(t.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleRejectTrainRequest(t.id)}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  {pendingTrainRequests.length > 5 && (
                    <Button variant="link" className="w-full" onClick={() => navigate('/train-eq/queue')}>
                      View all {pendingTrainRequests.length} requests
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Tour Programs Tile */}
              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-600" />
                    Tour Invitations
                  </CardTitle>
                  <Badge variant={pendingTourPrograms.length > 0 ? "destructive" : "secondary"}>
                    {pendingTourPrograms.length}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
                  {pendingTourPrograms.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No pending invitations</p>
                  ) : (
                    pendingTourPrograms.slice(0, 5).map((tour) => (
                      <div key={tour.id} className="p-3 rounded-lg bg-gray-50 hover:bg-green-50 transition">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-sm">{tour.eventName}</p>
                            <p className="text-xs text-muted-foreground">{tour.organizer}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">{formatDate(tour.dateTime)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{tour.venue}</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleViewDetails(tour, 'tour')}>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => handleTourDecision(tour.id, 'ACCEPTED')}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Accept
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleTourDecision(tour.id, 'REGRET')}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Regret
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  {pendingTourPrograms.length > 5 && (
                    <Button variant="link" className="w-full" onClick={() => navigate('/tour-program/pending')}>
                      View all {pendingTourPrograms.length} invitations
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
        </div>

        {/* Details Dialog - Large and Comprehensive */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="w-[95vw] max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-2xl font-bold text-indigo-900">
                    {selectedType === 'grievance' ? 'Grievance Details' :
                     selectedType === 'train' ? 'Train Enquiry Request Details' : 'Tour Program Details'}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Complete information and available actions
                  </p>
                </div>
                {selectedItem && (
                  <Badge variant={selectedItem.status === 'OPEN' || selectedItem.status === 'PENDING' ? 'destructive' : 'secondary'} className="text-sm px-3 py-1">
                    {selectedItem.status || 'PENDING'}
                  </Badge>
                )}
              </div>
            </DialogHeader>
            
            {selectedItem && (
              <div className="space-y-6 pt-4">
                {selectedType === 'grievance' && (
                  <>
                    {/* Grievance Header Info */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-semibold text-indigo-900">{selectedItem.petitionerName}</h3>
                          <p className="text-indigo-700 font-medium">{selectedItem.grievanceType}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Submitted on</p>
                          <p className="font-medium">{formatDate(selectedItem.createdAt)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Grievance Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Contact Number</p>
                        <p className="font-semibold text-lg">{selectedItem.mobileNumber}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Constituency</p>
                        <p className="font-semibold text-lg">{selectedItem.constituency}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Verification Status</p>
                        <Badge variant={selectedItem.isVerified ? 'default' : 'outline'} className="mt-1">
                          {selectedItem.isVerified ? 'Verified' : 'Not Verified'}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Action Required</p>
                        <p className="font-medium">{selectedItem.actionRequired || 'Not specified'}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Referenced By</p>
                        <p className="font-medium">{selectedItem.referencedBy || 'Direct submission'}</p>
                      </div>
                    </div>

                    {/* Description Section */}
                    <div className="bg-gray-50 rounded-xl p-5">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Grievance Description</p>
                      <p className="text-gray-800 leading-relaxed">{selectedItem.description || 'No description provided'}</p>
                    </div>

                    {/* Attachments if any */}
                    {selectedItem.attachmentPath && (
                      <div className="bg-blue-50 rounded-xl p-4">
                        <p className="text-sm font-medium text-blue-800 mb-2">Attachments</p>
                        <a href={selectedItem.attachmentPath} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          View Attachment
                        </a>
                      </div>
                    )}

                    {/* Quick Actions for Grievance */}
                    <div className="bg-white border-2 border-indigo-100 rounded-xl p-5">
                      <h4 className="font-semibold text-indigo-900 mb-4">Quick Actions</h4>
                      <div className="flex flex-wrap gap-3">
                        {!selectedItem.isVerified && (
                          <Button 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              handleVerifyGrievance(selectedItem.id);
                              setDetailsOpen(false);
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Verify Grievance
                          </Button>
                        )}
                        <Button 
                          className="bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => {
                            setDetailsOpen(false);
                            handleOpenAssign(selectedItem, selectedType);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign to Staff
                        </Button>

                      </div>
                    </div>
                  </>
                )}
                
                {selectedType === 'train' && (
                  <>
                    {/* Train Request Header */}
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-semibold text-amber-900">{selectedItem.passengerName}</h3>
                          <p className="text-amber-700 font-medium">PNR: {selectedItem.pnrNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Journey Date</p>
                          <p className="font-medium">{formatDate(selectedItem.dateOfJourney)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Journey Details */}
                    <div className="bg-white border-2 border-amber-100 rounded-xl p-5">
                      <h4 className="font-semibold text-amber-900 mb-4 flex items-center gap-2">
                        <Train className="h-5 w-5" />
                        Journey Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-amber-50/50 rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Train Details</p>
                          <p className="font-semibold">{selectedItem.trainName}</p>
                          <p className="text-sm text-muted-foreground">{selectedItem.trainNumber}</p>
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">From Station</p>
                          <p className="font-semibold text-lg">{selectedItem.fromStation}</p>
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">To Station</p>
                          <p className="font-semibold text-lg">{selectedItem.toStation}</p>
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Class</p>
                          <p className="font-semibold">{selectedItem.journeyClass}</p>
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Quota</p>
                          <p className="font-semibold">{selectedItem.quota || 'General'}</p>
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Passengers</p>
                          <p className="font-semibold">{selectedItem.numberOfPassengers || 1}</p>
                        </div>
                      </div>
                    </div>

                    {/* Contact Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Contact Number</p>
                        <p className="font-semibold text-lg">{selectedItem.contactNumber || selectedItem.mobileNumber || 'N/A'}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Submitted On</p>
                        <p className="font-semibold">{formatDate(selectedItem.createdAt)}</p>
                      </div>
                    </div>

                    {/* Remarks if any */}
                    {selectedItem.remarks && (
                      <div className="bg-gray-50 rounded-xl p-5">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Remarks / Notes</p>
                        <p className="text-gray-800 leading-relaxed">{selectedItem.remarks}</p>
                      </div>
                    )}

                    {/* Quick Actions for Train */}
                    <div className="bg-white border-2 border-amber-100 rounded-xl p-5">
                      <h4 className="font-semibold text-amber-900 mb-4">Quick Actions</h4>
                      <div className="flex flex-wrap gap-3">
                        <Button 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            handleApproveTrainRequest(selectedItem.id);
                            setDetailsOpen(false);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve Request
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={() => {
                            handleRejectTrainRequest(selectedItem.id);
                            setDetailsOpen(false);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject Request
                        </Button>
                        <Button 
                          className="bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => {
                            setDetailsOpen(false);
                            handleOpenAssign(selectedItem, selectedType);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign to Staff
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                
                {selectedType === 'tour' && (
                  <>
                    {/* Tour Event Header */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-semibold text-green-900">{selectedItem.eventName}</h3>
                          <p className="text-green-700 font-medium">by {selectedItem.organizer}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={selectedItem.decision === 'ACCEPTED' ? 'default' : selectedItem.decision === 'REGRET' ? 'destructive' : 'secondary'}>
                            {selectedItem.decision || 'PENDING'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Event Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          <Calendar className="h-4 w-4 inline mr-1" />
                          Date & Time
                        </p>
                        <p className="font-semibold text-lg">{formatDate(selectedItem.dateTime || selectedItem.eventDate)}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-4 shadow-sm col-span-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Venue</p>
                        <p className="font-semibold text-lg">{selectedItem.venue}</p>
                      </div>
                    </div>

                    {/* Organizer Contact */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Contact Person</p>
                        <p className="font-semibold">{selectedItem.contactPerson || selectedItem.organizer}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Contact Number</p>
                        <p className="font-semibold">{selectedItem.contactNumber || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Description if any */}
                    {selectedItem.description && (
                      <div className="bg-gray-50 rounded-xl p-5">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Event Description</p>
                        <p className="text-gray-800 leading-relaxed">{selectedItem.description}</p>
                      </div>
                    )}

                    {/* Notes if any */}
                    {selectedItem.notes && (
                      <div className="bg-blue-50 rounded-xl p-5">
                        <p className="text-sm font-medium text-blue-800 mb-2">Additional Notes</p>
                        <p className="text-blue-900 leading-relaxed">{selectedItem.notes}</p>
                      </div>
                    )}

                    {/* Quick Actions for Tour */}
                    <div className="bg-white border-2 border-green-100 rounded-xl p-5">
                      <h4 className="font-semibold text-green-900 mb-4">Quick Actions</h4>
                      <div className="flex flex-wrap gap-3">
                        <Button 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            handleTourDecision(selectedItem.id, 'ACCEPTED');
                            setDetailsOpen(false);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Accept Invitation
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={() => {
                            handleTourDecision(selectedItem.id, 'REGRET');
                            setDetailsOpen(false);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Send Regret
                        </Button>
                        <Button 
                          className="bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => {
                            setDetailsOpen(false);
                            handleOpenAssign(selectedItem, selectedType);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign to Staff
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                
                {/* Close Button at Bottom */}
                <div className="flex justify-end pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)} size="lg">
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign Task Dialog - Larger with Reference Info */}
        <Dialog open={assignDialogOpen} onOpenChange={(open) => {
          setAssignDialogOpen(open);
          if (!open) {
            // Reset form when dialog closes
            resetAssignForm();
          }
        }}>
          <DialogContent className="w-[90vw] max-w-none max-h-[95vh] overflow-y-auto">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-2xl font-bold text-indigo-900">Assign Task to Staff</DialogTitle>
              <DialogDescription className="text-base">
                Create a task from this {selectedType === 'grievance' ? 'grievance' : selectedType === 'train' ? 'train request' : 'tour program'} and assign it to a staff member
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
              {/* Left Column - Reference Information */}
              <div className="space-y-5">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  Reference Information
                </h4>
                
                {selectedItem && selectedType === 'grievance' && (
                  <div className="bg-indigo-50 rounded-xl p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-indigo-900 text-lg">{selectedItem.petitionerName}</p>
                        <p className="text-indigo-700">{selectedItem.grievanceType}</p>
                      </div>
                      <Badge variant="outline" className="text-sm">{selectedItem.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Mobile</p>
                        <p className="font-medium">{selectedItem.mobileNumber}</p>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Constituency</p>
                        <p className="font-medium">{selectedItem.constituency}</p>
                      </div>
                    </div>
                    {selectedItem.description && (
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Description</p>
                        <p className="font-medium text-sm leading-relaxed">{selectedItem.description}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedItem && selectedType === 'train' && (
                  <div className="bg-amber-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-amber-900">{selectedItem.passengerName}</p>
                        <p className="text-sm text-amber-700">PNR: {selectedItem.pnrNumber}</p>
                      </div>
                      <Badge variant="outline">{selectedItem.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Train</p>
                        <p className="font-medium">{selectedItem.trainName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Journey Date</p>
                        <p className="font-medium">{formatDate(selectedItem.dateOfJourney)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Route</p>
                        <p className="font-medium">{selectedItem.fromStation} → {selectedItem.toStation}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Class</p>
                        <p className="font-medium">{selectedItem.journeyClass}</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedItem && selectedType === 'tour' && (
                  <div className="bg-green-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-green-900">{selectedItem.eventName}</p>
                        <p className="text-sm text-green-700">by {selectedItem.organizer}</p>
                      </div>
                      <Badge variant="outline">{selectedItem.decision || 'PENDING'}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Date & Time</p>
                        <p className="font-medium">{formatDate(selectedItem.dateTime || selectedItem.eventDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Venue</p>
                        <p className="font-medium">{selectedItem.venue}</p>
                      </div>
                    </div>
                    {selectedItem.description && (
                      <div className="text-sm">
                        <p className="text-muted-foreground">Description</p>
                        <p className="font-medium line-clamp-3">{selectedItem.description}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column - Task Assignment Form */}
              <div className="space-y-5">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2 text-lg">
                  <UserPlus className="h-5 w-5" />
                  Task Assignment
                </h4>

                <div className="space-y-5 bg-gray-50 rounded-xl p-5 border">
                  <div>
                    <Label className="text-sm font-medium">Assign To <span className="text-red-500">*</span></Label>
                    <Select value={assignToId} onValueChange={setAssignToId}>
                      <SelectTrigger className="mt-2 h-11">
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffMembers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id} className="py-2">
                            <div>
                              <p className="font-medium">{staff.name}</p>
                              <p className="text-xs text-muted-foreground">{staff.email}</p>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Task Title <span className="text-red-500">*</span></Label>
                    <Input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="mt-2 h-11"
                      placeholder="Enter task title"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Description</Label>
                    <Textarea
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                      className="mt-2 min-h-[350px] resize-none"
                      placeholder="Enter task description and instructions for the staff member..."
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Priority</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger className="mt-2 h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                              Low
                            </span>
                          </SelectItem>
                          <SelectItem value="NORMAL">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              Normal
                            </span>
                          </SelectItem>
                          <SelectItem value="HIGH">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                              High
                            </span>
                          </SelectItem>
                          <SelectItem value="URGENT">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              Urgent
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium">Due Date</Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="mt-2 h-11"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer Actions */}
            <div className="flex gap-3 pt-6 mt-6 border-t">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)} size="lg" className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleAssignTask}
                disabled={assigning || !assignToId || !taskTitle}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                size="lg"
              >
                {assigning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Task
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
