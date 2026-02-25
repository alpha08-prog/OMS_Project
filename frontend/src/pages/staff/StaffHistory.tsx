import { useCallback, useEffect, useState } from "react";
import {
  grievanceApi,
  trainRequestApi,
  tourProgramApi,
  type Grievance,
  type TrainRequest,
  type TourProgram,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  History,
  FileCheck,
  Train,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  Eye,
} from "lucide-react";

type SubmissionItem = {
  id: string;
  type: 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM';
  title: string;
  description: string;
  status: string;
  createdAt: string;
  details: Grievance | TrainRequest | TourProgram;
};

export default function StaffHistory() {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<SubmissionItem | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const items: SubmissionItem[] = [];

      // Fetch grievances created by current user
      if (typeFilter === "ALL" || typeFilter === "GRIEVANCE") {
        try {
          const grievanceRes = await grievanceApi.getAll({ limit: '100' });
          console.log('StaffHistory - Grievances response:', grievanceRes);
          const grievances = Array.isArray(grievanceRes?.data) ? grievanceRes.data : [];
          
          // Get current user ID from localStorage
          const userStr = localStorage.getItem('user');
          let currentUserId: string | null = null;
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              currentUserId = user.id;
            } catch {
              // ignore
            }
          }

          grievances.forEach((g: Grievance) => {
            // Filter by current user if we have user ID, otherwise show all (API should filter)
            if (!currentUserId || g.createdBy?.id === currentUserId || g.createdById === currentUserId) {
              items.push({
                id: g.id,
                type: 'GRIEVANCE',
                title: `Grievance - ${g.grievanceType.replace(/_/g, ' ')}`,
                description: `${g.petitionerName} • ${g.constituency}`,
                status: g.status,
                createdAt: g.createdAt,
                details: g,
              });
            }
          });
        } catch (error: unknown) {
          console.error('Failed to fetch grievances:', error);
        }
      }

      // Fetch train requests created by current user
      if (typeFilter === "ALL" || typeFilter === "TRAIN_REQUEST") {
        try {
          const trainRes = await trainRequestApi.getAll({ limit: '100' });
          console.log('StaffHistory - Train requests response:', trainRes);
          const trainRequests = Array.isArray(trainRes?.data) ? trainRes.data : [];
          
          const userStr = localStorage.getItem('user');
          let currentUserId: string | null = null;
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              currentUserId = user.id;
            } catch {
              // ignore
            }
          }

          trainRequests.forEach((t: TrainRequest) => {
            if (!currentUserId || t.createdBy?.id === currentUserId || t.createdById === currentUserId) {
              items.push({
                id: t.id,
                type: 'TRAIN_REQUEST',
                title: `Train EQ - ${t.trainName || t.trainNumber || 'N/A'}`,
                description: `${t.passengerName} • PNR: ${t.pnrNumber}`,
                status: t.status,
                createdAt: t.createdAt,
                details: t,
              });
            }
          });
        } catch (error: unknown) {
          console.error('Failed to fetch train requests:', error);
        }
      }

      // Fetch tour programs created by current user
      if (typeFilter === "ALL" || typeFilter === "TOUR_PROGRAM") {
        try {
          const tourRes = await tourProgramApi.getAll({ limit: '100' });
          console.log('StaffHistory - Tour programs response:', tourRes);
          const tourPrograms = Array.isArray(tourRes?.data) ? tourRes.data : [];
          
          const userStr = localStorage.getItem('user');
          let currentUserId: string | null = null;
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              currentUserId = user.id;
            } catch {
              // ignore
            }
          }

          tourPrograms.forEach((tp: TourProgram) => {
            if (!currentUserId || tp.createdBy?.id === currentUserId || tp.createdById === currentUserId) {
              items.push({
                id: tp.id,
                type: 'TOUR_PROGRAM',
                title: `Tour - ${tp.eventName}`,
                description: `${tp.organizer} • ${tp.venue}`,
                status: tp.decision || 'PENDING',
                createdAt: tp.createdAt,
                details: tp,
              });
            }
          });
        } catch (error: unknown) {
          console.error('Failed to fetch tour programs:', error);
        }
      }

      // Apply status filter
      let filteredItems = items;
      if (statusFilter !== "ALL") {
        filteredItems = items.filter(item => item.status === statusFilter);
      }

      // Apply date filter
      if (startDate || endDate) {
        filteredItems = filteredItems.filter(item => {
          const itemDate = new Date(item.createdAt);
          if (startDate && itemDate < new Date(startDate)) return false;
          if (endDate && itemDate > new Date(endDate)) return false;
          return true;
        });
      }

      // Sort by date descending
      filteredItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log('StaffHistory - Final submissions:', filteredItems);
      setSubmissions(filteredItems);
    } catch (error: unknown) {
      console.error("Error fetching submissions:", error);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate, statusFilter, typeFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "GRIEVANCE":
        return <FileCheck className="h-4 w-4 text-indigo-600" />;
      case "TRAIN_REQUEST":
        return <Train className="h-4 w-4 text-purple-600" />;
      case "TOUR_PROGRAM":
        return <Calendar className="h-4 w-4 text-amber-600" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      RESOLVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      ACCEPTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      REJECTED: "bg-red-100 text-red-700 border-red-200",
      REGRET: "bg-amber-100 text-amber-700 border-amber-200",
      IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
      PENDING: "bg-gray-100 text-gray-700 border-gray-200",
      OPEN: "bg-yellow-100 text-yellow-700 border-yellow-200",
    };
    return (
      <Badge className={variants[status] || "bg-gray-100 text-gray-700"} variant="outline">
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <History className="h-5 w-5 text-indigo-700" />
                </div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  My Submissions
                </h1>
              </div>
              <p className="text-sm text-muted-foreground ml-12">
                View all your submitted grievances, train requests, and tour programs
              </p>
            </div>
            <Button variant="outline" onClick={fetchSubmissions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-indigo-900 flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Type</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="GRIEVANCE">Grievances</SelectItem>
                      <SelectItem value="TRAIN_REQUEST">Train Requests</SelectItem>
                      <SelectItem value="TOUR_PROGRAM">Tour Programs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">From Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">To Date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submissions Table */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-indigo-900">Submissions ({submissions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No submissions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date/Time</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`} className="hover:bg-indigo-50/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.type)}
                              <span className="text-sm">{item.type.replace(/_/g, " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {item.title}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {item.description}
                          </TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedItem(item)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Dialog */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedItem(null)}>
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedItem.title}</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>×</Button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {getStatusBadge(selectedItem.status)}
                  <span className="text-muted-foreground text-sm">
                    {formatDate(selectedItem.createdAt)}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {Object.entries(selectedItem.details).map(([key, value]) => {
                    if (!value || key === "createdBy" || key === "id" || key === "createdAt" || key === "updatedAt") return null;
                    const label = key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (str) => str.toUpperCase());
                    const isLikelyIsoDateString = (val: unknown): val is string =>
                      typeof val === 'string' && /\d{4}-\d{2}-\d{2}T/.test(val);
                    const displayValue =
                      typeof value === "object"
                        ? JSON.stringify(value)
                        : isLikelyIsoDateString(value)
                        ? formatDate(value)
                        : String(value);
                    return (
                      <div key={key}>
                        <p className="text-muted-foreground text-xs uppercase tracking-wider">
                          {label}
                        </p>
                        <p className="font-medium">{displayValue}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
