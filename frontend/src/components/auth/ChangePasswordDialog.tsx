import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { KeyRound, Info, Eye, EyeOff } from "lucide-react";
import { authApi, type PasswordPolicy } from "../../lib/api";

type FormState = {
  current: string;
  next: string;
  confirm: string;
};

const EMPTY_FORM: FormState = { current: "", next: "", confirm: "" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Self-contained "Change Password" modal for the SUPER_ADMIN header.
 *
 * The SUPER_ADMIN dashboard is a header-only, popup-driven layout with no
 * admin sidebar — so password changes live here as a dialog rather than the
 * sidebar-wrapped /profile page (which is the ADMIN/STAFF experience).
 * Talks to the same backend (PUT /auth/password) and honours the same
 * monthly-change policy.
 */
export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy | undefined>(undefined);

  // Reset state and (re)load the current policy each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setShowCurrent(false);
    setShowNext(false);
    setError(null);
    setSuccess(false);
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.getMe();
        if (!cancelled) setPolicy(me?.passwordPolicy);
      } catch {
        // Non-fatal: the form still works; the policy banner just won't show.
        if (!cancelled) setPolicy(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const remaining = policy ? Math.max(0, policy.allowed - policy.used) : null;
  const limitReached = policy ? policy.used >= policy.allowed : false;

  const onChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (limitReached) {
      setError("Monthly password change limit reached.");
      return;
    }
    if (!form.current) {
      setError("Please enter your current password");
      return;
    }
    if (form.next.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (form.next === form.current) {
      setError("New password must be different from your current password");
      return;
    }
    if (form.next !== form.confirm) {
      setError("Confirmation does not match the new password");
      return;
    }

    setSubmitting(true);
    try {
      const res = await authApi.updatePassword(form.current, form.next);
      const updatedPolicy = res?.data?.passwordPolicy;
      if (updatedPolicy) setPolicy(updatedPolicy);
      setSuccess(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-2 border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white">
        <DialogHeader className="pb-4 border-b border-indigo-100">
          <DialogTitle className="text-indigo-900 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-indigo-600" />
            Change Password
          </DialogTitle>
          <DialogDescription>
            Update the password for your Super Administrator account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Monthly-limit banner — mirrors the policy enforced server-side. */}
          {policy && (
            <div
              className={
                "flex items-start gap-2 px-4 py-3 rounded-lg text-sm border " +
                (limitReached
                  ? "bg-red-50 border-red-200 text-red-800"
                  : remaining === 1
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-indigo-50/60 border-indigo-100 text-indigo-800")
              }
            >
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">
                  {policy.used} of {policy.allowed} password changes used this month
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  {limitReached
                    ? `Monthly limit reached. Resets on ${new Date(policy.resetsAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}.`
                    : `Resets on ${new Date(policy.resetsAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}.`}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
              Password updated successfully.
            </div>
          )}

          <div>
            <Label htmlFor="sa-current-password">Current Password</Label>
            <div className="relative mt-1">
              <Input
                id="sa-current-password"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                value={form.current}
                onChange={(e) => onChange("current", e.target.value)}
                disabled={limitReached}
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

          <div>
            <Label htmlFor="sa-new-password">New Password</Label>
            <div className="relative mt-1">
              <Input
                id="sa-new-password"
                type={showNext ? "text" : "password"}
                autoComplete="new-password"
                value={form.next}
                onChange={(e) => onChange("next", e.target.value)}
                disabled={limitReached}
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
              At least 8 characters with an uppercase, lowercase, number, and special character.
            </p>
          </div>

          <div>
            <Label htmlFor="sa-confirm-password">Confirm New Password</Label>
            <Input
              id="sa-confirm-password"
              type={showNext ? "text" : "password"}
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => onChange("confirm", e.target.value)}
              disabled={limitReached}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || limitReached}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting ? "Updating…" : "Update Password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
