import { useEffect, useRef, useState } from "react";
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
import { Upload, X } from "lucide-react";
import {
  grievanceApi,
  pdfApi,
  uploadsApi,
  type GrievanceType,
  type ActionRequired,
  type TempleRegistryEntry,
  type TempleServiceCode,
} from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useFormDraft } from "@/hooks/useFormDraft";
import FloatingNotice from "@/components/common/FloatingNotice";
import { CONSTITUENCY_OPTIONS } from "@/lib/constituencies";

const INITIAL_OFFICE_GRIEVANCE = {
  petitionerName: "",
  mobileNumber: "",
  constituency: "",
  wardVillage: "",
  grievanceType: "" as GrievanceType | "",
  description: "",
  monetaryValue: "",
  actionRequired: "" as ActionRequired | "",
  letterTemplate: "",
  referencedBy: "",
  priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  // Temple-visit specific — ignored at submit time when grievanceType
  // isn't TEMPLE_VISIT.
  templeKey: "",
  memberCount: "",
  originDistrict: "",
  originState: "",
  visitDateFrom: "",
  visitDateTo: "",
  showMobileOnLetter: false,
};

export default function OfficeGrievanceCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // Which submit button was pressed: true = "Save & add another" (reset + stay).
  const addAnotherRef = useRef(false);

  // Form state
  const [formData, setFormData, clearFormDraft] = useFormDraft(
    "office-grievance:create",
    INITIAL_OFFICE_GRIEVANCE
  );

  // Selected service codes for the temple letter — kept outside useFormDraft
  // because that hook serialises a key→string map. Defaults seed from the
  // temple registry the first time a temple is picked.
  const [servicesRequested, setServicesRequested] = useState<TempleServiceCode[]>([]);

  const [templeRegistry, setTempleRegistry] = useState<TempleRegistryEntry[]>([]);
  const [serviceLabels, setServiceLabels] = useState<Record<TempleServiceCode, string>>(
    {} as Record<TempleServiceCode, string>
  );
  const [registryLoaded, setRegistryLoaded] = useState(false);

  const isTempleVisit = formData.grievanceType === "TEMPLE_VISIT";

  useEffect(() => {
    if (!isTempleVisit || registryLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await pdfApi.getTempleRegistry();
        if (cancelled) return;
        setTempleRegistry(data.temples);
        setServiceLabels(data.services);
      } catch {
        // Non-fatal — dropdown stays empty, staff can retry later.
      } finally {
        if (!cancelled) setRegistryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTempleVisit, registryLoaded]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleTempleChange = (key: string) => {
    setFormData((prev) => ({ ...prev, templeKey: key }));
    const t = templeRegistry.find((x) => x.key === key);
    if (t && servicesRequested.length === 0) {
      setServicesRequested(t.defaultServices);
    }
    setError(null);
  };

  const toggleService = (code: TempleServiceCode) => {
    setServicesRequested((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]
    );
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
    if (!isTempleVisit && !formData.description.trim()) {
      setError("Description is required");
      setLoading(false);
      return;
    }
    if (!formData.referencedBy.trim()) {
      setError("Referenced By field is mandatory");
      setLoading(false);
      return;
    }

    if (isTempleVisit) {
      if (!formData.templeKey) {
        setError("Please select a temple");
        setLoading(false);
        return;
      }
      if (!formData.visitDateFrom) {
        setError("Please select a visit date");
        setLoading(false);
        return;
      }
      const n = Number(formData.memberCount);
      if (!Number.isInteger(n) || n < 1) {
        setError("Number of members must be a positive integer");
        setLoading(false);
        return;
      }
      if (
        formData.visitDateTo &&
        new Date(formData.visitDateTo) < new Date(formData.visitDateFrom)
      ) {
        setError("Visit end date cannot be before the start date");
        setLoading(false);
        return;
      }
    }

    try {
      // Synthesize a description for temple visits — the server requires
      // a non-empty description, and the list/search benefits from one.
      const synthDescription = isTempleVisit
        ? `Temple visit letter for ${formData.petitionerName} and ${formData.memberCount} members to ${
            templeRegistry.find((t) => t.key === formData.templeKey)?.deity || formData.templeKey
          }`
        : formData.description;

      const created = await grievanceApi.create({
        petitionerName: formData.petitionerName,
        mobileNumber: formData.mobileNumber,
        constituency: formData.constituency,
        wardVillage: formData.wardVillage.trim() || undefined,
        grievanceType: formData.grievanceType as GrievanceType,
        description: synthDescription,
        monetaryValue: formData.monetaryValue ? parseFloat(formData.monetaryValue) : undefined,
        // Force GENERATE_LETTER for temple visits — that's the only sensible action.
        actionRequired: (isTempleVisit
          ? "GENERATE_LETTER"
          : (formData.actionRequired as ActionRequired) || undefined) as ActionRequired | undefined,
        letterTemplate: formData.letterTemplate || undefined,
        referencedBy: formData.referencedBy || undefined,
        priority: formData.priority,
        // Marks this entry as filed by an office staffer rather than a public
        // walk-in. Admin views show a separate badge + can filter on it.
        source: 'OFFICE',
        ...(isTempleVisit && {
          templeKey: formData.templeKey,
          memberCount: Number(formData.memberCount),
          originDistrict: formData.originDistrict.trim() || undefined,
          originState: formData.originState.trim() || undefined,
          visitDateFrom: formData.visitDateFrom || undefined,
          visitDateTo: formData.visitDateTo || undefined,
          servicesRequested: servicesRequested.length > 0 ? servicesRequested : undefined,
          showMobileOnLetter: Boolean(formData.showMobileOnLetter),
        }),
      });

      // Upload attachment if the staff selected one. Non-fatal: parent row
      // is already saved, so a failed upload surfaces as a warning rather
      // than a rollback.
      if (file) {
        try {
          await uploadsApi.upload(file, 'GRIEVANCE', created.id);
        } catch (uploadErr: unknown) {
          const msg = uploadErr instanceof Error ? uploadErr.message : 'attachment upload failed';
          setError(`Office grievance saved, but attachment failed: ${msg}`);
        }
      }

      setSuccess(true);
      if (addAnotherRef.current) {
        // Reset the form and stay on the page for rapid repeat entry.
        setFormData(INITIAL_OFFICE_GRIEVANCE);
        setFile(null);
        setTimeout(() => setSuccess(false), 1500);
      } else {
        // Drop the draft from sessionStorage so the next visit starts fresh.
        clearFormDraft();
        setTimeout(() => {
          navigate("/staff/home");
        }, 2000);
      }
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

            <FloatingNotice
              show={success}
              variant="success"
              message="Office Grievance registered successfully!"
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
                            autoFocus
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
                              {CONSTITUENCY_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
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
                              <SelectItem value="MP_LAD">MP LAD</SelectItem>
                              <SelectItem value="TEMPLE_VISIT">Temple Visit (Darshan Letter)</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Ward / Village</Label>
                          <Input
                            placeholder="Enter ward or village"
                            value={formData.wardVillage}
                            onChange={(e) => handleChange("wardVillage", e.target.value)}
                          />
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

                      {/* Description hidden for TEMPLE_VISIT — body is generated
                          from the structured fields below; a description is
                          synthesized at submit time so server validation passes. */}
                      {!isTempleVisit && (
                        <div>
                          <Label>Description <span className="text-red-500">*</span></Label>
                          <Textarea
                            placeholder="Enter detailed description of the grievance"
                            className="min-h-[140px]"
                            value={formData.description}
                            onChange={(e) => handleChange("description", e.target.value)}
                          />
                          {formData.description.length > 0 && (
                            <p className="mt-1 text-right text-xs text-muted-foreground">{formData.description.length} characters</p>
                          )}
                        </div>
                      )}

                      <div>
                        <Label>Monetary Value (₹)</Label>
                        <Input
                          placeholder="Estimated cost / aid amount"
                          type="number"
                          min="0"
                          value={formData.monetaryValue}
                          onChange={(e) => handleChange("monetaryValue", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Monetised value of work or aid requested
                        </p>
                      </div>
                    </section>

                    {/* Temple Visit (only when grievanceType === TEMPLE_VISIT). */}
                    {isTempleVisit && (
                      <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                        <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wide">
                          Temple Visit Details
                        </h3>
                        <p className="text-xs text-muted-foreground -mt-2">
                          These fields populate the darshan / accommodation letter sent to the temple.
                          The grievance will be auto-resolved once the PDF is downloaded.
                          Type the full name (with honorific, e.g. "Sri. Amit Solanki") into
                          the Petitioner Name field above — it prints verbatim on the letter.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <Label>
                              Temple <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={formData.templeKey}
                              onValueChange={handleTempleChange}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select temple / accommodation office" />
                              </SelectTrigger>
                              <SelectContent>
                                {templeRegistry.map((t) => (
                                  <SelectItem key={t.key} value={t.key}>
                                    {t.deity}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>
                              Total Members <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              placeholder="e.g. 4"
                              value={formData.memberCount}
                              onChange={(e) => handleChange("memberCount", e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Total people including the petitioner. Letter prints "{"<name>"} and N members".
                            </p>
                          </div>

                          <div>
                            <Label>Origin District</Label>
                            <Input
                              placeholder="e.g. Dharwad"
                              value={formData.originDistrict}
                              onChange={(e) => handleChange("originDistrict", e.target.value)}
                            />
                          </div>

                          <div>
                            <Label>Origin State</Label>
                            <Input
                              placeholder="e.g. Karnataka"
                              value={formData.originState}
                              onChange={(e) => handleChange("originState", e.target.value)}
                            />
                          </div>

                          <div>
                            <Label>
                              Visit From <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="date"
                              value={formData.visitDateFrom}
                              onChange={(e) => handleChange("visitDateFrom", e.target.value)}
                            />
                          </div>

                          <div>
                            <Label>Visit To (optional)</Label>
                            <Input
                              type="date"
                              value={formData.visitDateTo}
                              onChange={(e) => handleChange("visitDateTo", e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Leave empty for a single-day visit.
                            </p>
                          </div>
                        </div>

                        <div>
                          <Label>Services Requested</Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(Object.keys(serviceLabels) as TempleServiceCode[]).map((code) => {
                              const active = servicesRequested.includes(code);
                              return (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => toggleService(code)}
                                  className={`px-3 py-1 rounded-full text-xs border transition ${
                                    active
                                      ? "bg-amber-500 text-black border-amber-500"
                                      : "bg-white text-slate-600 border-slate-300 hover:border-amber-400"
                                  }`}
                                >
                                  {serviceLabels[code]}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Defaults are auto-selected based on the temple. Click to toggle.
                          </p>
                        </div>

                        <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.showMobileOnLetter)}
                            onChange={(e) =>
                              handleChange("showMobileOnLetter", e.target.checked)
                            }
                          />
                          Include the petitioner's mobile number on the letter
                        </label>
                      </section>
                    )}

                    {/* File Upload */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Supporting Documents
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
                            Click to attach a supporting document
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
                          onClick={() => { addAnotherRef.current = false; }}
                        >
                          {loading ? "Submitting..." : "Register Office Grievance"}
                        </Button>
                        <Button
                          type="submit"
                          variant="outline"
                          className="w-full"
                          disabled={loading}
                          onClick={() => { addAnotherRef.current = true; }}
                        >
                          Save &amp; add another
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
