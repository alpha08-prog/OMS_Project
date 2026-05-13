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
import { trainRequestApi, pdfApi } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Plus, X, AlertTriangle, Users, Download, Eye } from "lucide-react";

// Passenger limit constant
const MAX_PASSENGERS_GENERAL = 6;

export default function TrainEQCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Backend auto-approves on create, so we hold the new id and surface the
  // print + preview buttons inline instead of bouncing the user back home.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pnrLoading, setPnrLoading] = useState(false);

  // Per-passenger row capturing the fields the EQ letter needs.
  // Gender/Age populate the Sex/Age column; waitlist populates W/L.
  type PassengerRow = {
    name: string;
    gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
    age: string;
    waitlist: string;
  };
  const emptyPassenger = (): PassengerRow => ({ name: '', gender: '', age: '', waitlist: '' });
  const [passengers, setPassengers] = useState<PassengerRow[]>([emptyPassenger()]);

  const [formData, setFormData] = useState({
    pnrNumber: "",
    ContactNumber: "",
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
  
  // Add new passenger
  const addPassenger = () => {
    if (passengers.length < MAX_PASSENGERS_GENERAL) {
      setPassengers([...passengers, emptyPassenger()]);
      setError(null);
    } else {
      setError(`Maximum ${MAX_PASSENGERS_GENERAL} passengers allowed for General bookings`);
    }
  };

  // Remove passenger
  const removePassenger = (index: number) => {
    if (passengers.length > 1) {
      setPassengers(passengers.filter((_, i) => i !== index));
      setError(null);
    }
  };

  // Update a single field on a passenger row.
  const updatePassengerField = <K extends keyof PassengerRow>(
    index: number,
    field: K,
    value: PassengerRow[K]
  ) => {
    setPassengers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setError(null);
  };
  
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
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    } catch (e) {
      console.error('Date parse error:', e);
    }
    return '';
  };

  type PnrLookupResponse = {
    class?: string;
    dateOfJourney?: string;
    trainName?: string;
    trainNumber?: string;
    from?: string;
    to?: string;
    isMock?: boolean;
  };

  const isPnrLookupResponse = (value: unknown): value is PnrLookupResponse => {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    const hasOptionalString = (k: string) => v[k] === undefined || typeof v[k] === 'string';
    return (
      hasOptionalString('class') &&
      hasOptionalString('dateOfJourney') &&
      hasOptionalString('trainName') &&
      hasOptionalString('trainNumber') &&
      hasOptionalString('from') &&
      hasOptionalString('to') &&
      (v.isMock === undefined || typeof v.isMock === 'boolean')
    );
  };

  const checkPNR = async () => {
    if (!/^\d{10}$/.test(formData.pnrNumber)) {
      setError("Please enter a valid 10-digit PNR number");
      return;
    }

    setPnrLoading(true);
    setError(null);
    try {
      const pnrDataUnknown = await trainRequestApi.checkPNR(formData.pnrNumber);
      if (!isPnrLookupResponse(pnrDataUnknown)) {
        throw new Error('Invalid PNR response');
      }
      const pnrData = pnrDataUnknown;
      console.log('=== PNR Response Debug ===');
      console.log('Full Response:', pnrData);
      console.log('Class from API:', pnrData.class);
      console.log('Date from API:', pnrData.dateOfJourney);
      
      const mappedClass = mapClassToSelectValue(pnrData.class || '');
      const parsedDate = parseDate(pnrData.dateOfJourney || '');
      
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
    } catch (err) {
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

    // Filter out rows where the name is blank — those are unfilled placeholders.
    const validPassengers = passengers.filter((p) => p.name.trim());

    // Validation
    if (validPassengers.length === 0) {
      setError("At least one passenger name is required");
      setLoading(false);
      return;
    }

    // Age sanity check — if provided, must be 0 < age <= 120.
    for (const p of validPassengers) {
      if (p.age.trim()) {
        const n = Number(p.age);
        if (!Number.isFinite(n) || n <= 0 || n > 120) {
          setError(`Invalid age "${p.age}" for ${p.name}. Enter a value between 1 and 120.`);
          setLoading(false);
          return;
        }
      }
    }

    // Check passenger limit
    if (validPassengers.length > MAX_PASSENGERS_GENERAL) {
      setError(`Maximum ${MAX_PASSENGERS_GENERAL} passengers allowed for General bookings`);
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

    if (!formData.referencedBy.trim()) {
      setError("Referenced By field is mandatory");
      setLoading(false);
      return;
    }
    
    // Phone number validation
    if (!formData.ContactNumber.trim()) {
      setError("Phone number is required");
      setLoading(false);
      return;
    }
    if (!/^\d{10}$/.test(formData.ContactNumber)) {
      setError("Please enter a valid 10-digit phone number");
      setLoading(false);
      return;
    }

    try {
      // Join passenger names with comma for backend storage (legacy field).
      // The structured `passengers` array drives the per-row data (Sex/Age/W/L)
      // shown on the EQ letter.
      const passengerNameStr = validPassengers.map((p) => p.name.trim()).join(', ');

      const created = await trainRequestApi.create({
        passengerName: passengerNameStr,
        pnrNumber: formData.pnrNumber,
        contactNumber: formData.ContactNumber,
        trainName: formData.trainName || undefined,
        trainNumber: formData.trainNumber || undefined,
        journeyClass: formData.journeyClass,
        dateOfJourney: formData.dateOfJourney,
        fromStation: formData.fromStation,
        toStation: formData.toStation,
        route: formData.route || `${formData.fromStation} to ${formData.toStation}`,
        referencedBy: formData.referencedBy || undefined,
        passengers: validPassengers.map((p) => ({
          name: p.name.trim(),
          gender: p.gender || undefined,
          age: p.age.trim() ? Number(p.age) : undefined,
          currentStatus: p.waitlist.trim() || undefined,
        })),
      });

      setCreatedId(created?.id ?? null);
      setSuccess(true);
      // No auto-redirect — the staff member needs to print the letter from
      // this same screen now that admin no longer mediates the flow.
    } catch (err: unknown) {
      const e = err as { message?: string; errors?: Array<{ field: string; message: string }> };
      const errorMessage =
        Array.isArray(e?.errors) && e.errors.length > 0
          ? e.errors.map((x) => `${x.field}: ${x.message}`).join('. ')
          : e?.message || "Failed to create train request";
      setError(errorMessage);
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

            {/* Success state — auto-approved, ready to print */}
            {success && createdId && (
              <div className="bg-green-50 border border-green-200 text-green-900 rounded-lg p-4 space-y-3">
                <div className="font-semibold">
                  ✅ Train EQ request created and approved.
                </div>
                <p className="text-sm">
                  Print the letter now or preview it before printing. Admin will see this entry in the read-only list.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={pdfLoading}
                    onClick={async () => {
                      setPdfLoading(true);
                      try {
                        await pdfApi.downloadTrainEQLetter(createdId);
                      } catch (err) {
                        const m = err instanceof Error ? err.message : "Failed to download PDF";
                        setError(m);
                      } finally {
                        setPdfLoading(false);
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {pdfLoading ? "Preparing…" : "Print / Download Letter"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (!createdId) return;
                      try {
                        // Backend's preview route is staffOnly; bare window.open
                        // sends no Authorization header, so we fetch the HTML
                        // via the authed axios client and pop it into a new
                        // tab as a blob.
                        const html = await pdfApi.previewTrainEQ(createdId);
                        const blob = new Blob([html], { type: "text/html" });
                        const url = URL.createObjectURL(blob);
                        const win = window.open(url, "_blank");
                        // Revoke the blob URL once the new tab has had a moment
                        // to load it; otherwise the URL leaks for the session.
                        if (win) {
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        } else {
                          URL.revokeObjectURL(url);
                          alert("Pop-up blocked — allow pop-ups for this site to preview.");
                        }
                      } catch (err) {
                        console.error("Train EQ preview failed:", err);
                        alert(err instanceof Error ? err.message : "Failed to load preview");
                      }
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => navigate("/staff/home")}
                  >
                    Done
                  </Button>
                </div>
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
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Passenger Information ({passengers.length}/{MAX_PASSENGERS_GENERAL})
                        </h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addPassenger}
                          disabled={passengers.length >= MAX_PASSENGERS_GENERAL}
                          className="gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Add Passenger
                        </Button>
                      </div>

                      {/* Passenger limit info */}
                      <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-blue-50 text-blue-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          General bookings (AC/Non-AC) allow maximum {MAX_PASSENGERS_GENERAL} passengers per PNR
                        </span>
                      </div>
                      
                      {/* Passenger List — Name + Gender + Age + W/L per row.
                          Gender, Age, and W/L populate the Sex/Age and W/L columns
                          on the generated EQ letter. */}
                      <div className="space-y-4">
                        {passengers.map((passenger, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-gray-200 bg-white/70 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-indigo-700">
                                Passenger {index + 1} {index === 0 && <span className="text-red-500">*</span>}
                              </span>
                              {passengers.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => removePassenger(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>

                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-12 md:col-span-5">
                                <Label className="text-xs text-muted-foreground">Full Name</Label>
                                <Input
                                  placeholder={`Passenger ${index + 1} full name`}
                                  value={passenger.name}
                                  onChange={(e) => updatePassengerField(index, 'name', e.target.value)}
                                />
                              </div>

                              <div className="col-span-6 md:col-span-3">
                                <Label className="text-xs text-muted-foreground">Gender</Label>
                                <Select
                                  value={passenger.gender}
                                  onValueChange={(v) =>
                                    updatePassengerField(index, 'gender', v as PassengerRow['gender'])
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="MALE">Male</SelectItem>
                                    <SelectItem value="FEMALE">Female</SelectItem>
                                    <SelectItem value="OTHER">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="col-span-3 md:col-span-2">
                                <Label className="text-xs text-muted-foreground">Age</Label>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={120}
                                  placeholder="Age"
                                  value={passenger.age}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                                    updatePassengerField(index, 'age', v);
                                  }}
                                />
                              </div>

                              <div className="col-span-3 md:col-span-2">
                                <Label className="text-xs text-muted-foreground">W/L</Label>
                                <Input
                                  placeholder="e.g. WL/12"
                                  value={passenger.waitlist}
                                  onChange={(e) =>
                                    updatePassengerField(index, 'waitlist', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Phone Number Field */}
                      <div className="pt-2">
                        <Label>
                          Phone Number (Primary Passenger) <span className="text-red-500">*</span>
                        </Label>
                        <Input 
                          placeholder="10-digit mobile number" 
                          value={formData.ContactNumber}
                          onChange={(e) => {
                            // Only allow digits
                            const value = e.target.value.replace(/\D/g, '');
                            if (value.length <= 10) {
                              handleChange("ContactNumber", value);
                            }
                          }}
                          maxLength={10}
                          type="tel"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Contact number for the primary passenger
                        </p>
                      </div>

                      <div className="pt-2">
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
                    </section>

                    {/* Reference */}
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <Label>
                          Referenced By <span className="text-red-500">*</span>
                        </Label>
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
