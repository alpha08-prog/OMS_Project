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

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">{fromLabel}</label>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">{toLabel}</label>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="h-9 w-40"
        />
      </div>
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
