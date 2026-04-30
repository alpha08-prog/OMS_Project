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
import { Upload } from "lucide-react";
import { grievanceApi, type GrievanceType, type ActionRequired } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useFormDraft } from "@/hooks/useFormDraft";

export default function OfficeGrievanceCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // File-upload UI is gated as "Coming soon" — see Supporting Documents
  // section. Restore [file, setFile] tuple here to re-enable.

  // Form state
  const [formData, setFormData, clearFormDraft] = useFormDraft("office-grievance:create", {
    petitionerName: "",
    mobileNumber: "",
    constituency: "",
    grievanceType: "" as GrievanceType | "",
    description: "",
    monetaryValue: "",
    actionRequired: "" as ActionRequired | "",
    letterTemplate: "",
    referencedBy: "",
    priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
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
    if (!formData.petitionerName.trim()) {
      setError("Petitioner name is required");
      setLoading(false);
      return;
    }
    if (!/^\d{10}$/.test(formData.mobileNumber)) {
      setError("Please enter a valid 10-digit mobile number");
      setLoading(false);
      return;
    }
    if (!formData.constituency) {
      setError("Please select a constituency");
      setLoading(false);
      return;
    }
    if (!formData.grievanceType) {
      setError("Please select a grievance type");
      setLoading(false);
      return;
    }
    if (!formData.description.trim()) {
      setError("Description is required");
      setLoading(false);
      return;
    }
    if (!formData.referencedBy.trim()) {
      setError("Referenced By field is mandatory");
      setLoading(false);
      return;
    }

    try {
      const created = await grievanceApi.create({
        petitionerName: formData.petitionerName,
        mobileNumber: formData.mobileNumber,
        constituency: formData.constituency,
        grievanceType: formData.grievanceType as GrievanceType,
        description: formData.description,
        monetaryValue: formData.monetaryValue ? parseFloat(formData.monetaryValue) : undefined,
        actionRequired: formData.actionRequired as ActionRequired || undefined,
        letterTemplate: formData.letterTemplate || undefined,
        referencedBy: formData.referencedBy || undefined,
        priority: formData.priority,
        // Marks this entry as filed by an office staffer rather than a public
        // walk-in. Admin views show a separate badge + can filter on it.
        source: 'OFFICE',
      });

      // File upload is gated behind a "Coming soon" placeholder until
      // Stratus is restored. Created without an attachment.
      void created;

      // Drop the draft from sessionStorage so the next visit starts fresh.
      clearFormDraft();
      setSuccess(true);
      setTimeout(() => {
        navigate("/staff/home");
      }, 2000);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Failed to create grievance");
      setError(error.message || "Failed to create grievance");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen bg-background relative">
      <DashboardSidebar />
      
      <main className="flex-1 overflow-auto relative z-0">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Page Header */}
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Register Office Grievance
              </h1>
              <p className="text-sm text-muted-foreground">
                Public Grievance & Letter Tracking (Office)
              </p>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                ✅ Office Grievance created successfully! Redirecting...
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
                  <CardTitle className="text-lg">Office Grievance Details</CardTitle>
                </CardHeader>

                <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                  {/* LEFT COLUMN */}
                  <div className="xl:col-span-2 space-y-8">

                    {/* Petitioner Info */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Petitioner Information
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Petitioner Name <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="Enter full name" 
                            value={formData.petitionerName}
                            onChange={(e) => handleChange("petitionerName", e.target.value)}
                          />
                        </div>

                        <div>
                          <Label>
                            Mobile Number <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            placeholder="10-digit mobile number"
                            inputMode="numeric"
                            value={formData.mobileNumber}
                            onChange={(e) =>
                              handleChange(
                                "mobileNumber",
                                // Strip every non-digit as the user types and
                                // hard-cap at 10 digits, so pasting "+91 98765..."
                                // or accidentally typing a letter is silently
                                // sanitised instead of rejected at submit.
                                e.target.value.replace(/\D/g, "").slice(0, 10)
                              )
                            }
                            maxLength={10}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Grievance Info */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Grievance Information
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Constituency / Ward <span className="text-red-500">*</span></Label>
                          <Select 
                            value={formData.constituency} 
                            onValueChange={(v) => handleChange("constituency", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select constituency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Central">Central</SelectItem>
                              <SelectItem value="West Zone">West Zone</SelectItem>
                              <SelectItem value="East Division">East Division</SelectItem>
                              <SelectItem value="Ward 5">Ward 5</SelectItem>
                              <SelectItem value="Ward 12">Ward 12</SelectItem>
                              <SelectItem value="Ward 15">Ward 15</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Grievance Type <span className="text-red-500">*</span></Label>
                          <Select
                            value={formData.grievanceType}
                            onValueChange={(v) => handleChange("grievanceType", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select grievance type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WATER">Water</SelectItem>
                              <SelectItem value="ROAD">Road</SelectItem>
                              <SelectItem value="POLICE">Police</SelectItem>
                              <SelectItem value="HEALTH">Health</SelectItem>
                              <SelectItem value="TRANSFER">Transfer</SelectItem>
                              <SelectItem value="FINANCIAL_AID">Financial Aid</SelectItem>
                              <SelectItem value="ELECTRICITY">Electricity</SelectItem>
                              <SelectItem value="EDUCATION">Education</SelectItem>
                              <SelectItem value="HOUSING">Housing</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Priority <span className="text-red-500">*</span></Label>
                          <Select
                            value={formData.priority}
                            onValueChange={(v) => handleChange("priority", v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LOW">Low</SelectItem>
                              <SelectItem value="MEDIUM">Medium</SelectItem>
                              <SelectItem value="HIGH">High</SelectItem>
                              <SelectItem value="CRITICAL">🚨 Critical</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Sets how urgently this office grievance is shown to the admin.
                          </p>
                        </div>
                      </div>

                      <div>
                        <Label>Description <span className="text-red-500">*</span></Label>
                        <Textarea
                          placeholder="Enter detailed description of the grievance"
                          className="min-h-[140px]"
                          value={formData.description}
                          onChange={(e) => handleChange("description", e.target.value)}
                        />
                      </div>

                      <div>
                        <Label>Monetary Value (₹)</Label>
                        <Input 
                          placeholder="Estimated cost / aid amount" 
                          type="number"
                          value={formData.monetaryValue}
                          onChange={(e) => handleChange("monetaryValue", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Monetised value of work or aid requested
                        </p>
                      </div>
                    </section>

                    {/* File Upload */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Supporting Documents
                      </h3>
                      <div
                        className="border border-dashed border-slate-300 bg-slate-50/70 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-not-allowed select-none"
                        aria-disabled="true"
                      >
                        <Upload className="h-6 w-6 text-slate-400" />
                        <p className="text-sm font-medium text-slate-600">
                          File uploads — Coming soon
                        </p>
                        <p className="text-xs text-muted-foreground">
                          You can submit without an attachment for now.
                        </p>
                      </div>
                    </section>

                    {/* Action & Letter */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Action & Letter Processing
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Action Required</Label>
                          <Select 
                            value={formData.actionRequired} 
                            onValueChange={(v) => handleChange("actionRequired", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select action" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GENERATE_LETTER">Generate Letter</SelectItem>
                              <SelectItem value="CALL_OFFICIAL">Call Official</SelectItem>
                              <SelectItem value="FORWARD_TO_DEPT">Forward to Department</SelectItem>
                              <SelectItem value="SCHEDULE_MEETING">Schedule Meeting</SelectItem>
                              <SelectItem value="NO_ACTION">No Action</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Letter Template</Label>
                          <Select 
                            value={formData.letterTemplate} 
                            onValueChange={(v) => handleChange("letterTemplate", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="To DC">To DC</SelectItem>
                              <SelectItem value="To Police Commissioner">To Police Commissioner</SelectItem>
                              <SelectItem value="To PWD">To PWD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="space-y-6">

                    {/* Reference */}
                    <section className="space-y-4">
                      <h3 className="font-medium text-indigo-800">
                        Reference Information
                      </h3>
                      <div className="space-y-1">
                        <Label>
                          Referenced By <span className="text-red-500">*</span>
                        </Label>
                        <Input 
                          placeholder="Eg: Hon. MLA, Party President, DC Office"
                          value={formData.referencedBy}
                          onChange={(e) => handleChange("referencedBy", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Name of person or office that recommended this entry
                        </p>
                      </div>
                    </section>

                    {/* Status + Actions */}
                    <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

                      {/* Ticket Status (READ ONLY) */}
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                          Ticket Status
                        </h3>

                        <div className="inline-flex items-center px-4 py-2 rounded-lg bg-green-100 text-green-800 text-sm font-semibold border border-green-200">
                          OPEN
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Status is automatically set and managed by Admin
                        </p>
                      </section>

                      {/* Actions */}
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
                          {loading ? "Submitting..." : "Register Office Grievance"}
                        </Button>
                      </div>

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
