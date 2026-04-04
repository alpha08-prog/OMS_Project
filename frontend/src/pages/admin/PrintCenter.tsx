import { useEffect, useState } from "react";
import {
  Printer,
  FileText,
  Download,
  Eye,
  Filter,
  Train,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { grievanceApi, trainRequestApi, pdfApi, http, type Grievance, type TrainRequest } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PrintableItem = {
  id: string;
  type: 'grievance' | 'train' | 'tour';
  title: string;
  subtitle: string;
  date: string;
  status: string;
  data: Grievance | TrainRequest;
};

export default function PrintCenter() {
  const [printableItems, setPrintableItems] = useState<PrintableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [tourDateRange, setTourDateRange] = useState({ start: '', end: '' });
  const [tourDialogOpen, setTourDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Determine role for feature gating
  const userRole = (() => {
    const s = sessionStorage.getItem('user_role') || localStorage.getItem('user_role');
    if (s) return s;
    const u = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (u) { try { return JSON.parse(u).role; } catch { /* ignore */ } }
    return null;
  })();
  const isStaff = userRole === 'STAFF';

  const fetchPrintableItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const items: PrintableItem[] = [];

      // Fetch verified/resolved grievances (ready for printing)
      // Get all grievances and filter for verified ones - increase limit to get all
      const grievanceRes = await grievanceApi.getAll({ limit: '1000' });
      console.log('PrintCenter - Grievances response:', grievanceRes);
      const grievances = Array.isArray(grievanceRes?.data) ? grievanceRes.data : [];
      grievances.forEach((g: Grievance) => {
        // Include verified grievances (can be VERIFIED, IN_PROGRESS, or RESOLVED status)
        if (g.isVerified || g.status === 'RESOLVED' || g.status === 'IN_PROGRESS') {
          items.push({
            id: g.id,
            type: 'grievance',
            title: `Grievance Letter - ${g.grievanceType.replace(/_/g, ' ')}`,
            subtitle: `${g.petitionerName} • ${g.constituency}`,
            date: g.verifiedAt || g.createdAt,
            status: g.status === 'RESOLVED' ? 'Resolved' : g.status === 'IN_PROGRESS' ? 'In Progress' : 'Verified',
            data: g,
          });
        }
      });

      // Fetch approved train requests
      const trainRes = await trainRequestApi.getAll({ status: 'APPROVED' });
      console.log('PrintCenter - Train requests response:', trainRes);
      const trainRequests = Array.isArray(trainRes?.data) ? trainRes.data : [];
      trainRequests.forEach((t: TrainRequest) => {
        items.push({
          id: t.id,
          type: 'train',
          title: `Train EQ Letter - ${t.trainName || 'N/A'}`,
          subtitle: `${t.passengerName} • PNR: ${t.pnrNumber}`,
          date: t.approvedAt || t.createdAt,
          status: 'Approved',
          data: t,
        });
      });

      console.log('PrintCenter - Printable items:', items);
      setPrintableItems(items);
    } catch (err: unknown) {
      console.error('Failed to fetch printable items:', err);
      const e = err as Record<string, unknown> | null;
      const msg =
        (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ||
        'Failed to load printable letters. Check your connection and that the server is running.';
      setError(msg);
      setPrintableItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrintableItems();
  }, []);

  const filteredItems = printableItems.filter(item => {
    if (filter === "all") return true;
    return item.type === filter;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return date.toLocaleDateString();
  };

  const handleDownloadPDF = async (item: PrintableItem) => {
    try {
      console.log('Downloading PDF for item:', item);
      if (item.type === 'grievance') {
        await pdfApi.downloadPDF(`/pdf/grievance/${item.id}`, `Grievance_Letter_${item.id}.pdf`);
      } else if (item.type === 'train') {
        await pdfApi.downloadPDF(`/pdf/train-eq/${item.id}`, `TrainEQ_Letter_${item.id}.pdf`);
      }
    } catch (error: unknown) {
      console.error('Failed to download PDF:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      alert(`Failed to download PDF: ${msg}`);
    }
  };

  const handlePreview = async (item: PrintableItem) => {
    setPreviewLoading(true);
    try {
      console.log('Loading preview for item:', item);
      let html: string;
      if (item.type === 'train') {
        html = await pdfApi.previewTrainEQLetter(item.id) as string;
      } else if (item.type === 'grievance') {
        html = await pdfApi.previewGrievanceLetter(item.id) as string;
      } else {
        setPreviewLoading(false);
        return;
      }
      console.log('Preview HTML loaded, length:', html?.length);
      setPreviewContent(html);
      setPreviewOpen(true);
    } catch (error: unknown) {
      console.error('Failed to load preview:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      alert(`Failed to load preview: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePrint = async (item: PrintableItem) => {
    try {
      console.log('Printing item:', item);
      // Fetch PDF and open in new tab for printing
      let endpoint = '';
      if (item.type === 'grievance') {
        endpoint = `/pdf/grievance/${item.id}`;
      } else if (item.type === 'train') {
        endpoint = `/pdf/train-eq/${item.id}`;
      } else {
        return;
      }
      
      const res = await http.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error: unknown) {
      console.error('Failed to print:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      alert(`Failed to open PDF for printing: ${msg}`);
    }
  };

  const handleDownloadTourProgram = () => {
    pdfApi.downloadTourProgram(tourDateRange.start, tourDateRange.end);
    setTourDialogOpen(false);
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'train':
        return <Train className="h-5 w-5 text-indigo-700" />;
      case 'tour':
        return <Calendar className="h-5 w-5 text-indigo-700" />;
      default:
        return <FileText className="h-5 w-5 text-indigo-700" />;
    }
  };

  const getItemBadgeColor = (type: string) => {
    switch (type) {
      case 'train':
        return 'bg-blue-100 text-blue-800';
      case 'tour':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-amber-100 text-amber-800';
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  Print Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Generate, preview, and print official letters
                </p>
              </div>
              <Button variant="outline" onClick={fetchPrintableItems} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap gap-3 py-4">
                <Button 
                  variant={filter === "all" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilter("all")}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  All ({printableItems.length})
                </Button>
                <Button 
                  variant={filter === "grievance" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilter("grievance")}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Grievance Letters ({printableItems.filter(i => i.type === 'grievance').length})
                </Button>
                <Button 
                  variant={filter === "train" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilter("train")}
                >
                  <Train className="h-4 w-4 mr-2" />
                  Train EQ ({printableItems.filter(i => i.type === 'train').length})
                </Button>
                {!isStaff && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTourDialogOpen(true)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Tour Program PDF
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Letters Queue */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Printable Letters ({filteredItems.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading...</p>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-destructive font-medium mb-2">{error}</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      If the database is unreachable, ensure it is running and DATABASE_URL in the backend is correct.
                    </p>
                    <Button variant="outline" onClick={fetchPrintableItems}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Printer className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No letters ready for printing</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isStaff
                        ? 'Your verified grievances and approved train EQ requests will appear here'
                        : 'Verify grievances or approve train requests to generate letters'}
                    </p>
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between rounded-xl border p-4 hover:bg-indigo-50/40 transition relative z-10"
                    >
                      {/* Left */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          {getItemIcon(item.type)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-indigo-900">
                            {item.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {item.subtitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(item.date)}
                          </p>
                        </div>
                      </div>

                      {/* Right */}
                      <div className="flex items-center gap-3 flex-shrink-0 relative z-20">
                        <Badge className={getItemBadgeColor(item.type)}>
                          {item.type === 'grievance' ? 'Grievance' : item.type === 'train' ? 'Train EQ' : 'Tour'}
                        </Badge>

                        {(item.type === 'train' || item.type === 'grievance') && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            title="Preview"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreview(item);
                            }}
                            disabled={previewLoading}
                            className="relative z-20"
                          >
                            <Eye className="h-4 w-4 flex-shrink-0" />
                          </Button>
                        )}

                        <Button 
                          size="icon" 
                          variant="ghost" 
                          title="Download PDF"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadPDF(item);
                          }}
                          className="relative z-20"
                        >
                          <Download className="h-4 w-4 flex-shrink-0" />
                        </Button>

                        <Button
                          size="icon"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white relative z-20"
                          title="Print"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrint(item);
                          }}
                        >
                          <Printer className="h-4 w-4 flex-shrink-0" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tour Program Date Range Dialog */}
        <Dialog open={tourDialogOpen} onOpenChange={setTourDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Generate Tour Program PDF
              </DialogTitle>
              <DialogDescription>
                Select a date range to generate the tour program document
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={tourDateRange.start}
                    onChange={(e) => setTourDateRange(prev => ({ ...prev, start: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={tourDateRange.end}
                    onChange={(e) => setTourDateRange(prev => ({ ...prev, end: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to generate for the next 7 days
              </p>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTourDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={handleDownloadTourProgram}
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Letter Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Letter Preview
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
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
