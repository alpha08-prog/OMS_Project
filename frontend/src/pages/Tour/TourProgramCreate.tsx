import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileDown, Info } from "lucide-react";
import { tourProgramApi } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function TourProgramCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    eventName: "",
    organizer: "",
    dateTime: "",  // Changed from eventDate to match backend
    venue: "",
    description: "",
    referencedBy: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validation
    if (!formData.eventName.trim()) {
      setError("Event name is required");
      setLoading(false);
      return;
    }
    if (!formData.organizer.trim()) {
      setError("Organizer is required");
      setLoading(false);
      return;
    }
    if (!formData.dateTime) {
      setError("Date & time is required");
      setLoading(false);
      return;
    }
    if (!formData.venue.trim()) {
      setError("Venue is required");
      setLoading(false);
      return;
    }

    try {
      // Staff submits - decision will default to PENDING
      // Admin will later approve/reject
      await tourProgramApi.create({
        eventName: formData.eventName,
        organizer: formData.organizer,
        dateTime: new Date(formData.dateTime).toISOString(),
        venue: formData.venue,
        description: formData.description || undefined,
        referencedBy: formData.referencedBy || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/staff/home");
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tour program");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Page Header */}
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Invitation & Tour Program
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage the Minister's schedule and invitations
              </p>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                ✅ Tour program saved successfully! Redirecting...
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            {/* Main Card */}
            <form onSubmit={handleSubmit}>
              <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
                <CardHeader>
                  <CardTitle className="text-lg">Event Details</CardTitle>
                </CardHeader>

                <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                  {/* LEFT COLUMN — FORM */}
                  <div className="xl:col-span-2 space-y-8">

                    {/* Event Information */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Event Information
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Event Name <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="Enter event name" 
                            value={formData.eventName}
                            onChange={(e) => handleChange("eventName", e.target.value)}
                          />
                        </div>

                        <div>
                          <Label>
                            Organizer <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="Enter organizer name" 
                            value={formData.organizer}
                            onChange={(e) => handleChange("organizer", e.target.value)}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Reference */}
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <Label>Referenced By</Label>
                        <Input 
                          placeholder="Eg: School Principal, NGO Head"
                          value={formData.referencedBy}
                          onChange={(e) => handleChange("referencedBy", e.target.value)}
                        />
                      </div>
                    </section>

                    {/* Schedule */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Schedule
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Date & Time <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            type="datetime-local" 
                            value={formData.dateTime}
                            onChange={(e) => handleChange("dateTime", e.target.value)}
                          />
                        </div>

                        <div>
                          <Label>
                            Venue <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="Venue or Google Maps link" 
                            value={formData.venue}
                            onChange={(e) => handleChange("venue", e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Description</Label>
                        <Textarea
                          placeholder="Additional details about the event"
                          className="min-h-[100px]"
                          value={formData.description}
                          onChange={(e) => handleChange("description", e.target.value)}
                        />
                      </div>
                    </section>

                    {/* Info about workflow */}
                    <section className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium">Submission Note</p>
                          <p className="mt-1">
                            Your invitation will be submitted for review. An Admin will review and 
                            decide whether to <strong>Accept</strong> (add to tour program) or 
                            <strong> Regret</strong> (send regret letter).
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* RIGHT COLUMN — ACTIONS */}
                  <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Actions
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Fields marked with <span className="text-red-500">*</span> are mandatory.
                      </p>
                    </section>

                    {/* Action Buttons */}
                    <div className="border-t pt-4 space-y-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full flex items-center gap-2"
                      >
                        <FileDown className="h-4 w-4" />
                        Export Tour Program PDF
                      </Button>

                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full"
                        onClick={() => navigate(-1)}
                      >
                        Cancel
                      </Button>

                      <Button 
                        type="submit"
                        className="w-full bg-amber-500 text-black hover:bg-amber-600"
                        disabled={loading}
                      >
                        {loading ? "Saving..." : "Save Tour Program"}
                      </Button>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
