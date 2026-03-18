import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Calendar,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { taskApi, type TaskAssignment, type TaskStatus, type TaskProgressHistory } from "@/lib/api";
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

export default function StaffTasks() {
  const _navigate = useNavigate();
  void _navigate; // Available for future navigation needs
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskAssignment | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Update form state
  const [progressNotes, setProgressNotes] = useState("");
  const [taskHistory, setTaskHistory] = useState<TaskProgressHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "all") {
        params.status = filterStatus;
      }
      const res = await taskApi.getMyTasks(params);
      setTasks(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleOpenUpdate = async (task: TaskAssignment) => {
    setSelectedTask(task);
    setProgressNotes("");
    setUpdateDialogOpen(true);
    
    // Fetch progress history
    setHistoryLoading(true);
    try {
      const history = await taskApi.getTaskHistory(task.id);
      setTaskHistory(history);
    } catch (err) {
      console.error("Failed to fetch task history:", err);
      setTaskHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleUpdateProgress = async (newStatus?: TaskStatus) => {
    if (!selectedTask) return;
    
    setUpdating(true);
    try {
      const data: { status?: TaskStatus; progressNotes?: string } = {};
      if (progressNotes.trim()) {
        data.progressNotes = progressNotes;
      }
      if (newStatus) {
        data.status = newStatus;
      }
      
      await taskApi.updateProgress(selectedTask.id, data);
      setUpdateDialogOpen(false);
      setProgressNotes("");
      fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setUpdating(false);
    }
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

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'HIGH':
        return <Badge className="bg-orange-100 text-orange-800">High</Badge>;
      case 'NORMAL':
        return <Badge variant="outline">Normal</Badge>;
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const pendingCount = tasks.filter(t => t.status === 'ASSIGNED').length;
  const inProgressCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;

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
                  My Tasks
                </h1>
                <p className="text-sm text-muted-foreground">
                  View and update your assigned tasks
                </p>
              </div>
              <Button variant="outline" onClick={fetchTasks} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="rounded-xl bg-blue-50 border-blue-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <ClipboardList className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-900">{tasks.length}</p>
                    <p className="text-sm text-blue-700">Total Tasks</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-amber-50 border-amber-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-lg">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-900">{pendingCount}</p>
                    <p className="text-sm text-amber-700">Pending</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-orange-50 border-orange-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <PlayCircle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-900">{inProgressCount}</p>
                    <p className="text-sm text-orange-700">In Progress</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-green-50 border-green-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-900">{completedCount}</p>
                    <p className="text-sm text-green-700">Completed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Filter */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex items-center gap-4 py-4">
                <span className="text-sm text-muted-foreground">Filter by status:</span>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tasks</SelectItem>
                    <SelectItem value="ASSIGNED">Assigned</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Tasks List */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Task List</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading tasks...</p>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-8">
                    <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No tasks assigned to you</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border bg-white hover:shadow-md transition ${
                        task.priority === 'URGENT' ? 'border-l-4 border-l-red-500' :
                        task.priority === 'HIGH' ? 'border-l-4 border-l-orange-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-indigo-900">{task.title}</p>
                            {getStatusBadge(task.status)}
                            {getPriorityBadge(task.priority)}
                            <Badge variant="outline">{task.taskType}</Badge>
                          </div>
                          
                          {task.description && (
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          )}
                          
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Assigned: {formatDate(task.assignedAt)}
                            </span>
                            {task.dueDate && (
                              <span className="flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Due: {formatDate(task.dueDate)}
                              </span>
                            )}
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

                        <div className="flex flex-col gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleOpenUpdate(task)}
                            disabled={task.status === 'COMPLETED'}
                          >
                            Update Progress
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                          {task.status === 'ASSIGNED' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedTask(task);
                                handleUpdateProgress('IN_PROGRESS');
                              }}
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              Start Task
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Update Progress Dialog */}
        <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Update Task Progress</DialogTitle>
              <DialogDescription>
                Update your progress on: {selectedTask?.title}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Progress Timeline */}
              <div>
                <label className="text-sm font-medium flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  Progress Timeline
                </label>
                <div className="max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                  {historyLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading history...</p>
                  ) : taskHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No updates yet. Add your first update below.</p>
                  ) : (
                    <div className="space-y-3">
                      {taskHistory.map((entry) => (
                        <div key={entry.id} className="relative pl-4 pb-3 border-l-2 border-indigo-200 last:border-l-0 last:pb-0">
                          <div className="absolute -left-1.5 top-0 w-3 h-3 bg-indigo-500 rounded-full"></div>
                          <div className="bg-white border rounded-lg p-3 shadow-sm">
                            <p className="text-sm text-gray-800">{entry.note}</p>
                            {entry.status && (
                              <Badge className="mt-2" variant="outline">
                                Status: {entry.status.replace('_', ' ')}
                              </Badge>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <span>{entry.createdBy.name}</span>
                              <span>•</span>
                              <span>{formatDateTime(entry.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Add New Update */}
              <div>
                <label className="text-sm font-medium">Add Progress Update</label>
                <Textarea
                  placeholder="What progress have you made? Any blockers or updates?"
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                  className="mt-2"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setUpdateDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleUpdateProgress('ON_HOLD')}
                  disabled={updating}
                  className="flex-1"
                >
                  <PauseCircle className="h-4 w-4 mr-1" />
                  Put On Hold
                </Button>
                <Button 
                  onClick={() => handleUpdateProgress()}
                  disabled={updating || !progressNotes.trim()}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {updating ? "Saving..." : "Add Update"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
