import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { visitorApi } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import FloatingNotice from "@/components/common/FloatingNotice";
import { CONSTITUENCY_OPTIONS } from "@/lib/constituencies";

const DESIGNATIONS = ["Party Worker", "Official", "Public", "Business", "Media", "Family", "VIP", "Supporter", "Other"];

// Single combined page (no toggle): every field is asked up-front. The person
// is logged as a visitor, and if a Date of Birth is entered it automatically
// appears in View Birthdays + the dashboard popup (DOB-driven birthday feed).
export default function AddPerson() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: "",
    designation: "",
    phone: "",
    dob: "",
    constituency: "",
    wardVillage: "",
    referencedBy: "",
    purpose: "",
  });
  // When checked, the person is logged as a serving official — their birthday is
  // then marked "Official" in View Birthdays + the dashboard. Unchecked = a
  // normal visitor.
  const [isOfficial, setIsOfficial] = useState(false);

  const change = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError("Name is required");
    if (!form.designation) return setError("Please select a designation");
    if (!form.purpose.trim()) return setError("Purpose is required");

    setLoading(true);
    try {
      await visitorApi.create({
        name: form.name,
        designation: form.designation,
        phone: form.phone || undefined,
        dob: form.dob || undefined,
        purpose: form.purpose,
        referencedBy: form.referencedBy || undefined,
        constituency: form.constituency || undefined,
        wardVillage: form.wardVillage.trim() || undefined,
        isOfficial,
      });
      setSuccess(true);
      setTimeout(() => navigate("/staff/home"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Add Visitor / Birthday
              </h1>
              <p className="text-sm text-muted-foreground">
                Log a person's details. If you enter a date of birth, it's
                automatically tracked in View Birthdays and the dashboard.
              </p>
            </div>

            <FloatingNotice
              show={success}
              variant="success"
              message="Saved successfully! Redirecting…"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <Card className="rounded-2xl shadow-sm bg-white/90 border border-indigo-100">
                <CardHeader>
                  <CardTitle className="text-lg">Person Details</CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="Full name"
                        value={form.name}
                        onChange={(e) => change("name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Designation / Relation <span className="text-red-500">*</span></Label>
                      <Select value={form.designation} onValueChange={(v) => change("designation", v)}>
                        <SelectTrigger><SelectValue placeholder="Select designation / relation" /></SelectTrigger>
                        <SelectContent>
                          {DESIGNATIONS.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Phone Number</Label>
                      <Input
                        placeholder="10-digit mobile number"
                        value={form.phone}
                        onChange={(e) => change("phone", e.target.value)}
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label>Date of Birth</Label>
                      <Input
                        type="date"
                        value={form.dob}
                        onChange={(e) => change("dob", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Shows up in View Birthdays &amp; the dashboard popup.
                      </p>
                    </div>
                  </div>

                  {/* Official flag — when checked, the birthday is marked
                      "Official"; otherwise the person is a normal visitor. */}
                  <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                    <Checkbox
                      id="isOfficial"
                      checked={isOfficial}
                      onCheckedChange={(v) => setIsOfficial(v === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="isOfficial" className="cursor-pointer">
                        This person is an official
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Tick if they're already a serving official — their
                        birthday is then marked as "Official". Leave unchecked
                        for a normal visitor.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Constituency</Label>
                      <Select value={form.constituency} onValueChange={(v) => change("constituency", v)}>
                        <SelectTrigger><SelectValue placeholder="Select constituency" /></SelectTrigger>
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
                        value={form.wardVillage}
                        onChange={(e) => change("wardVillage", e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Referenced By</Label>
                    <Input
                      placeholder="Eg: Local Leader, Office Staff"
                      value={form.referencedBy}
                      onChange={(e) => change("referencedBy", e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>Purpose / Notes <span className="text-red-500">*</span></Label>
                    <Textarea
                      placeholder="Purpose of visit, or any notes about this person"
                      className="min-h-[100px]"
                      value={form.purpose}
                      onChange={(e) => change("purpose", e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-3 border-t pt-4">
                    <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Saving…" : "Save"}
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
