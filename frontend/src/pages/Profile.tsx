import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User as UserIcon,
  Mail,
  Phone,
  ShieldCheck,
  KeyRound,
  Info,
  Eye,
  EyeOff,
} from "lucide-react";
import { authApi, type User } from "@/lib/api";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

type FormState = {
  current: string;
  next: string;
  confirm: string;
};

const EMPTY_FORM: FormState = { current: "", next: "", confirm: "" };

function roleBadgeClass(role: string | undefined): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "bg-purple-100 text-purple-800 hover:bg-purple-100";
    case "ADMIN":
      return "bg-indigo-100 text-indigo-800 hover:bg-indigo-100";
    case "STAFF":
      return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-100";
  }
}

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (!cancelled) {
          setProfileError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setPwError(null);
    setPwSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (!form.current) {
      setPwError("Please enter your current password");
      return;
    }
    if (form.next.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (form.next === form.current) {
      setPwError("New password must be different from your current password");
      return;
    }
    if (form.next !== form.confirm) {
      setPwError("Confirmation does not match the new password");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.updatePassword(form.current, form.next);
      setPwSuccess(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Page header */}
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">My Profile</h1>
              <p className="text-sm text-muted-foreground">
                View your account information and change your password.
              </p>
            </div>

            {/* Identity card */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardContent className="flex items-center gap-4 py-6">
                <div className="h-16 w-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-semibold">
                  {loading ? "…" : initials(user?.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-indigo-900 truncate">
                    {loading ? "Loading…" : user?.name ?? "—"}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {loading ? "" : user?.email ?? "—"}
                  </p>
                </div>
                {user?.role && (
                  <Badge className={roleBadgeClass(user.role)}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                    {user.role.replace("_", " ")}
                  </Badge>
                )}
              </CardContent>
            </Card>

            {profileError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {profileError}
              </div>
            )}

            {/* Account info — read-only */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-indigo-600" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> Name
                    </Label>
                    <Input value={user?.name ?? ""} disabled readOnly className="mt-1 bg-gray-50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </Label>
                    <Input value={user?.email ?? ""} disabled readOnly className="mt-1 bg-gray-50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Contact Number
                    </Label>
                    <Input
                      value={user?.phone ?? "—"}
                      disabled
                      readOnly
                      className="mt-1 bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Role
                    </Label>
                    <Input
                      value={(user?.role ?? "").replace("_", " ")}
                      disabled
                      readOnly
                      className="mt-1 bg-gray-50"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-indigo-50/60 border border-indigo-100 rounded-lg p-3">
                  <Info className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <p>
                    Name, email, contact number, and role are managed by your administrator.
                    Contact your administrator if any of these need to change.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Change password */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-indigo-600" />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {pwError && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                      {pwError}
                    </div>
                  )}
                  {pwSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
                      Password updated successfully.
                    </div>
                  )}

                  <div>
                    <Label htmlFor="current-password">Current Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="current-password"
                        type={showCurrent ? "text" : "password"}
                        autoComplete="current-password"
                        value={form.current}
                        onChange={(e) => onChange("current", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1"
                        aria-label={showCurrent ? "Hide password" : "Show password"}
                      >
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new-password">New Password</Label>
                      <div className="relative mt-1">
                        <Input
                          id="new-password"
                          type={showNext ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.next}
                          onChange={(e) => onChange("next", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNext((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1"
                          aria-label={showNext ? "Hide password" : "Show password"}
                        >
                          {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Minimum 8 characters.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <Input
                        id="confirm-password"
                        type={showNext ? "text" : "password"}
                        autoComplete="new-password"
                        value={form.confirm}
                        onChange={(e) => onChange("confirm", e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForm(EMPTY_FORM);
                        setPwError(null);
                        setPwSuccess(false);
                      }}
                      disabled={submitting}
                    >
                      Reset
                    </Button>
                    <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
                      {submitting ? "Updating…" : "Update Password"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
