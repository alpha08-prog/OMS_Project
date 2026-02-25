import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Users, 
  RefreshCw, 
  Filter,
  Eye,
  Trash2,
  Phone,
  Calendar,
  Briefcase,
  Clock,
  Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { visitorApi, type Visitor } from "@/lib/api";
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

export default function VisitorView() {
  const [searchParams] = useSearchParams();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [filterDesignation, setFilterDesignation] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") ?? "");
  const [dateFilter, setDateFilter] = useState<string>("");

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (searchQuery) {
        params.search = searchQuery;
      }
      if (dateFilter) {
        params.startDate = dateFilter;
        params.endDate = dateFilter;
      }
      const res = await visitorApi.getAll(params);
      let filteredData = res.data;
      
      // Client-side filter for designation
      if (filterDesignation !== "all") {
        filteredData = filteredData.filter(v => v.designation === filterDesignation);
      }
      
      setVisitors(filteredData);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to load visitors");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, filterDesignation, searchQuery]);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  const handleSearch = () => {
    fetchVisitors();
  };

  const handleViewDetails = (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setDetailsOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this visitor entry?")) return;
    
    try {
      await visitorApi.delete(id);
      setVisitors(prev => prev.filter(v => v.id !== id));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to delete visitor");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDesignationBadge = (designation: string) => {
    const colors: Record<string, string> = {
      'Party Worker': 'bg-orange-100 text-orange-800 border-orange-300',
      'Official': 'bg-blue-100 text-blue-800 border-blue-300',
      'Public': 'bg-green-100 text-green-800 border-green-300',
      'Business': 'bg-purple-100 text-purple-800 border-purple-300',
      'Media': 'bg-pink-100 text-pink-800 border-pink-300',
      'Other': 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return <Badge className={colors[designation] || colors['Other']}>{designation}</Badge>;
  };

  const todaysVisitors = visitors.filter(v => {
    const visitDate = new Date(v.visitDate).toDateString();
    const today = new Date().toDateString();
    return visitDate === today;
  });

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Visitor Log
              </h1>
              <p className="text-sm text-muted-foreground">
                View all visitor entries logged by staff
              </p>
            </div>
            <Button variant="outline" onClick={fetchVisitors} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-xl bg-indigo-50 border-indigo-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-900">{visitors.length}</p>
                  <p className="text-sm text-indigo-700">Total Visitors</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="rounded-xl bg-green-50 border-green-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Calendar className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-900">{todaysVisitors.length}</p>
                  <p className="text-sm text-green-700">Today's Visitors</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="rounded-xl bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Briefcase className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-900">
                    {visitors.filter(v => v.designation === 'Party Worker').length}
                  </p>
                  <p className="text-sm text-amber-700">Party Workers</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Filters */}
          <Card className="rounded-2xl border border-indigo-100">
            <CardContent className="flex flex-wrap items-center gap-4 py-4">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or purpose..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSearch}>Search</Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterDesignation} onValueChange={setFilterDesignation}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Designations</SelectItem>
                    <SelectItem value="Party Worker">Party Worker</SelectItem>
                    <SelectItem value="Official">Official</SelectItem>
                    <SelectItem value="Public">Public</SelectItem>
                    <SelectItem value="Business">Business</SelectItem>
                    <SelectItem value="Media">Media</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-40"
                />
                {dateFilter && (
                  <Button size="sm" variant="ghost" onClick={() => setDateFilter("")}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Visitor List */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Visitor Records ({visitors.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading visitors...</p>
              ) : visitors.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-muted-foreground">No visitor records found</p>
                </div>
              ) : (
                visitors.map((visitor) => (
                  <div
                    key={visitor.id}
                    className="p-4 rounded-xl border bg-white hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-4 flex-1">
                        <div className="p-2 rounded-lg bg-indigo-100">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-indigo-900">{visitor.name}</p>
                            {getDesignationBadge(visitor.designation)}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {visitor.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5" />
                                {visitor.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(visitor.visitDate)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(visitor.createdAt)}
                            </span>
                          </div>
                          
                          <p className="text-sm">
                            <span className="text-muted-foreground">Purpose:</span> {visitor.purpose}
                          </p>
                          
                          {visitor.referencedBy && (
                            <p className="text-xs text-muted-foreground">
                              Referenced by: {visitor.referencedBy}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleViewDetails(visitor)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDelete(visitor.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Visitor Details
              </DialogTitle>
              <DialogDescription>
                Full details of the visitor entry
              </DialogDescription>
            </DialogHeader>
            
            {selectedVisitor && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getDesignationBadge(selectedVisitor.designation)}
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">{selectedVisitor.name}</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedVisitor.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Visit Date</p>
                    <p className="font-medium">{formatDate(selectedVisitor.visitDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Logged By</p>
                    <p className="font-medium">{selectedVisitor.createdBy?.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">
                      {selectedVisitor.dob ? formatDate(selectedVisitor.dob) : 'Not provided'}
                    </p>
                  </div>
                  {selectedVisitor.referencedBy && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedVisitor.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Purpose of Visit</p>
                  <p className="mt-1 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap">
                    {selectedVisitor.purpose}
                  </p>
                </div>
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
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
