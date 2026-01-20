import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trainRequestApi } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function TrainEQCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pnrLoading, setPnrLoading] = useState(false);

  const [formData, setFormData] = useState({
    passengerName: "",
    pnrNumber: "",
    trainName: "",
    trainNumber: "",
    journeyClass: "",
    dateOfJourney: "",
    fromStation: "",
    toStation: "",
    route: "",
    referencedBy: "",
    attachSignature: false,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  // Map API class names to select values
  const mapClassToSelectValue = (apiClass: string): string => {
    console.log('Mapping class:', apiClass);
    if (!apiClass || apiClass === 'N/A') return '';
    
    // Direct match first (case insensitive)
    const upperClass = apiClass.toUpperCase().trim();
    if (['1A', '2A', '3A', 'SL', 'CC', 'EC'].includes(upperClass)) {
      console.log('Direct match:', upperClass);
      return upperClass;
    }
    
    // Pattern matching for descriptive names
    const classLower = apiClass.toLowerCase();
    if (classLower.includes('1a') || classLower.includes('first ac') || classLower.includes('1 ac') || classLower.includes('ac first')) return '1A';
    if (classLower.includes('2a') || classLower.includes('2 tier') || classLower.includes('ac 2') || classLower.includes('second ac') || classLower.includes('ac second')) return '2A';
    if (classLower.includes('3a') || classLower.includes('3 tier') || classLower.includes('ac 3') || classLower.includes('third ac') || classLower.includes('ac third')) return '3A';
    if (classLower.includes('sl') || classLower.includes('sleeper')) return 'SL';
    if (classLower.includes('cc') || classLower.includes('chair car') || classLower.includes('chair')) return 'CC';
    if (classLower.includes('ec') || classLower.includes('executive')) return 'EC';
    
    console.log('No match found for class:', apiClass);
    return ''; // Return empty if no match (let user select manually)
  };

  // Parse date from various formats
  const parseDate = (dateStr: string): string => {
    if (!dateStr || dateStr === 'N/A') return '';
    try {
      // Try to parse the date
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
      }
      // Try DD-MM-YYYY format
      const parts = dateStr.split(/[-\/]/);
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    } catch (e) {
      console.error('Date parse error:', e);
    }
    return '';
  };

  const checkPNR = async () => {
    if (!/^\d{10}$/.test(formData.pnrNumber)) {
      setError("Please enter a valid 10-digit PNR number");
      return;
    }

    setPnrLoading(true);
    setError(null);
    try {
      const pnrData = await trainRequestApi.checkPNR(formData.pnrNumber);
      console.log('=== PNR Response Debug ===');
      console.log('Full Response:', pnrData);
      console.log('Class from API:', pnrData.class);
      console.log('Date from API:', pnrData.dateOfJourney);
      
      const mappedClass = mapClassToSelectValue(pnrData.class);
      const parsedDate = parseDate(pnrData.dateOfJourney);
      
      console.log('Mapped Class:', mappedClass);
      console.log('Parsed Date:', parsedDate);
      console.log('=========================');
      
      setFormData((prev) => {
        const newData = {
          ...prev,
          trainName: pnrData.trainName && pnrData.trainName !== 'N/A' ? pnrData.trainName : prev.trainName,
          trainNumber: pnrData.trainNumber && pnrData.trainNumber !== 'N/A' ? pnrData.trainNumber : prev.trainNumber,
          fromStation: pnrData.from && pnrData.from !== 'N/A' ? pnrData.from : prev.fromStation,
          toStation: pnrData.to && pnrData.to !== 'N/A' ? pnrData.to : prev.toStation,
          journeyClass: mappedClass || prev.journeyClass,
          dateOfJourney: parsedDate || prev.dateOfJourney,
        };
        console.log('New Form Data:', newData);
        return newData;
      });

      // Show info if using mock data
      if (pnrData.isMock) {
        setError("Using mock data - API key not configured");
      }
    } catch (err: any) {
      console.error('PNR fetch error:', err);
      setError("Could not fetch PNR details. Please enter manually.");
    } finally {
      setPnrLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validation
    if (!formData.passengerName.trim()) {
      setError("Passenger name is required");
      setLoading(false);
      return;
    }
    if (!formData.pnrNumber.trim()) {
      setError("PNR number is required");
      setLoading(false);
      return;
    }
    if (!formData.journeyClass) {
      setError("Please select a class");
      setLoading(false);
      return;
    }
    if (!formData.dateOfJourney) {
      setError("Date of journey is required");
      setLoading(false);
      return;
    }
    if (!formData.fromStation.trim() || !formData.toStation.trim()) {
      setError("From and To stations are required");
      setLoading(false);
      return;
    }

    try {
      await trainRequestApi.create({
        passengerName: formData.passengerName,
        pnrNumber: formData.pnrNumber,
        trainName: formData.trainName || undefined,
        trainNumber: formData.trainNumber || undefined,
        journeyClass: formData.journeyClass,
        dateOfJourney: formData.dateOfJourney,
        fromStation: formData.fromStation,
        toStation: formData.toStation,
        route: formData.route || `${formData.fromStation} to ${formData.toStation}`,
        referencedBy: formData.referencedBy || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/staff/home");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to create train request");
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
                Train Emergency (EQ) Entry
              </h1>
              <p className="text-sm text-muted-foreground">
                Generate Railway Emergency Quota letter instantly
              </p>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                ✅ Train EQ request created successfully! Redirecting...
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
                  <CardTitle className="text-lg">Passenger & Journey Details</CardTitle>
                </CardHeader>

                <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                  {/* LEFT COLUMN — FORM */}
                  <div className="xl:col-span-2 space-y-8">

                    {/* Passenger Information */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Passenger Information
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Passenger Name <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="Enter passenger full name" 
                            value={formData.passengerName}
                            onChange={(e) => handleChange("passengerName", e.target.value)}
                          />
                        </div>

                        <div>
                          <Label>
                            PNR Number <span className="text-red-500">*</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input 
                              placeholder="10-digit PNR" 
                              value={formData.pnrNumber}
                              onChange={(e) => handleChange("pnrNumber", e.target.value)}
                              maxLength={10}
                            />
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={checkPNR}
                              disabled={pnrLoading}
                            >
                              {pnrLoading ? "..." : "Fetch"}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Click Fetch to auto-fill train details
                          </p>
                        </div>
                      </div>
                    </section>

                    {/* Reference */}
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <Label>Referenced By</Label>
                        <Input 
                          placeholder="Eg: MP Recommendation / Emergency Call"
                          value={formData.referencedBy}
                          onChange={(e) => handleChange("referencedBy", e.target.value)}
                        />
                      </div>
                    </section>

                    {/* Train Details */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Train Details
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Train Number</Label>
                          <Input
                            placeholder="e.g., 12301"
                            value={formData.trainNumber}
                            onChange={(e) => handleChange("trainNumber", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Train Name</Label>
                          <Input
                            placeholder="e.g., Rajdhani Express"
                            value={formData.trainName}
                            onChange={(e) => handleChange("trainName", e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Date of Journey <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            type="date" 
                            value={formData.dateOfJourney}
                            onChange={(e) => handleChange("dateOfJourney", e.target.value)}
                          />
                        </div>

                        <div>
                          <Label>
                            Class <span className="text-red-500">*</span>
                          </Label>
                          <Select 
                            value={formData.journeyClass} 
                            onValueChange={(v) => handleChange("journeyClass", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1A">1A - First AC</SelectItem>
                              <SelectItem value="2A">2A - Second AC</SelectItem>
                              <SelectItem value="3A">3A - Third AC</SelectItem>
                              <SelectItem value="SL">SL - Sleeper</SelectItem>
                              <SelectItem value="CC">CC - Chair Car</SelectItem>
                              <SelectItem value="EC">EC - Executive Chair</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            From Station <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="e.g., New Delhi (NDLS)" 
                            value={formData.fromStation}
                            onChange={(e) => handleChange("fromStation", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>
                            To Station <span className="text-red-500">*</span>
                          </Label>
                          <Input 
                            placeholder="e.g., Mumbai (BCT)" 
                            value={formData.toStation}
                            onChange={(e) => handleChange("toStation", e.target.value)}
                          />
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* RIGHT COLUMN — ACTIONS */}
                  <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Letter Options
                      </h3>

                      <div className="flex items-start gap-3">
                        <Checkbox 
                          id="digital-sign" 
                          checked={formData.attachSignature}
                          onCheckedChange={(checked) => handleChange("attachSignature", checked as boolean)}
                        />
                        <div className="text-sm">
                          <Label htmlFor="digital-sign">
                            Attach Digital Signature
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Appends Minister's stored digital signature to the PDF
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="text-xs text-muted-foreground">
                      Fields marked with <span className="text-red-500">*</span> are mandatory.
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
                        {loading ? "Submitting..." : "Generate EQ Letter"}
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
