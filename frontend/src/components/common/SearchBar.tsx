import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Optional Enter-key handler (e.g. for server-side search). */
  onSubmit?: () => void;
}

/**
 * Standard search input with a leading magnifier and a clear (X) button.
 * Filtering is the caller's responsibility — client-side filter or server query.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  onSubmit,
}: SearchBarProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) onSubmit();
        }}
        placeholder={placeholder}
        className="h-9 pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
