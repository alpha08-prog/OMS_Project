import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ClipboardList, 
  Users,
  CheckCircle2,
  Clock,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Filter,
  ArrowLeft,
  ArrowRight,
  Eye,
  Trash2,
  TrendingUp,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { taskApi, type TaskAssignment, type TaskStatus, type TaskTrackingData } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminTaskTracker() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<TaskTrackingData | null>(null);
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskAssignment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tracking, tasksRes] = await Promise.all([
        taskApi.getTracking(),
        taskApi.getAll({ limit: '1000', page: '1' }), // Get all tasks, not just first 10
      ]);
      
      console.log('TaskTracker - Tracking data:', tracking);
      console.log('TaskTracker - Tracking data type:', typeof tracking);
      console.log('TaskTracker - Tracking data keys:', tracking ? Object.keys(tracking) : 'null');
      console.log('TaskTracker - Tasks response:', tasksRes);
      console.log('TaskTracker - Tasks response type:', typeof tasksRes);
      console.log('TaskTracker - Tasks response keys:', tasksRes ? Object.keys(tasksRes) : 'null');
      
      // getTracking() returns res.data.data, so tracking is already TaskTrackingData
      // But let's handle both cases just in case
      let trackingDataValue: TaskTrackingData | null = null;
      if (tracking) {
        if ('summary' in tracking) {
          trackingDataValue = tracking as TaskTrackingData;
        } else if (tracking.data && typeof tracking.data === 'object' && 'summary' in tracking.data) {
          trackingDataValue = tracking.data as TaskTrackingData;
        }
      }
      setTrackingData(trackingDataValue);
      
      // getAll() returns res.data which is ApiResponse<TaskAssignment[]>
      // So it has { success, message, data: TaskAssignment[], meta }
      let tasksArray: TaskAssignment[] = [];
      if (tasksRes) {
        if (Array.isArray(tasksRes)) {
          tasksArray = tasksRes;
        } else if (tasksRes.data && Array.isArray(tasksRes.data)) {
          tasksArray = tasksRes.data;
        } else if (typeof tasksRes === 'object' && 'data' in tasksRes) {
          const nestedData = (tasksRes as any).data;
          if (Array.isArray(nestedData)) {
            tasksArray = nestedData;
          }
        }
      }
      setTasks(tasksArray);
      console.log('TaskTracker - Tasks array length:', tasksArray.length);
      console.log('TaskTracker - Tasks array:', tasksArray);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      console.error('Error details:', error?.response?.data || error?.message);
      // Set empty arrays on error to prevent undefined errors
      setTrackingData(null);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredTasks = tasks.filter(task => {
    if (filterStatus !== "all" && task.status !== filterStatus) return false;
    if (filterStaff !== "all" && task.assignedTo.id !== filterStaff) return false;
    return true;
  });

  const handleViewDetails = (task: TaskAssignment) => {
    setSelectedTask(task);
    setDetailsOpen(true);
  };

  const handleMarkResolved = async (task: TaskAssignment) => {
    if (!confirm('Mark this task as completed/resolved?')) return;
    
    try {
      await taskApi.updateStatus(task.id, 'COMPLETED');
      fetchData();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await taskApi.delete(id);
      fetchData();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'ASSIGNED':
        return <Badge className="bg-blue-100 text-blue-800">Assigned</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'ON_HOLD':
        return <Badge className="bg-gray-100 text-gray-800">On Hold</Badge>;
    }
  };

  // Status icon helper - currently used inline
  const _getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'ASSIGNED':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'IN_PROGRESS':
        return <PlayCircle className="h-4 w-4 text-amber-600" />;
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'ON_HOLD':
        return <PauseCircle className="h-4 w-4 text-gray-600" />;
    }
  };
  void _getStatusIcon; // Suppress unused warning

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get unique staff members from tasks
  const uniqueStaff = Array.from(
    new Map(tasks.map(t => [t.assignedTo.id, t.assignedTo])).values()
  );

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/admin/action-center')}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-indigo-900">
                    Task Tracker
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Monitor task progress across all staff members
                  </p>
                </div>
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
              </div>
            </div>

            {/* Summary Stats */}
            {trackingData && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="rounded-xl bg-indigo-50 border-indigo-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-indigo-900">{trackingData.summary.total}</p>
                    <p className="text-sm text-indigo-700">Total Tasks</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-blue-50 border-blue-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-blue-900">{trackingData.summary.assigned}</p>
                    <p className="text-sm text-blue-700">Assigned</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-amber-50 border-amber-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-amber-900">{trackingData.summary.inProgress}</p>
                    <p className="text-sm text-amber-700">In Progress</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-green-900">{trackingData.summary.completed}</p>
                    <p className="text-sm text-green-700">Completed</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-gray-50 border-gray-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-gray-900">{trackingData.summary.onHold}</p>
                    <p className="text-sm text-gray-700">On Hold</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Staff Workload */}
            {trackingData && trackingData.staffTaskCounts.length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-600" />
                    Staff Workload
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {trackingData.staffTaskCounts.map((item) => (
                      <div 
                        key={item.staff?.id} 
                        className="p-4 rounded-xl bg-gray-50 hover:bg-indigo-50 cursor-pointer transition"
                        onClick={() => setFilterStaff(item.staff?.id || 'all')}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 rounded-full">
                            <User className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-medium">{item.staff?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.pendingTasks} pending tasks
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Filter:</span>
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ASSIGNED">Assigned</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={filterStaff} onValueChange={setFilterStaff}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Staff Member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {uniqueStaff.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {(filterStatus !== "all" || filterStaff !== "all") && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => { setFilterStatus("all"); setFilterStaff("all"); }}
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Tasks List - Tracker View */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Task Progress Tracker ({filteredTasks.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading tasks...</p>
                ) : filteredTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No tasks found</p>
                  </div>
                ) : (
                  filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-4 rounded-xl border bg-white hover:shadow-md transition"
                    >
                      {/* Task Header */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-semibold text-indigo-900">{task.title}</p>
                            {getStatusBadge(task.status)}
                            <Badge variant="outline">{task.taskType}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Assigned to: <span className="font-medium">{task.assignedTo.name}</span>
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(task)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {task.status !== 'COMPLETED' && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-600"
                              onClick={() => handleMarkResolved(task)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Resolve
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Recent Activity Timeline */}
                          <div className="mt-4 pt-3 border-t">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                              <Clock className="h-3 w-3" />
                              Recent Activity
                            </p>
                            
                            {task.progressHistory && task.progressHistory.length > 0 ? (
                              <div className="space-y-3 pl-1">
                                {task.progressHistory.map((history) => (
                                  <div key={history.id} className="relative pl-4 border-l border-indigo-100">
                                    <div className="absolute -left-[2.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-sm text-gray-700">{history.note}</span>
                                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <span>{formatDateTime(history.createdAt)}</span>
                                        <span>•</span>
                                        <span>{history.createdBy.name}</span>
                                        {history.status && (
                                          <>
                                            <span>•</span>
                                            <span className="font-medium text-indigo-600">
                                              {history.status.replace('_', ' ')}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic pl-1">No activity yet</p>
                            )}
                          </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Task Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Task Details</DialogTitle>
            </DialogHeader>
            
            {selectedTask && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedTask.status)}
                  <Badge variant="outline">{selectedTask.taskType}</Badge>
                  <Badge variant={selectedTask.priority === 'URGENT' ? 'destructive' : 'secondary'}>
                    {selectedTask.priority}
                  </Badge>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
                  {selectedTask.description && (
                    <p className="text-muted-foreground mt-1">{selectedTask.description}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned To</p>
                    <p className="font-medium">{selectedTask.assignedTo.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedTask.assignedTo.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned By</p>
                    <p className="font-medium">{selectedTask.assignedBy.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned At</p>
                    <p className="font-medium">{formatDate(selectedTask.assignedAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{selectedTask.dueDate ? formatDate(selectedTask.dueDate) : 'Not set'}</p>
                  </div>
                  {selectedTask.startedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Started At</p>
                      <p className="font-medium">{formatDate(selectedTask.startedAt)}</p>
                    </div>
                  )}
                  {selectedTask.completedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Completed At</p>
                      <p className="font-medium">{formatDate(selectedTask.completedAt)}</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Progress</p>
                  <Progress value={selectedTask.progressPercent} className="h-3" />
                  <p className="text-sm font-medium mt-1">{selectedTask.progressPercent}% complete</p>
                </div>
                
                {selectedTask.progressNotes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Progress Notes</p>
                    <p className="p-3 bg-gray-50 rounded-lg mt-1">{selectedTask.progressNotes}</p>
                  </div>
                )}
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                  {selectedTask.status !== 'COMPLETED' && (
                    <Button 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        handleMarkResolved(selectedTask);
                        setDetailsOpen(false);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Resolved
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
