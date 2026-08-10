import { AlertTriangle } from "lucide-react";

/**
 * Tells the user, plainly, when a list is showing only part of the data.
 *
 * Most list screens here fetch a capped chunk from the server and paginate it
 * in the browser. That is a reasonable product decision — but only if the user
 * KNOWS. Silently rendering 200 of 1,247 records is indistinguishable from
 * "there are 200 records", and a page that quietly omits data is worse than one
 * that refuses to load: nobody goes looking for what they were never told is
 * missing.
 *
 * The server now returns a real `total` on these endpoints, so the cap can be
 * compared against reality instead of guessed at. Render nothing when the list
 * is complete; say so clearly when it isn't.
 */
interface TruncationNoticeProps {
  /** Rows actually received from the server. */
  loaded: number;
  /** Real dataset total, when the server could compute one. */
  total?: number;
  /** False when the count is unavailable — never invent one. */
  totalKnown?: boolean;
  /** What the user should do about it. */
  hint?: string;
  className?: string;
}

export function TruncationNotice({
  loaded,
  total,
  totalKnown,
  hint = "Narrow the filters or date range to see the rest.",
  className = "",
}: TruncationNoticeProps) {
  // No count available → say nothing rather than guess. A wrong warning trains
  // people to ignore warnings.
  if (totalKnown === false || typeof total !== "number") return null;
  if (loaded >= total) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 ${className}`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
      <span>
        Showing <span className="font-semibold">{loaded.toLocaleString()}</span> of{" "}
        <span className="font-semibold">{total.toLocaleString()}</span> records. {hint}
      </span>
    </div>
  );
}
