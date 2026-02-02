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
import { visitorApi } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function VisitorCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    designation: "",
    phone: "",
    dob: "",
    purpose: "",
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
    if (!formData.name.trim()) {
      setError("Visitor name is required");
      setLoading(false);
      return;
    }
    if (!formData.designation) {
      setError("Please select a designation");
      setLoading(false);
      return;
    }
    if (!formData.purpose.trim()) {
      setError("Purpose of visit is required");
      setLoading(false);
      return;
    }
    if (!formData.referencedBy.trim()) {
      setError("Referenced By field is mandatory");
      setLoading(false);
      return;
    }

    try {
      await visitorApi.create({
        name: formData.name,
        designation: formData.designation,
        phone: formData.phone || undefined,
        dob: formData.dob || undefined,
        purpose: formData.purpose,
        referencedBy: formData.referencedBy || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/staff/home");
      }, 2000);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : "Failed to log visitor";
      setError(error);
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
                Office Attendees & Birthday Tracker
              </h1>
              <p className="text-sm text-muted-foreground">
                Log visitors and auto-flag birthdays
              </p>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                ✅ Visitor logged successfully! Redirecting...
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
                  <CardTitle className="text-lg">Visitor Details</CardTitle>
                </CardHeader>

                <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                  {/* LEFT COLUMN — FORM */}
                  <div className="xl:col-span-2 space-y-8">

                    {/* Visitor Information */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Visitor Information
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Visitor Name <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="Enter visitor full name" 
                            value={formData.name}
                            onChange={(e) => handleChange("name", e.target.value)}
                          />
                        </div>

                        <div>
                          <Label>
                            Designation <span className="text-red-500">*</span>
                          </Label>
                          <Select 
                            value={formData.designation} 
                            onValueChange={(v) => handleChange("designation", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select designation" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Party Worker">Party Worker</SelectItem>
                              <SelectItem value="Official">Official</SelectItem>
                              <SelectItem value="Public">Public</SelectItem>
                              <SelectItem value="Business">Business</SelectItem>
                              <SelectItem value="Media">Media</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label>Phone Number</Label>
                        <Input 
                          placeholder="10-digit mobile number" 
                          value={formData.phone}
                          onChange={(e) => handleChange("phone", e.target.value)}
                          maxLength={10}
                        />
                      </div>
                    </section>

                    {/* Reference */}
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <Label>
                          Referenced By <span className="text-red-500">*</span>
                        </Label>
                        <Input 
                          placeholder="Eg: Local Leader, Office Staff"
                          value={formData.referencedBy}
                          onChange={(e) => handleChange("referencedBy", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Name of person who recommended this visitor
                        </p>
                      </div>
                    </section>

                    {/* Date of Birth */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Date of Birth
                      </h3>

                      <div className="max-w-xs">
                        <Label>Date of Birth</Label>
                        <Input 
                          type="date" 
                          value={formData.dob}
                          onChange={(e) => handleChange("dob", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Used for birthday alerts on Admin Dashboard
                        </p>
                      </div>
                    </section>

                    {/* Visit Purpose */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Visit Purpose
                      </h3>

                      <div>
                        <Label>
                          Purpose <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          placeholder="Enter purpose of visit"
                          className="min-h-[120px]"
                          value={formData.purpose}
                          onChange={(e) => handleChange("purpose", e.target.value)}
                        />
                      </div>
                    </section>
                  </div>

                  {/* RIGHT COLUMN — ACTIONS */}
                  <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Submission
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        All fields marked with <span className="text-red-500">*</span> are mandatory.
                      </p>
                    </section>

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
                        {loading ? "Submitting..." : "Log Visitor"}
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
