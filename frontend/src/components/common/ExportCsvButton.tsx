import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, type CsvColumn } from "@/lib/exportCsv";

interface ExportCsvButtonProps<T> {
  /** Rows to export — pass the *filtered/visible* rows so the export matches the view. */
  rows: T[];
  columns: CsvColumn<T>[];
  /** Base filename (no extension); the current date is appended automatically. */
  filename: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Standard "Export to CSV" button for list/table pages. Disabled when there is
 * nothing to export. Re-usable across every page that shows tabular data.
 */
export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
  label = "Export CSV",
  disabled,
  className = "",
}: ExportCsvButtonProps<T>) {
  const empty = !rows || rows.length === 0;

  const handleExport = () => {
    if (empty) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`${filename}-${date}`, rows, columns);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || empty}
      onClick={handleExport}
      className={`h-9 ${className}`}
    >
      <Download className="h-3.5 w-3.5 mr-1" />
      {label}
    </Button>
  );
}
