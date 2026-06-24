import { useEffect, useState } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ChevronDown, Upload, X } from "lucide-react";
import {
  grievanceApi,
  pdfApi,
  uploadsApi,
  type GrievanceType,
  type TempleRegistryEntry,
  type TempleServiceCode,
} from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useFormDraft } from "@/hooks/useFormDraft";
import FloatingNotice from "@/components/common/FloatingNotice";
import { CONSTITUENCY_OPTIONS } from "@/lib/constituencies";

// Sentinel templeKey for the "Other" dropdown option. When chosen, the staff
// member supplies the temple name via a text input and we send that name as
// the templeKey on submit.
const OTHER_TEMPLE_KEY = "OTHER";

type Step = "type" | "form";

export default function GrievanceCreate() {
  const navigate = useNavigate();
  // Two-step flow: pick the grievance type first, then show the right form.
  const [step, setStep] = useState<Step>("type");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [formData, setFormData, clearFormDraft] = useFormDraft("grievance:create", {
    petitionerName: "",
    mobileNumber: "",
    constituency: "",
    wardVillage: "",
    grievanceType: "" as GrievanceType | "",
    description: "",
    monetaryValue: "",
    referencedBy: "",
    // Temple-visit specific. Persisted alongside the rest so a refresh doesn't
    // wipe what the staff typed. Ignored at submit time when grievanceType is
    // anything other than TEMPLE_VISIT.
    templeKey: "",
    customTempleName: "",
    customTempleRecipient: "",
    memberCount: "",
    originDistrict: "",
    originState: "",
    visitDateFrom: "",
    visitDateTo: "",
    showMobileOnLetter: false,
    customService: "",
  });

  // Selected registry service codes. Kept outside useFormDraft (which serialises
  // a key→string map) and re-seeded from the temple registry when a temple is
  // first picked.
  const [servicesRequested, setServicesRequested] = useState<TempleServiceCode[]>([]);
  const [otherServiceChecked, setOtherServiceChecked] = useState(false);

  const [templeRegistry, setTempleRegistry] = useState<TempleRegistryEntry[]>([]);
  const [serviceLabels, setServiceLabels] = useState<Record<TempleServiceCode, string>>(
    {} as Record<TempleServiceCode, string>
  );
  const [registryLoaded, setRegistryLoaded] = useState(false);

  const isTempleVisit = formData.grievanceType === "TEMPLE_VISIT";
  const isOtherTemple = formData.templeKey === OTHER_TEMPLE_KEY;

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
        // Non-fatal — the dropdown stays empty and the staff can pick later.
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
    // Auto-seed default services only when a registry temple is picked.
    if (key !== OTHER_TEMPLE_KEY) {
      const t = templeRegistry.find((x) => x.key === key);
      if (t && servicesRequested.length === 0) {
        setServicesRequested(t.defaultServices);
      }
    }
    setError(null);
  };

  const toggleService = (code: TempleServiceCode) => {
    setServicesRequested((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]
    );
  };

  // Step 1 → Step 2: validate type was picked and advance.
  const handleContinue = () => {
    if (!formData.grievanceType) {
      setError("Please select a grievance type to continue");
      return;
    }
    setError(null);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

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
      if (isOtherTemple && !formData.customTempleName.trim()) {
        setError("Please specify the temple name");
        setLoading(false);
        return;
      }
      if (isOtherTemple && !formData.customTempleRecipient.trim()) {
        setError("Please specify who the letter should be addressed to");
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
      if (otherServiceChecked && !formData.customService.trim()) {
        setError("Please specify the requested service");
        setLoading(false);
        return;
      }
    }

    try {
      const finalTempleKey = isOtherTemple
        ? formData.customTempleName.trim()
        : formData.templeKey;

      // Predefined registry codes ride alongside an optional OTHER:<text>
      // entry that the backend stores as-is. Commas would collide with the
      // CSV separator backend-side, so we strip them.
      const finalServices: string[] = [...servicesRequested];
      if (otherServiceChecked && formData.customService.trim()) {
        const note = formData.customService.trim().replace(/,/g, " ");
        finalServices.push(`OTHER:${note}`);
      }

      const templeNameForDesc = isOtherTemple
        ? formData.customTempleName.trim()
        : templeRegistry.find((t) => t.key === formData.templeKey)?.deity ||
          formData.templeKey;

      const synthDescription = isTempleVisit
        ? `Temple visit letter for ${formData.petitionerName} and ${formData.memberCount} members to ${templeNameForDesc}`
        : formData.description;

      const created = await grievanceApi.create({
        petitionerName: formData.petitionerName,
        mobileNumber: formData.mobileNumber,
        constituency: formData.constituency,
        wardVillage: formData.wardVillage.trim() || undefined,
        grievanceType: formData.grievanceType as GrievanceType,
        description: synthDescription,
        monetaryValue:
          !isTempleVisit && formData.monetaryValue
            ? parseFloat(formData.monetaryValue)
            : undefined,
        // For TEMPLE_VISIT the only sensible action is "generate the letter".
        actionRequired: isTempleVisit ? "GENERATE_LETTER" : undefined,
        referencedBy: formData.referencedBy || undefined,
        ...(isTempleVisit && {
          templeKey: finalTempleKey,
          templeRecipient: isOtherTemple
            ? formData.customTempleRecipient.trim()
            : undefined,
          memberCount: Number(formData.memberCount),
          originDistrict: formData.originDistrict.trim() || undefined,
          originState: formData.originState.trim() || undefined,
          visitDateFrom: formData.visitDateFrom || undefined,
          visitDateTo: formData.visitDateTo || undefined,
          servicesRequested:
            finalServices.length > 0
              ? (finalServices as Array<TempleServiceCode | `OTHER:${string}`>)
              : undefined,
          showMobileOnLetter: Boolean(formData.showMobileOnLetter),
        }),
      });

      if (file) {
        try {
          await uploadsApi.upload(file, "GRIEVANCE", created.id);
        } catch (uploadErr: unknown) {
          const msg =
            uploadErr instanceof Error ? uploadErr.message : "attachment upload failed";
          setError(`Grievance saved, but attachment failed: ${msg}`);
        }
      }

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

  const pageHeader = (
    <div>
      <h1 className="text-2xl font-semibold text-indigo-900">
        Register New Grievance
      </h1>
      <p className="text-sm text-muted-foreground">
        Public Grievance & Letter Tracking
      </p>
    </div>
  );

  const errorBanner = error ? (
    <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
      ❌ {error}
    </div>
  ) : null;

  const successBanner = (
    <FloatingNotice
      show={success}
      variant="success"
      message="Grievance registered successfully! Redirecting..."
    />
  );

  // ----- Step 1: just the type picker -----
  if (step === "type") {
    return (
      <div className="flex min-h-screen bg-background relative">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto relative z-0">
          <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {pageHeader}
              {errorBanner}
              <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
                <CardHeader>
                  <CardTitle className="text-lg">Choose Grievance Type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm text-muted-foreground">
                    Select the type first — we will only ask the fields relevant
                    to that type.
                  </p>
                  <div>
                    <Label>
                      Grievance Type <span className="text-red-500">*</span>
                    </Label>
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
                        <SelectItem value="Revenue">Revenue</SelectItem>
                        <SelectItem value="RDPR">RDPR</SelectItem>
                        <SelectItem value="Railway">Railway</SelectItem>
                        <SelectItem value="Agriculture">Agriculture</SelectItem>
                        <SelectItem value="Job">Job</SelectItem>
                        <SelectItem value="MP_LAD">MP LAD</SelectItem>
                        <SelectItem value="TEMPLE_VISIT">
                          Temple Visit (Darshan Letter)
                        </SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate(-1)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="bg-amber-500 text-black hover:bg-amber-600"
                      onClick={handleContinue}
                    >
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ----- Step 2: the appropriate form (temple vs default) -----
  return (
    <div className="flex min-h-screen bg-background relative">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto relative z-0">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {pageHeader}

            <button
              type="button"
              onClick={() => {
                setStep("type");
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-sm text-indigo-700 hover:text-indigo-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Change grievance type (
              {formData.grievanceType.replace(/_/g, " ").toLowerCase()})
            </button>

            {successBanner}
            {errorBanner}

            <form onSubmit={handleSubmit}>
              <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {isTempleVisit ? "Temple Visit Letter" : "Grievance Details"}
                  </CardTitle>
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
                                e.target.value.replace(/\D/g, "").slice(0, 10)
                              )
                            }
                            maxLength={10}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Location — common to both flows */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                        Location
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>
                            Constituency <span className="text-red-500">*</span>
                          </Label>
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
                          <Label>Ward / Village</Label>
                          <Input
                            placeholder="Enter ward or village"
                            value={formData.wardVillage}
                            onChange={(e) => handleChange("wardVillage", e.target.value)}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Either the temple section OR the generic grievance fields */}
                    {isTempleVisit ? (
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
                                <SelectItem value={OTHER_TEMPLE_KEY}>
                                  Other (specify)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {isOtherTemple && (
                            <>
                              <div className="md:col-span-2">
                                <Label>
                                  Temple Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  placeholder="e.g. Shri Kashi Vishwanath"
                                  value={formData.customTempleName}
                                  onChange={(e) =>
                                    handleChange("customTempleName", e.target.value)
                                  }
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Name prints on the letter as the deity / temple line.
                                </p>
                              </div>
                              <div className="md:col-span-2">
                                <Label>
                                  Letter Addressed To <span className="text-red-500">*</span>
                                </Label>
                                <Textarea
                                  className="min-h-[110px] font-mono text-sm"
                                  placeholder={"A.D.M. Protocol\nVaranasi.\nUttar Pradesh."}
                                  value={formData.customTempleRecipient}
                                  onChange={(e) =>
                                    handleChange(
                                      "customTempleRecipient",
                                      e.target.value
                                    )
                                  }
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  One line per row, exactly as it should appear on the letter.
                                  This block prints verbatim at the bottom (e.g. designation, city, state).
                                </p>
                              </div>
                            </>
                          )}

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

                        {/* Services Requested — multi-select dropdown with Other. */}
                        <div>
                          <Label>Services Requested</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="mt-1 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm hover:border-amber-400"
                              >
                                <span className="truncate text-left">
                                  {servicesRequested.length === 0 && !otherServiceChecked
                                    ? "Select services..."
                                    : [
                                        ...servicesRequested.map(
                                          (code) => serviceLabels[code] || code
                                        ),
                                        ...(otherServiceChecked
                                          ? [
                                              formData.customService.trim()
                                                ? `Other: ${formData.customService.trim()}`
                                                : "Other (specify)",
                                            ]
                                          : []),
                                      ].join(", ")}
                                </span>
                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[--radix-popover-trigger-width] p-2"
                              align="start"
                            >
                              <div className="space-y-1 max-h-60 overflow-auto">
                                {(Object.keys(serviceLabels) as TempleServiceCode[]).map(
                                  (code) => {
                                    const checked = servicesRequested.includes(code);
                                    return (
                                      <label
                                        key={code}
                                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-amber-50 cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() => toggleService(code)}
                                        />
                                        <span>{serviceLabels[code]}</span>
                                      </label>
                                    );
                                  }
                                )}
                                <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-amber-50 cursor-pointer border-t mt-1 pt-2">
                                  <Checkbox
                                    checked={otherServiceChecked}
                                    onCheckedChange={(c) =>
                                      setOtherServiceChecked(c === true)
                                    }
                                  />
                                  <span>Other (specify)</span>
                                </label>
                              </div>
                            </PopoverContent>
                          </Popover>

                          {otherServiceChecked && (
                            <div className="mt-2">
                              <Input
                                placeholder="Describe the requested service"
                                value={formData.customService}
                                onChange={(e) =>
                                  handleChange("customService", e.target.value)
                                }
                              />
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground mt-2">
                            Defaults are auto-selected based on the temple. Pick more or add a custom request.
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
                    ) : (
                      <section className="space-y-4">
                        <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                          Grievance Information
                        </h3>

                        <div>
                          <Label>
                            Description <span className="text-red-500">*</span>
                          </Label>
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
                              {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
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
                                setError("File is larger than 10 MB.");
                                return;
                              }
                              setFile(f);
                              setError(null);
                            }}
                          />
                        </label>
                      )}
                    </section>
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h3 className="font-medium text-indigo-800">Reference Information</h3>
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

                    <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                          Ticket Status
                        </h3>
                        <div className="inline-flex items-center px-4 py-2 rounded-lg bg-green-100 text-green-800 text-sm font-semibold border border-green-200">
                          OPEN
                        </div>
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
                          {loading ? "Submitting..." : "Register Grievance"}
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
