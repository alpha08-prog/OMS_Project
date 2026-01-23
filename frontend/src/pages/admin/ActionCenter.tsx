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
  historyApi,
  type Grievance, 
  type TrainRequest, 
  type TourProgram,
  type HistoryItem
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
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
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

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const historyRes = await historyApi.getHistory({ page: 1, limit: 10 });
      console.log('ActionCenter - History response:', historyRes);
      // historyRes is ApiResponse<HistoryItem[]>, so it has { success, message, data: HistoryItem[], meta }
      const historyArray = Array.isArray(historyRes?.data) 
        ? historyRes.data 
        : Array.isArray(historyRes) 
          ? historyRes 
          : [];
      setRecentHistory(historyArray);
      console.log('ActionCenter - Recent history:', historyArray.length);
    } catch (error: any) {
      console.error('Failed to fetch history:', error);
      console.error('Error details:', error?.response?.data || error?.message);
      setRecentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

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
    fetchHistory();
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
          // Date input gives YYYY-MM-DD, convert to ISO8601
          const dateObj = new Date(dueDate + 'T00:00:00');
          if (!isNaN(dateObj.getTime())) {
            finalDueDate = dateObj.toISOString();
          } else {
            // Fallback: use as-is if it's already in ISO format
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
                <Button variant="outline" onClick={() => { fetchData(); fetchHistory(); }} disabled={loading || historyLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading || historyLoading ? 'animate-spin' : ''}`} />
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

            {/* Recent History Card */}
            {recentHistory.length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    Recent Actions
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin/history')}>
                    View All
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recentHistory.map((item) => (
                    <div key={`${item.type}-${item.id}`} className="p-3 rounded-lg bg-gray-50 hover:bg-indigo-50 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.action} • {new Date(item.actionAt).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">{item.action}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

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

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedType === 'grievance' ? 'Grievance Details' :
                 selectedType === 'train' ? 'Train Request Details' : 'Tour Program Details'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedItem && (
              <div className="space-y-4">
                {selectedType === 'grievance' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Petitioner Name</p>
                        <p className="font-medium">{selectedItem.petitionerName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mobile</p>
                        <p className="font-medium">{selectedItem.mobileNumber}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Type</p>
                        <p className="font-medium">{selectedItem.grievanceType}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Constituency</p>
                        <p className="font-medium">{selectedItem.constituency}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Action Required</p>
                        <p className="font-medium">{selectedItem.actionRequired}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Referenced By</p>
                        <p className="font-medium">{selectedItem.referencedBy || 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="p-3 bg-gray-50 rounded-lg mt-1">{selectedItem.description}</p>
                    </div>
                  </>
                )}
                
                {selectedType === 'train' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Passenger Name</p>
                        <p className="font-medium">{selectedItem.passengerName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">PNR Number</p>
                        <p className="font-medium">{selectedItem.pnrNumber}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Train</p>
                        <p className="font-medium">{selectedItem.trainName} ({selectedItem.trainNumber})</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Class</p>
                        <p className="font-medium">{selectedItem.journeyClass}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Journey Date</p>
                        <p className="font-medium">{formatDate(selectedItem.dateOfJourney)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Route</p>
                        <p className="font-medium">{selectedItem.fromStation} → {selectedItem.toStation}</p>
                      </div>
                    </div>
                  </>
                )}
                
                {selectedType === 'tour' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Event Name</p>
                        <p className="font-medium">{selectedItem.eventName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Organizer</p>
                        <p className="font-medium">{selectedItem.organizer}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Date & Time</p>
                        <p className="font-medium">{formatDate(selectedItem.dateTime)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Venue</p>
                        <p className="font-medium">{selectedItem.venue}</p>
                      </div>
                    </div>
                    {selectedItem.description && (
                      <div>
                        <p className="text-sm text-muted-foreground">Description</p>
                        <p className="p-3 bg-gray-50 rounded-lg mt-1">{selectedItem.description}</p>
                      </div>
                    )}
                  </>
                )}
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    setDetailsOpen(false);
                    handleOpenAssign(selectedItem, selectedType);
                  }}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign to Staff
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign Task Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={(open) => {
          setAssignDialogOpen(open);
          if (!open) {
            // Reset form when dialog closes
            resetAssignForm();
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Assign Task to Staff</DialogTitle>
              <DialogDescription>
                Create a task and assign it to a staff member
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
                  rows={3}
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
