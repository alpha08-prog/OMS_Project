import { useMemo, useState } from "react";
import { Check, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

export type StaffOption = {
  id: string;
  name: string;
  email?: string;
};

type Props = {
  staff: StaffOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Picker for assigning a task to one or many staff members.
 * - Searchable by name or email.
 * - Shows selected count + a "Select all (filtered)" toggle.
 * - Renders as an inline panel (no popover) so it works inside dialogs
 *   that already constrain z-index.
 */
export function StaffMultiSelect({
  staff,
  selectedIds,
  onChange,
  loading = false,
  disabled = false,
  placeholder = "Search staff by name or email",
}: Props) {
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q)
    );
  }, [staff, query]);

  const toggle = (id: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAllFiltered = () => {
    if (disabled) return;
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((s) => s.id));
      onChange(selectedIds.filter((id) => !filteredIds.has(id)));
    } else {
      const next = new Set(selectedIds);
      for (const s of filtered) next.add(s.id);
      onChange(Array.from(next));
    }
  };

  return (
    <div
      className={`rounded-lg border border-indigo-100 bg-white ${
        disabled ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-100">
        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="border-0 shadow-none focus-visible:ring-0 px-0 h-8"
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 text-xs border-b border-indigo-100 bg-indigo-50/40">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {selectedIds.length} selected
          {filtered.length !== staff.length && ` · ${filtered.length} of ${staff.length} shown`}
        </span>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleAllFiltered}
            className="text-indigo-700 hover:text-indigo-900 font-medium"
          >
            {allFilteredSelected ? "Clear visible" : "Select all visible"}
          </button>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-6">Loading staff…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {staff.length === 0 ? "No staff to assign" : "No matches"}
          </p>
        ) : (
          <ul className="divide-y divide-indigo-50">
            {filtered.map((s) => {
              const isOn = selected.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      isOn ? "bg-indigo-50/70" : "hover:bg-indigo-50/40"
                    }`}
                  >
                    <span
                      className={`h-4 w-4 flex-shrink-0 rounded border-2 flex items-center justify-center ${
                        isOn
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-gray-300"
                      }`}
                    >
                      {isOn && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-indigo-900 truncate">{s.name}</span>
                      {s.email && (
                        <span className="block text-xs text-muted-foreground truncate">{s.email}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
