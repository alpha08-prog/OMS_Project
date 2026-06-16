/**
 * Tiny dependency-free CSV exporter shared by every list/table page.
 *
 * Usage:
 *   const columns: CsvColumn<Grievance>[] = [
 *     { header: "Petitioner", value: (g) => g.petitionerName },
 *     { header: "Created", value: (g) => new Date(g.createdAt).toLocaleString() },
 *   ];
 *   downloadCsv("grievances", rows, columns);
 */

export type CsvColumn<T> = {
  header: string;
  /** Extract the cell value for a row. The result is stringified + escaped. */
  value: (row: T) => string | number | boolean | null | undefined;
};

/** RFC-4180 style cell escaping: wrap in quotes when the value needs it. */
function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str) || str !== str.trim()) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(",");
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeCell(c.value(row))).join(",")
  );
  return [headerLine, ...bodyLines].join("\r\n");
}

/**
 * Build the CSV and trigger a browser download. A UTF-8 BOM is prepended so
 * Excel renders Indian-language names correctly. If `filename` has no .csv
 * extension one is added.
 */
export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[]
): void {
  const csv = buildCsv(rows, columns);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
