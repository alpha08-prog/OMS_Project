import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, UserPlus, Copy, Check, ArrowLeft, Info } from "lucide-react";
import { authApi, type UserRole, type User } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

type FormState = {
  name: string;
  email: string;
  phone: string;
  role: UserRole | "";
  password: string;
  confirm: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  role: "",
  password: "",
  confirm: "",
};

function roleLabel(r: UserRole | string): string {
  return r.replace("_", " ");
}

export default function CreateUser() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After success we keep the typed password around so the admin can copy
  // it out. We never re-fetch it from the server (the server only stores
  // the bcrypt hash); this is purely the admin's own input.
  const [created, setCreated] = useState<{ user: User; password: string } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const onChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required";
    if (!form.email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Email format looks invalid";
    if (form.phone && !/^\d{10}$/.test(form.phone.trim())) {
      return "Phone must be exactly 10 digits, or leave it empty";
    }
    if (!form.role) return "Pick a role";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (form.password !== form.confirm) return "Password and confirmation don't match";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const user = await authApi.createUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        role: form.role as UserRole,
      });
      setCreated({ user, password: form.password });
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      // Clipboard can fail on insecure origins or no permissions.
      // Admin can still read + manually copy the displayed value.
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">Create User</h1>
                <p className="text-sm text-muted-foreground">
                  Provision a new account. The user will be told their password and can rotate it from their profile after first login.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>

            {/* Success block — shown after a user is created */}
            {created && (
              <Card className="rounded-2xl border border-green-200 bg-green-50/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-green-900">
                    <Check className="h-4 w-4" />
                    Account created
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-green-900">
                  <p>
                    <strong>{created.user.name}</strong> can now log in with this email and password:
                  </p>
                  <div className="bg-white border border-green-200 rounded-lg p-3 space-y-2 font-mono text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span><span className="text-muted-foreground">Email:</span> {created.user.email}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span><span className="text-muted-foreground">Password:</span> {created.password}</span>
                      <Button size="sm" variant="outline" type="button" onClick={copyPassword}>
                        {passwordCopied ? (
                          <><Check className="h-3.5 w-3.5 mr-1" /> Copied</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5 mr-1" /> Copy</>
                        )}
                      </Button>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Role:</span> {roleLabel(created.user.role)}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800/80">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>
                      Share this password securely (in person, or via a private channel that you delete after they log in).
                      It won't be shown again — once you leave this page the only copy is what the user has.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCreated(null);
                        setPasswordCopied(false);
                      }}
                    >
                      Create another user
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Form — hidden once a user has just been created, until the admin clicks "Create another" */}
            {!created && (
              <Card className="rounded-2xl shadow-sm border border-indigo-100">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-indigo-600" />
                    Account Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="cu-name">Full Name *</Label>
                        <Input
                          id="cu-name"
                          value={form.name}
                          onChange={(e) => onChange("name", e.target.value)}
                          placeholder="Shri. ..."
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="cu-email">Email *</Label>
                        <Input
                          id="cu-email"
                          type="email"
                          autoComplete="off"
                          value={form.email}
                          onChange={(e) => onChange("email", e.target.value)}
                          placeholder="user@example.com"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="cu-phone">Phone (10 digits, optional)</Label>
                        <Input
                          id="cu-phone"
                          inputMode="numeric"
                          autoComplete="off"
                          value={form.phone}
                          onChange={(e) => onChange("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="9876543210"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="cu-role">Role *</Label>
                        <Select
                          value={form.role}
                          onValueChange={(v) => onChange("role", v)}
                        >
                          <SelectTrigger id="cu-role" className="mt-1">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STAFF">Staff</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="cu-pw">Initial Password *</Label>
                        <div className="relative mt-1">
                          <Input
                            id="cu-pw"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={form.password}
                            onChange={(e) => onChange("password", e.target.value)}
                            placeholder="Min. 8 characters"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="cu-confirm">Confirm Password *</Label>
                        <Input
                          id="cu-confirm"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.confirm}
                          onChange={(e) => onChange("confirm", e.target.value)}
                          placeholder="Re-enter the password"
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-indigo-50/60 border border-indigo-100 rounded-lg p-3">
                      <Info className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <p>
                        The password you type here is what the user will log in with. The server stores
                        only a one-way bcrypt hash; once you leave this page after creation, the plaintext
                        is not retrievable. Make sure you write it down or copy it before navigating away.
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setForm(EMPTY_FORM)}
                        disabled={submitting}
                      >
                        Reset
                      </Button>
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        {submitting ? "Creating…" : "Create User"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
