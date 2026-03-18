import { useCallback, useEffect, useState } from "react";
import {
  historyApi,
  type HistoryItem,
  type HistoryStats,
  type HistoryItemType,
} from "../../lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { DashboardSidebar } from "../../components/layout/DashboardSidebar";
import {
  History,
  FileCheck,
  Train,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
} from "lucide-react";

export default function AdminHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  const isCreatedBy = (value: unknown): value is { name: string; email: string } => {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.name === 'string' && typeof v.email === 'string';
  };

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 15;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (typeFilter !== "ALL") params.type = typeFilter;
      if (actionFilter !== "ALL") params.action = actionFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      console.log('History - Fetching with params:', params);
      const res = await historyApi.getHistory(params);
      console.log('History - Response:', res);
      console.log('History - Response type:', typeof res);
      console.log('History - Response keys:', res ? Object.keys(res) : 'null');
      // res is ApiResponse<HistoryItem[]>, so it has { success, message, data: HistoryItem[], meta }
      const historyArray = Array.isArray(res?.data) 
        ? res.data 
        : Array.isArray(res) 
          ? res 
          : [];
      console.log('History - History array:', historyArray);
      console.log('History - History array length:', historyArray.length);
      setHistory(historyArray);
      if (res?.meta) {
        setTotalPages(res.meta.totalPages);
      }
    } catch (error: unknown) {
      console.error("Error fetching history:", error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, endDate, page, startDate, typeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      console.log('History - Fetching stats');
      const data = await historyApi.getStats();
      console.log('History - Stats response:', data);
      setStats(data);
    } catch (error: unknown) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchStats();
  }, [fetchHistory, fetchStats]);

  // Refetch when filters change
  useEffect(() => {
    if (page === 1) {
      fetchHistory();
    } else {
      setPage(1);
    }
  }, [typeFilter, actionFilter, startDate, endDate, page, fetchHistory]);

  const handleFilter = () => {
    setPage(1);
    fetchHistory();
  };

  const clearFilters = () => {
    setTypeFilter("ALL");
    setActionFilter("ALL");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setTimeout(fetchHistory, 0);
  };

  const getTypeIcon = (type: HistoryItemType) => {
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

  const getActionBadge = (action: string) => {
    const variants: Record<string, string> = {
      "Verified & Resolved": "bg-emerald-100 text-emerald-700 border-emerald-200",
      Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      Accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
      Rejected: "bg-red-100 text-red-700 border-red-200",
      Regret: "bg-amber-100 text-amber-700 border-amber-200",
    };
    return (
      <Badge className={variants[action] || "bg-gray-100 text-gray-700"} variant="outline">
        {action}
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
                  Action History
                </h1>
              </div>
              <p className="text-sm text-muted-foreground ml-12">
                View all administrative actions - approvals, rejections, and verifications
              </p>
            </div>
            <Button variant="outline" onClick={() => { fetchHistory(); fetchStats(); }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="rounded-2xl shadow-sm border-indigo-100">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-indigo-600 text-sm font-medium">Grievances</p>
                      <p className="text-2xl font-bold text-indigo-900">{stats.grievances.total}</p>
                    </div>
                    <div className="flex flex-col items-end text-xs">
                      <span className="text-emerald-600">✓ {stats.grievances.resolved} resolved</span>
                      <span className="text-red-600">✗ {stats.grievances.rejected} rejected</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm border-purple-100">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-600 text-sm font-medium">Train Requests</p>
                      <p className="text-2xl font-bold text-purple-900">{stats.trainRequests.total}</p>
                    </div>
                    <div className="flex flex-col items-end text-xs">
                      <span className="text-emerald-600">✓ {stats.trainRequests.approved} approved</span>
                      <span className="text-red-600">✗ {stats.trainRequests.rejected} rejected</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm border-amber-100">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-amber-600 text-sm font-medium">Tour Programs</p>
                      <p className="text-2xl font-bold text-amber-900">{stats.tourPrograms.total}</p>
                    </div>
                    <div className="flex flex-col items-end text-xs">
                      <span className="text-emerald-600">✓ {stats.tourPrograms.accepted} accepted</span>
                      <span className="text-amber-600">⚠ {stats.tourPrograms.regret} regret</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-indigo-100 text-sm font-medium">Total Actions</p>
                      <p className="text-2xl font-bold">{stats.totalActions}</p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-indigo-900 flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <label className="text-sm text-muted-foreground mb-1 block">Action</label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Actions</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="ACCEPTED">Accepted</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="REGRET">Regret</SelectItem>
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

                <div className="flex items-end gap-2">
                  <Button onClick={handleFilter} className="bg-indigo-600 hover:bg-indigo-700">
                    Apply
                  </Button>
                  <Button variant="outline" onClick={clearFilters}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* History Table */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-indigo-900">Action Log</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No actions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Action By</TableHead>
                        <TableHead>Date/Time</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((item) => (
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
                          <TableCell>{getActionBadge(item.action)}</TableCell>
                          <TableCell>{item.actionBy?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(item.actionAt)}
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedItem && getTypeIcon(selectedItem.type)}
                {selectedItem?.title}
              </DialogTitle>
            </DialogHeader>
            {selectedItem && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {getActionBadge(selectedItem.action)}
                  <span className="text-muted-foreground text-sm">
                    {formatDate(selectedItem.actionAt)}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedItem.details).map(([key, value]) => {
                      if (!value || key === "createdBy") return null;
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

                  {isCreatedBy(selectedItem.details.createdBy) && (
                    <div className="pt-3 border-t">
                      <p className="text-muted-foreground text-xs uppercase tracking-wider">
                        Created By
                      </p>
                      <p className="font-medium">
                        {selectedItem.details.createdBy.name} ({selectedItem.details.createdBy.email})
                      </p>
                    </div>
                  )}

                  {selectedItem.actionBy && (
                    <div className="pt-3 border-t">
                      <p className="text-muted-foreground text-xs uppercase tracking-wider">
                        Action Taken By
                      </p>
                      <p className="font-medium">
                        {selectedItem.actionBy.name} ({selectedItem.actionBy.email})
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedItem(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
