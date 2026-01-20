import { useEffect, useState } from "react";
import { FileText, CheckCircle, XCircle, Download, RefreshCw, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { grievanceApi, pdfApi, type Grievance } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function GrievanceVerification() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);

  const fetchGrievances = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await grievanceApi.getAll({ status: 'OPEN' });
      // Filter to show only unverified grievances
      setGrievances(res.data.filter((g: Grievance) => !g.isVerified));
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

  const handleVerify = async (id: string) => {
    setActionLoading(id);
    try {
      await grievanceApi.verify(id);
      // Remove from list after verification
      setGrievances((prev) => prev.filter((g) => g.id !== id));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to verify grievance";
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await grievanceApi.updateStatus(id, 'REJECTED');
      // Remove from list after rejection
      setGrievances((prev) => prev.filter((g) => g.id !== id));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reject grievance";
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      await pdfApi.downloadPDF(`/pdf/grievance/${id}`, `Grievance_Letter_${id}.pdf`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download PDF";
      setError(errorMessage);
    }
  };

  const handleViewDetails = (grievance: Grievance) => {
    setSelectedGrievance(grievance);
    setDetailsOpen(true);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Verify Grievances
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and approve submitted grievances
              </p>
            </div>
            <Button variant="outline" onClick={fetchGrievances} disabled={loading}>
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
              <CardTitle>Pending Verification Queue ({grievances.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading grievances...</p>
              ) : grievances.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">All grievances have been verified!</p>
                </div>
              ) : (
                grievances.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-4 rounded-xl border bg-white"
                  >
                    <div className="flex gap-4">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <FileText className="h-5 w-5 text-indigo-700" />
                      </div>

                      <div>
                        <p className="font-medium">
                          {g.petitionerName}
                          <Badge className="ml-2" variant="outline">
                            {g.status}
                          </Badge>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {g.grievanceType} • {g.constituency} • {formatCurrency(g.monetaryValue)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          📞 {g.mobileNumber} • Created by: {g.createdBy?.name || 'Unknown'}
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
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleVerify(g.id)}
                        disabled={actionLoading === g.id}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {actionLoading === g.id ? "..." : "Verify"}
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => handleDownloadPDF(g.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleReject(g.id)}
                        disabled={actionLoading === g.id}
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

        {/* Grievance Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Grievance Details
              </DialogTitle>
              <DialogDescription>
                Review full grievance information before taking action
              </DialogDescription>
            </DialogHeader>
            
            {selectedGrievance && (
              <div className="space-y-4">
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
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline">{selectedGrievance.status}</Badge>
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
                  <Button 
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      handleVerify(selectedGrievance.id);
                      setDetailsOpen(false);
                    }}
                    disabled={actionLoading === selectedGrievance.id}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Verify & Generate Letter
                  </Button>
                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => handleDownloadPDF(selectedGrievance.id)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download PDF
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
