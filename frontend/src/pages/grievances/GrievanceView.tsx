import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, RefreshCw, Eye, Download, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { grievanceApi, pdfApi, type Grievance, type GrievanceStatus } from "@/lib/api";
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

export default function GrievanceView() {
  const [searchParams] = useSearchParams();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  
  // Filters (search from URL for header search)
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") ?? "");

  const fetchGrievances = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await grievanceApi.getAll({ limit: '200' });
      // Handle response structure
      let grievancesArray: Grievance[] = [];
      if (res) {
        if (Array.isArray(res)) {
          grievancesArray = res;
        } else if (res.data && Array.isArray(res.data)) {
          grievancesArray = res.data;
        }
      }
      setGrievances(grievancesArray);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load grievances";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrievances();
  }, []);

  const handleViewDetails = (grievance: Grievance) => {
    setSelectedGrievance(grievance);
    setDetailsOpen(true);
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      await pdfApi.downloadPDF(`/pdf/grievance/${id}`, `Grievance_Letter_${id}.pdf`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download PDF";
      setError(errorMessage);
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: GrievanceStatus, isVerified: boolean) => {
    if (status === 'REJECTED') {
      return <Badge variant="destructive">Rejected</Badge>;
    }
    if (status === 'RESOLVED') {
      return <Badge className="bg-green-100 text-green-800">Resolved</Badge>;
    }
    if (isVerified) {
      return <Badge className="bg-blue-100 text-blue-800">Verified</Badge>;
    }
    if (status === 'IN_PROGRESS') {
      return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  const getStatusIcon = (status: GrievanceStatus, isVerified: boolean) => {
    if (status === 'REJECTED') return <XCircle className="h-4 w-4 text-red-600" />;
    if (status === 'RESOLVED') return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (isVerified) return <CheckCircle className="h-4 w-4 text-blue-600" />;
    if (status === 'IN_PROGRESS') return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <Clock className="h-4 w-4 text-gray-600" />;
  };

  // Filter and search grievances
  const filteredGrievances = grievances.filter(g => {
    if (filterStatus !== "all") {
      if (filterStatus === "verified" && !g.isVerified) return false;
      if (filterStatus === "pending" && g.isVerified) return false;
      if (filterStatus !== "verified" && filterStatus !== "pending" && g.status !== filterStatus) return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        g.petitionerName.toLowerCase().includes(query) ||
        g.mobileNumber.includes(query) ||
        g.constituency.toLowerCase().includes(query) ||
        g.grievanceType.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Stats
  const totalCount = grievances.length;
  const verifiedCount = grievances.filter(g => g.isVerified).length;
  const pendingCount = grievances.filter(g => !g.isVerified && g.status === 'OPEN').length;
  const resolvedCount = grievances.filter(g => g.status === 'RESOLVED').length;

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
                  View Grievances
                </h1>
                <p className="text-sm text-muted-foreground">
                  View and track all submitted grievances
                </p>
              </div>
              <Button variant="outline" onClick={fetchGrievances} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="rounded-xl bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-indigo-900">{totalCount}</p>
                  <p className="text-sm text-indigo-700">Total</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-amber-50 border-amber-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-amber-900">{pendingCount}</p>
                  <p className="text-sm text-amber-700">Pending</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-blue-50 border-blue-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-blue-900">{verifiedCount}</p>
                  <p className="text-sm text-blue-700">Verified</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl bg-green-50 border-green-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-900">{resolvedCount}</p>
                  <p className="text-sm text-green-700">Resolved</p>
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
                <Input
                  placeholder="Search by name, phone, constituency..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                {(filterStatus !== "all" || searchQuery) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => { setFilterStatus("all"); setSearchQuery(""); }}
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Grievances List */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Grievances ({filteredGrievances.length})</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading grievances...</p>
                ) : filteredGrievances.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No grievances found</p>
                  </div>
                ) : (
                  filteredGrievances.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-4 rounded-xl border bg-white hover:shadow-md transition"
                    >
                      <div className="flex gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          {getStatusIcon(g.status, g.isVerified)}
                        </div>

                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <span>{g.petitionerName}</span>
                            {getStatusBadge(g.status, g.isVerified)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {g.grievanceType} • {g.constituency} • {formatCurrency(g.monetaryValue)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            📞 {g.mobileNumber} • Created: {formatDate(g.createdAt)}
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
                        {g.isVerified && (
                          <Button 
                            size="sm" 
                            className="bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => handleDownloadPDF(g.id)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

          </div>
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
                Full details of the submitted grievance
              </DialogDescription>
            </DialogHeader>
            
            {selectedGrievance && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedGrievance.status, selectedGrievance.isVerified)}
                  {selectedGrievance.isVerified && (
                    <span className="text-sm text-green-600">✓ Verified by {selectedGrievance.verifiedBy?.name || 'Admin'}</span>
                  )}
                </div>

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
                    <p className="text-sm text-muted-foreground">Created At</p>
                    <p className="font-medium">{formatDate(selectedGrievance.createdAt)}</p>
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
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                  {selectedGrievance.isVerified && (
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => handleDownloadPDF(selectedGrievance.id)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download PDF
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
