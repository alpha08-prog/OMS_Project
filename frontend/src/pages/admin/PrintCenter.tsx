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
import { grievanceApi, trainRequestApi, pdfApi, type Grievance, type TrainRequest } from "@/lib/api";
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
  const [filter, setFilter] = useState<string>("all");
  const [tourDateRange, setTourDateRange] = useState({ start: '', end: '' });
  const [tourDialogOpen, setTourDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPrintableItems = async () => {
    setLoading(true);
    try {
      const items: PrintableItem[] = [];

      // Fetch resolved grievances (ready for printing)
      const grievanceRes = await grievanceApi.getAll({ status: 'RESOLVED' });
      grievanceRes.data.forEach((g: Grievance) => {
        items.push({
          id: g.id,
          type: 'grievance',
          title: `Grievance Letter - ${g.grievanceType.replace('_', ' ')}`,
          subtitle: `${g.petitionerName} • ${g.constituency}`,
          date: g.createdAt,
          status: 'Ready',
          data: g,
        });
      });

      // Fetch approved train requests
      const trainRes = await trainRequestApi.getAll({ status: 'APPROVED' });
      trainRes.data.forEach((t: TrainRequest) => {
        items.push({
          id: t.id,
          type: 'train',
          title: `Train EQ Letter - ${t.trainName || 'N/A'}`,
          subtitle: `${t.passengerName} • PNR: ${t.pnrNumber}`,
          date: t.createdAt,
          status: 'Ready',
          data: t,
        });
      });

      setPrintableItems(items);
    } catch (error) {
      console.error('Failed to fetch printable items:', error);
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
      if (item.type === 'grievance') {
        await pdfApi.downloadPDF(`/pdf/grievance/${item.id}`, `Grievance_Letter_${item.id}.pdf`);
      } else if (item.type === 'train') {
        await pdfApi.downloadPDF(`/pdf/train-eq/${item.id}`, `TrainEQ_Letter_${item.id}.pdf`);
      }
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  const handlePreview = async (item: PrintableItem) => {
    setPreviewLoading(true);
    try {
      let html: string;
      if (item.type === 'train') {
        html = await pdfApi.previewTrainEQLetter(item.id) as string;
      } else if (item.type === 'grievance') {
        html = await pdfApi.previewGrievanceLetter(item.id) as string;
      } else {
        return;
      }
      setPreviewContent(html);
      setPreviewOpen(true);
    } catch (error) {
      console.error('Failed to load preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePrint = (item: PrintableItem) => {
    // Open PDF in new tab for printing
    if (item.type === 'grievance') {
      pdfApi.downloadGrievanceLetter(item.id);
    } else if (item.type === 'train') {
      pdfApi.downloadTrainEQLetter(item.id);
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
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setTourDialogOpen(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Tour Program PDF
                </Button>
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
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Printer className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No letters ready for printing</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Verify grievances or approve train requests to generate letters
                    </p>
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between rounded-xl border p-4 hover:bg-indigo-50/40 transition"
                    >
                      {/* Left */}
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          {getItemIcon(item.type)}
                        </div>

                        <div>
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
                      <div className="flex items-center gap-3">
                        <Badge className={getItemBadgeColor(item.type)}>
                          {item.type === 'grievance' ? 'Grievance' : item.type === 'train' ? 'Train EQ' : 'Tour'}
                        </Badge>

                        {(item.type === 'train' || item.type === 'grievance') && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            title="Preview"
                            onClick={() => handlePreview(item)}
                            disabled={previewLoading}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}

                        <Button 
                          size="icon" 
                          variant="ghost" 
                          title="Download PDF"
                          onClick={() => handleDownloadPDF(item)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          title="Print"
                          onClick={() => handlePrint(item)}
                        >
                          <Printer className="h-4 w-4" />
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
