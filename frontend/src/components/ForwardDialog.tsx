import { useEffect, useState } from "react";
import { Check, Forward, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { authApi, type DirectoryUser } from "@/lib/api";
import { getUserData } from "@/lib/tabStorage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being forwarded, e.g. "task" or "grievance" — used in copy. */
  itemLabel?: string;
  /** Optional context line (e.g. the task title) shown under the heading. */
  subtitle?: string;
  submitting?: boolean;
  onSubmit: (recipientId: string, remark: string) => void;
};

/**
 * Shared dialog to forward a task or grievance to ONE other user.
 * - Searchable single-select picker over the full user directory.
 * - Excludes the current user (you can't forward to yourself).
 * - Optional remark, shown to the recipient alongside the auto timeline entry.
 *
 * Renders the picker inline (no nested popover) so it works inside the dialog's
 * constrained z-index, mirroring StaffMultiSelect.
 */
export function ForwardDialog({
  open,
  onOpenChange,
  itemLabel = "item",
  subtitle,
  submitting = false,
  onSubmit,
}: Props) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");

  const myId = getUserData()?.id ?? null;

  // Load the directory the first time the dialog opens; reset selection each open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedId(null);
    setRemark("");
    if (users.length > 0 || loading) return;
    setLoading(true);
    setError(null);
    authApi
      .getDirectory()
      .then((list) => setUsers(list))
      .catch(() => setError("Could not load users. Please try again."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = users.filter((u) => String(u.id) !== String(myId));
  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q),
      )
    : candidates;

  const submit = () => {
    if (!selectedId || submitting) return;
    onSubmit(selectedId, remark.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Forward {itemLabel}</DialogTitle>
          <DialogDescription>
            {subtitle
              ? subtitle
              : `Choose one person to forward this ${itemLabel} to.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-indigo-100 bg-white">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-100">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or role"
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-8"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                Loading users…
              </p>
            ) : error ? (
              <p className="text-center text-sm text-red-600 py-6">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                {candidates.length === 0 ? "No other users found" : "No matches"}
              </p>
            ) : (
              <ul className="divide-y divide-indigo-50">
                {filtered.map((u) => {
                  const isOn = selectedId === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(u.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                          isOn ? "bg-indigo-50/70" : "hover:bg-indigo-50/40"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${
                            isOn
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {isOn && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-indigo-900 truncate">
                            {u.name}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {u.email} · {u.role}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-indigo-900">
            Remark <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Add a note for the recipient…"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!selectedId || submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Forward className="h-4 w-4" />
            )}
            Forward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
