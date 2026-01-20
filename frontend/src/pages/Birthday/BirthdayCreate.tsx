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
import { birthdayApi } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Cake, ArrowLeft } from "lucide-react";

export default function BirthdayCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    dob: "",
    relation: "",
    notes: "",
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
      setError("Name is required");
      setLoading(false);
      return;
    }
    if (!formData.dob) {
      setError("Date of birth is required");
      setLoading(false);
      return;
    }
    if (!formData.relation) {
      setError("Please select a category/relation");
      setLoading(false);
      return;
    }

    try {
      await birthdayApi.create({
        name: formData.name,
        phone: formData.phone || undefined,
        dob: formData.dob,
        relation: formData.relation,
        notes: formData.notes || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/staff/home");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to save birthday entry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-pink-50/60 to-white px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Page Header */}
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-pink-900 flex items-center gap-2">
                  <Cake className="h-6 w-6" />
                  Birthday Entry
                </h1>
                <p className="text-sm text-muted-foreground">
                  Add important birthdays for reminders to Admin & Super Admin
                </p>
              </div>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                ✅ Birthday entry saved successfully! Redirecting...
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            {/* Main Form */}
            <form onSubmit={handleSubmit}>
              <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-pink-100">
                <CardHeader>
                  <CardTitle className="text-lg text-pink-800">Birthday Details</CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  
                  {/* Person Name */}
                  <div className="space-y-2">
                    <Label>
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      placeholder="Enter person's full name" 
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      className="border-pink-200 focus:border-pink-400"
                    />
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input 
                      placeholder="10-digit mobile number (for SMS wishes)" 
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      maxLength={10}
                      className="border-pink-200 focus:border-pink-400"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used for sending birthday wishes via SMS
                    </p>
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-2">
                    <Label>
                      Date of Birth <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      type="date" 
                      value={formData.dob}
                      onChange={(e) => handleChange("dob", e.target.value)}
                      className="border-pink-200 focus:border-pink-400"
                    />
                    <p className="text-xs text-muted-foreground">
                      Birthday alerts will appear on Admin & Super Admin dashboards
                    </p>
                  </div>

                  {/* Category/Relation */}
                  <div className="space-y-2">
                    <Label>
                      Category/Relation <span className="text-red-500">*</span>
                    </Label>
                    <Select 
                      value={formData.relation} 
                      onValueChange={(v) => handleChange("relation", v)}
                    >
                      <SelectTrigger className="border-pink-200 focus:border-pink-400">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Party Worker">Party Worker</SelectItem>
                        <SelectItem value="VIP">VIP</SelectItem>
                        <SelectItem value="Official">Government Official</SelectItem>
                        <SelectItem value="Family">Family Member</SelectItem>
                        <SelectItem value="Supporter">Supporter</SelectItem>
                        <SelectItem value="Business">Business Contact</SelectItem>
                        <SelectItem value="Media">Media Person</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      placeholder="Any additional notes about this person..."
                      className="min-h-[100px] border-pink-200 focus:border-pink-400"
                      value={formData.notes}
                      onChange={(e) => handleChange("notes", e.target.value)}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => navigate(-1)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="flex-1 bg-pink-500 text-white hover:bg-pink-600"
                      disabled={loading}
                    >
                      {loading ? "Saving..." : "Save Birthday"}
                    </Button>
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
