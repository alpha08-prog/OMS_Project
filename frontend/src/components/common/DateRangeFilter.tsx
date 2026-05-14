import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
}

/**
 * Two date inputs (from / to) plus a clear button when either is set.
 * Designed to live inline with other filter controls in admin/staff list pages.
 * Filtering happens server-side via startDate/endDate query params.
 */
export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  fromLabel = "From",
  toLabel = "To",
  className = "",
}: DateRangeFilterProps) {
  const hasValue = Boolean(startDate || endDate);

  // Labels render inline (prefix) instead of stacked above so the overall
  // control is a single h-9 row. Lets the filter sit on the same baseline as
  // the search bar / status dropdown wherever it's placed.
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{fromLabel}</span>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-9 w-40"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{toLabel}</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="h-9 w-40"
        />
      </label>
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 text-xs"
          onClick={() => {
            onStartDateChange("");
            onEndDateChange("");
          }}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Clear dates
        </Button>
      )}
    </div>
  );
}
