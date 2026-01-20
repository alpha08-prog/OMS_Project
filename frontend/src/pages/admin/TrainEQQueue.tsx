import { useEffect, useState } from "react";
import { Train, Printer, CheckCircle, XCircle, RefreshCw, Eye, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { trainRequestApi, pdfApi, type TrainRequest } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function TrainEQQueue() {
  const [requests, setRequests] = useState<TrainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await trainRequestApi.getAll({ status: 'PENDING' });
      setRequests(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load train requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await trainRequestApi.approve(id);
      // Remove from list after approval
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to approve request");
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
    } catch (err: any) {
      setError(err.message || "Failed to reject request");
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
    } catch (err: any) {
      setError(err.message || "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      await pdfApi.downloadPDF(`/pdf/train-eq/${id}`, `TrainEQ_Letter_${id}.pdf`);
    } catch (err: any) {
      setError(err.message || "Failed to download PDF");
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
      </main>
    </div>
  );
}
