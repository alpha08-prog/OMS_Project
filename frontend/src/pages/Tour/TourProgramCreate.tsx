import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Upload, X } from "lucide-react";
import { tourProgramApi, uploadsApi, type EventType } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import FloatingNotice from "@/components/common/FloatingNotice";

// Event categories shown in the "Event Type" dropdown. Values are the
// enum-style strings persisted to Catalyst (column: eventType); labels are
// what staff see.
const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "WEDDING", label: "Wedding" },
  { value: "HOUSE_WARMING", label: "House Warming" },
  { value: "STATE_GOVT_EVENT", label: "State Govt Event" },
  { value: "CENTRAL_GOVT_EVENT", label: "Central Govt Event" },
  { value: "GOVT_MEETING", label: "Govt Meeting" },
  { value: "PARTY_MEETING", label: "Party Meeting" },
  { value: "FAMILY_EVENT", label: "Family Event" },
];

export default function TourProgramCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    eventName: "",
    eventType: "" as EventType | "",
    organizer: "",
    organizerPhone: "",
    organizerEmail: "",
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
    if (!formData.referencedBy.trim()) {
      setError("Referenced By field is mandatory");
      setLoading(false);
      return;
    }
    if (formData.organizerPhone.trim() && !/^\d{10}$/.test(formData.organizerPhone.trim())) {
      setError("Organizer phone must be exactly 10 digits");
      setLoading(false);
      return;
    }

    try {
      // Staff submits - decision will default to PENDING
      // Admin will later approve/reject
      const created = await tourProgramApi.create({
        eventName: formData.eventName,
        eventType: formData.eventType || undefined,
        organizer: formData.organizer,
        organizerPhone: formData.organizerPhone.trim() || undefined,
        organizerEmail: formData.organizerEmail.trim() || undefined,
        dateTime: new Date(formData.dateTime).toISOString(),
        venue: formData.venue,
        description: formData.description || undefined,
        referencedBy: formData.referencedBy || undefined,
      });

      // Upload invitation if the staff selected one. Non-fatal: the tour
      // program row is already saved and queued for admin review, so a
      // failed upload only surfaces a warning instead of rolling back.
      if (file) {
        try {
          await uploadsApi.upload(file, 'TOUR', created.id);
        } catch (uploadErr: unknown) {
          const msg = uploadErr instanceof Error ? uploadErr.message : 'attachment upload failed';
          setError(`Tour program saved, but invitation upload failed: ${msg}`);
        }
      }

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

            <FloatingNotice
              show={success}
              variant="success"
              message="Tour program registered successfully! Redirecting..."
            />

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
                          <Label>Event Type</Label>
                          <Select
                            value={formData.eventType}
                            onValueChange={(v) => handleChange("eventType", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select event type" />
                            </SelectTrigger>
                            <SelectContent>
                              {EVENT_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                        <div>
                          <Label>Organizer phone</Label>
                          <Input
                            type="tel"
                            placeholder="10-digit mobile number"
                            value={formData.organizerPhone}
                            maxLength={10}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                              handleChange("organizerPhone", digits);
                            }}
                          />
                          {formData.organizerPhone.length > 0 && formData.organizerPhone.length < 10 && (
                            <p className="text-xs text-red-500 mt-1">
                              {10 - formData.organizerPhone.length} more digit{10 - formData.organizerPhone.length !== 1 ? "s" : ""} required
                            </p>
                          )}
                        </div>
                        <div>
                          <Label>Organizer email</Label>
                          <Input
                            type="email"
                            placeholder="contact@example.com"
                            value={formData.organizerEmail}
                            onChange={(e) => handleChange("organizerEmail", e.target.value)}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Reference */}
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <Label>
                          Referenced By <span className="text-red-500">*</span>
                        </Label>
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

                    {/* File Upload */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Invitation Document
                      </h3>
                      {file ? (
                        <div className="border border-indigo-200 bg-indigo-50/70 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-indigo-900 truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() => setFile(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/40 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors">
                          <Upload className="h-6 w-6 text-slate-400" />
                          <p className="text-sm font-medium text-slate-700">
                            Click to attach the invitation
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Image or PDF, up to 10 MB. Optional.
                          </p>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              if (f.size > 10 * 1024 * 1024) {
                                setError('File is larger than 10 MB.');
                                return;
                              }
                              setFile(f);
                              setError(null);
                            }}
                          />
                        </label>
                      )}
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
