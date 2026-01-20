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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload } from "lucide-react";
import { newsApi, type NewsPriority } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function NewsIntelligenceCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    headline: "",
    category: "",
    region: "",
    priority: "NORMAL" as NewsPriority,
    mediaSource: "",
    description: "",
    referencedBy: "",
    imageUrl: "",
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
    if (!formData.headline.trim()) {
      setError("Headline is required");
      setLoading(false);
      return;
    }
    if (!formData.category) {
      setError("Please select a category");
      setLoading(false);
      return;
    }
    if (!formData.region) {
      setError("Please select a region");
      setLoading(false);
      return;
    }
    if (!formData.mediaSource.trim()) {
      setError("Media source is required");
      setLoading(false);
      return;
    }

    try {
      await newsApi.create({
        headline: formData.headline,
        category: formData.category,
        region: formData.region,
        priority: formData.priority,
        mediaSource: formData.mediaSource,
        description: formData.description || undefined,
        referencedBy: formData.referencedBy || undefined,
        imageUrl: formData.imageUrl || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/staff/home");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to save intelligence");
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
                Constituency News & Intelligence
              </h1>
              <p className="text-sm text-muted-foreground">
                Log political developments and prioritize critical intelligence
              </p>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                ✅ Intelligence saved successfully! Redirecting...
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
                  <CardTitle className="text-lg">Intelligence Entry</CardTitle>
                </CardHeader>

                <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                  {/* LEFT COLUMN — FORM */}
                  <div className="xl:col-span-2 space-y-8">

                    {/* Headline */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Headline & Classification
                      </h3>

                      <div>
                        <Label>
                          Headline <span className="text-red-500">*</span>
                        </Label>
                        <Input 
                          placeholder="Short summary of the news or intelligence" 
                          value={formData.headline}
                          onChange={(e) => handleChange("headline", e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Category <span className="text-red-500">*</span>
                          </Label>
                          <Select 
                            value={formData.category} 
                            onValueChange={(v) => handleChange("category", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DEVELOPMENT_WORK">
                                Development Work
                              </SelectItem>
                              <SelectItem value="CONSPIRACY_FAKE_NEWS">
                                Conspiracy / Fake News
                              </SelectItem>
                              <SelectItem value="LEADER_ACTIVITY">
                                Leader Activity
                              </SelectItem>
                              <SelectItem value="PARTY_ACTIVITY">
                                Party Activity
                              </SelectItem>
                              <SelectItem value="OPPOSITION">
                                Opposition Activity
                              </SelectItem>
                              <SelectItem value="OTHER">
                                Other
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>
                            Region <span className="text-red-500">*</span>
                          </Label>
                          <Select 
                            value={formData.region} 
                            onValueChange={(v) => handleChange("region", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select affected region" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Central Ward">Central Ward</SelectItem>
                              <SelectItem value="West Ward">West Ward</SelectItem>
                              <SelectItem value="East Ward">East Ward</SelectItem>
                              <SelectItem value="Specific Booth">Specific Booth</SelectItem>
                              <SelectItem value="Village Area">Village Area</SelectItem>
                              <SelectItem value="Constituency Wide">Constituency Wide</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label>Description</Label>
                        <Textarea
                          placeholder="Detailed description of the news/intelligence"
                          className="min-h-[100px]"
                          value={formData.description}
                          onChange={(e) => handleChange("description", e.target.value)}
                        />
                      </div>
                    </section>

                    {/* Priority */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Priority Level
                      </h3>

                      <RadioGroup 
                        value={formData.priority} 
                        onValueChange={(v) => handleChange("priority", v)}
                        className="flex gap-6"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="NORMAL" id="normal" />
                          <Label htmlFor="normal">Normal</Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="HIGH" id="high" />
                          <Label htmlFor="high">High</Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="CRITICAL" id="critical" />
                          <Label htmlFor="critical" className="text-red-600 font-medium">
                            Critical (Push Alert)
                          </Label>
                        </div>
                      </RadioGroup>
                    </section>

                    {/* Source */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Source Information
                      </h3>

                      <div>
                        <Label>
                          Media Source <span className="text-red-500">*</span>
                        </Label>
                        <Input 
                          placeholder="Newspaper / Social Media link / Informant name" 
                          value={formData.mediaSource}
                          onChange={(e) => handleChange("mediaSource", e.target.value)}
                        />
                      </div>
                    </section>

                    {/* Reference */}
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <Label>Referenced By</Label>
                        <Input 
                          placeholder="Eg: Reporter, Informant, Party Worker"
                          value={formData.referencedBy}
                          onChange={(e) => handleChange("referencedBy", e.target.value)}
                        />
                      </div>
                    </section>

                    {/* Upload */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Evidence / Image URL
                      </h3>

                      <div>
                        <Label>Image URL (optional)</Label>
                        <Input 
                          placeholder="https://example.com/screenshot.jpg" 
                          value={formData.imageUrl}
                          onChange={(e) => handleChange("imageUrl", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          URL to screenshot or image evidence
                        </p>
                      </div>

                      <div className="border border-dashed border-indigo-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center opacity-50">
                        <Upload className="h-6 w-6 text-indigo-500" />
                        <p className="text-sm font-medium">
                          File Upload (Coming Soon)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Direct file upload will be available in future updates
                        </p>
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
                        {loading ? "Saving..." : "Save Intelligence"}
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
