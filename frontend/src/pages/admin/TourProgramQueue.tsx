import { useEffect, useState } from "react";
import { Calendar, CheckCircle, XCircle, RefreshCw, MapPin, User, Clock, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { tourProgramApi, type TourProgram } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function TourProgramQueue() {
  const [programs, setPrograms] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<TourProgram | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const fetchPrograms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tourProgramApi.getPending();
      setPrograms(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tour programs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleDecision = async (id: string, decision: 'ACCEPTED' | 'REGRET') => {
    setActionLoading(id);
    try {
      await tourProgramApi.updateDecision(id, decision, decisionNote);
      // Remove from list after decision
      setPrograms((prev) => prev.filter((p) => p.id !== id));
      setDetailsOpen(false);
      setDecisionNote("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = (program: TourProgram) => {
    setSelectedProgram(program);
    setDecisionNote("");
    setDetailsOpen(true);
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString('en-IN', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
    };
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Tour Program Queue
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and decide on submitted invitations
              </p>
            </div>
            <Button variant="outline" onClick={fetchPrograms} disabled={loading}>
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
              <CardTitle>Pending Invitations ({programs.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading invitations...</p>
              ) : programs.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending invitations!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All tour program invitations have been reviewed.
                  </p>
                </div>
              ) : (
                programs.map((p) => {
                  const { date, time } = formatDateTime(p.eventDate || p.dateTime);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-4 rounded-xl border bg-white hover:bg-indigo-50/30 transition"
                    >
                      <div className="flex gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          <Calendar className="h-5 w-5 text-indigo-700" />
                        </div>

                        <div className="space-y-1">
                          <p className="font-medium text-indigo-900">
                            {p.eventName}
                            <Badge className="ml-2 bg-amber-100 text-amber-800" variant="outline">
                              Pending
                            </Badge>
                          </p>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              {p.organizer}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {date} at {time}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {p.venue}
                            </span>
                          </div>
                          {p.referencedBy && (
                            <p className="text-xs text-muted-foreground">
                              Referenced by: {p.referencedBy}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Submitted by: {p.createdBy?.name || 'Unknown'} • {new Date(p.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleViewDetails(p)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button 
                          size="sm" 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleDecision(p.id, 'ACCEPTED')}
                          disabled={actionLoading === p.id}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {actionLoading === p.id ? "..." : "Accept"}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDecision(p.id, 'REGRET')}
                          disabled={actionLoading === p.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Regret
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

        </div>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Invitation Details
              </DialogTitle>
              <DialogDescription>
                Review the invitation and make a decision
              </DialogDescription>
            </DialogHeader>
            
            {selectedProgram && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Event Name</p>
                    <p className="font-medium">{selectedProgram.eventName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer</p>
                    <p className="font-medium">{selectedProgram.organizer}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">
                      {formatDateTime(selectedProgram.eventDate || selectedProgram.dateTime).date} at {formatDateTime(selectedProgram.eventDate || selectedProgram.dateTime).time}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Venue</p>
                    <p className="font-medium">{selectedProgram.venue}</p>
                  </div>
                  {selectedProgram.referencedBy && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedProgram.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                {selectedProgram.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedProgram.description}</p>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="decisionNote">Decision Note (Optional)</Label>
                  <Textarea
                    id="decisionNote"
                    placeholder="Add a note for this decision..."
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => handleDecision(selectedProgram.id, 'REGRET')}
                    disabled={actionLoading === selectedProgram.id}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Regret (Send Letter)
                  </Button>
                  <Button 
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleDecision(selectedProgram.id, 'ACCEPTED')}
                    disabled={actionLoading === selectedProgram.id}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Accept (Add to Tour)
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
