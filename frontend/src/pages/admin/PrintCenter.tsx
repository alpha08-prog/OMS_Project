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
  Landmark,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { grievanceApi, trainRequestApi, tourProgramApi, pdfApi, http, type Grievance, type TrainRequest, type TourProgram } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PrintableItem = {
  id: string;
  type: 'grievance' | 'temple' | 'train' | 'tour';
  title: string;
  subtitle: string;
  date: string;
  status: string;
  data: Grievance | TrainRequest | TourProgram;
};

export default function PrintCenter() {
  const [printableItems, setPrintableItems] = useState<PrintableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPrintableItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const items: PrintableItem[] = [];

      // Fetch verified/resolved grievances (ready for printing)
      // Get all grievances and filter for verified ones - increase limit to get all
      const grievanceParams: Record<string, string> = { limit: '50' };
      if (startDate) grievanceParams.startDate = startDate;
      if (endDate) grievanceParams.endDate = endDate;
      const grievanceRes = await grievanceApi.getAll(grievanceParams);
      console.log('PrintCenter - Grievances response:', grievanceRes);
      const grievances = Array.isArray(grievanceRes?.data) ? grievanceRes.data : [];
      grievances.forEach((g: Grievance) => {
        // Temple-visit grievances are a self-service flow — they never go
        // through admin verification, so they're always printable from the
        // moment they're created. Listed as a separate type/chip.
        if (g.grievanceType === 'TEMPLE_VISIT') {
          items.push({
            id: g.id,
            type: 'temple',
            title: `Temple Visit Letter - ${g.petitionerName}`,
            subtitle: `${g.memberCount ?? '?'} member(s) • ${g.constituency}`,
            date: g.resolvedAt || g.createdAt,
            status: g.status === 'RESOLVED' ? 'Resolved' : 'Open',
            data: g,
          });
          return;
        }
        // Other grievances: only listed after admin verification.
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
      const trainParams: Record<string, string> = { status: 'APPROVED' };
      if (startDate) trainParams.startDate = startDate;
      if (endDate) trainParams.endDate = endDate;
      const trainRes = await trainRequestApi.getAll(trainParams);
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

      // Fetch accepted tour programs (tour invitations) — available to
      // staff and admins, matching the staffOnly /pdf/tour-program/:id route.
      const tourParams: Record<string, string> = { decision: 'ACCEPTED', limit: '50' };
      if (startDate) tourParams.startDate = startDate;
      if (endDate) tourParams.endDate = endDate;
      const tourRes = await tourProgramApi.getAll(tourParams);
      console.log('PrintCenter - Tour programs response:', tourRes);
      const tours = Array.isArray(tourRes?.data) ? tourRes.data : [];
      tours.forEach((t: TourProgram) => {
        items.push({
          id: t.id,
          type: 'tour',
          title: `Tour Invitation - ${t.eventName}`,
          subtitle: `${t.organizer} • ${t.venue}`,
          date: t.dateTime || t.createdAt,
          status: 'Accepted',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

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

  const endpointFor = (item: PrintableItem): string | null => {
    if (item.type === 'grievance') return `/pdf/grievance/${item.id}`;
    if (item.type === 'temple') return `/pdf/grievance/${item.id}/temple-visit`;
    if (item.type === 'train') return `/pdf/train-eq/${item.id}`;
    if (item.type === 'tour') return `/pdf/tour-program/${item.id}`;
    return null;
  };

  const filenameFor = (item: PrintableItem): string => {
    if (item.type === 'grievance') return `Grievance_Letter_${item.id}.pdf`;
    if (item.type === 'temple') return `TempleVisit_Letter_${item.id}.pdf`;
    if (item.type === 'train') return `TrainEQ_Letter_${item.id}.pdf`;
    return `Tour_Invitation_${item.id}.pdf`;
  };

  const handleDownloadPDF = async (item: PrintableItem) => {
    try {
      console.log('Downloading PDF for item:', item);
      const endpoint = endpointFor(item);
      if (!endpoint) return;
      await pdfApi.downloadPDF(endpoint, filenameFor(item));
      // Temple-visit download flips the grievance to RESOLVED on the server.
      // Refresh so the row's status badge updates without a manual refresh.
      if (item.type === 'temple') {
        await fetchPrintableItems();
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
      } else if (item.type === 'temple') {
        html = await pdfApi.previewTempleVisit(item.id);
      } else if (item.type === 'tour') {
        html = await pdfApi.previewTourProgram(item.id);
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
      const endpoint = endpointFor(item);
      if (!endpoint) return;

      const res = await http.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      // Printing a temple-visit letter resolves the grievance server-side;
      // refresh so the list reflects the new status.
      if (item.type === 'temple') {
        await fetchPrintableItems();
      }
    } catch (error: unknown) {
      console.error('Failed to print:', error);
      const e = error as Record<string, unknown> | null;
      const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ? e.message : 'Unknown error';
      alert(`Failed to open PDF for printing: ${msg}`);
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'train':
        return <Train className="h-5 w-5 text-indigo-700" />;
      case 'tour':
        return <Calendar className="h-5 w-5 text-indigo-700" />;
      case 'temple':
        return <Landmark className="h-5 w-5 text-orange-700" />;
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
      case 'temple':
        return 'bg-orange-100 text-orange-800';
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
              <CardContent className="px-5 py-5 space-y-4">
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <Button
                    variant={filter === "all" ? "default" : "outline"}
                    onClick={() => setFilter("all")}
                    className="h-10 w-full justify-center"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    All ({printableItems.length})
                  </Button>
                  <Button
                    variant={filter === "grievance" ? "default" : "outline"}
                    onClick={() => setFilter("grievance")}
                    className="h-10 w-full justify-center"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Grievance Letters ({printableItems.filter(i => i.type === 'grievance').length})
                  </Button>
                  <Button
                    variant={filter === "temple" ? "default" : "outline"}
                    onClick={() => setFilter("temple")}
                    className="h-10 w-full justify-center"
                  >
                    <Landmark className="h-4 w-4 mr-2" />
                    Temple Visit ({printableItems.filter(i => i.type === 'temple').length})
                  </Button>
                  <Button
                    variant={filter === "train" ? "default" : "outline"}
                    onClick={() => setFilter("train")}
                    className="h-10 w-full justify-center"
                  >
                    <Train className="h-4 w-4 mr-2" />
                    Train EQ ({printableItems.filter(i => i.type === 'train').length})
                  </Button>
                  <Button
                    variant={filter === "tour" ? "default" : "outline"}
                    onClick={() => setFilter("tour")}
                    className="h-10 w-full justify-center"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Tour Invitation ({printableItems.filter(i => i.type === 'tour').length})
                  </Button>
                </div>
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
                      Verified grievances, temple-visit letters, approved train EQ requests, and accepted tour invitations will appear here.
                    </p>
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 hover:bg-indigo-50/40 transition relative z-10"
                    >
                      {/* Left */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          {getItemIcon(item.type)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-indigo-900 break-words">
                            {item.title}
                          </p>
                          <p className="text-sm text-muted-foreground break-words">
                            {item.subtitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(item.date)}
                          </p>
                        </div>
                      </div>

                      {/* Right */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0 relative z-20">
                        <Badge className={getItemBadgeColor(item.type)}>
                          {item.type === 'grievance'
                            ? 'Grievance'
                            : item.type === 'temple'
                            ? 'Temple Visit'
                            : item.type === 'train'
                            ? 'Train EQ'
                            : 'Tour Invitation'}
                        </Badge>

                        {(item.type === 'train' || item.type === 'grievance' || item.type === 'temple' || item.type === 'tour') && (
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
