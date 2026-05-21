import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, FileX, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  attendanceApi,
  type AttendanceRow,
  type AttendanceStatus,
} from "@/lib/api";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half Day",
  LEAVE: "Leave",
};

const STATUS_TONE: Record<AttendanceStatus | "ABSENT", string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  HALF_DAY: "bg-amber-100 text-amber-800",
  LEAVE: "bg-sky-100 text-sky-800",
  ABSENT: "bg-rose-100 text-rose-800",
};

function todayISTString(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// The "Apply" card handles HALF_DAY and LEAVE. PRESENT is intentionally
// excluded — it's a one-tap action for today and lives in the Today card.
type ApplyType = "HALF_DAY" | "LEAVE";

export default function StaffAttendance() {
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<AttendanceStatus | null>(null);

  // Apply-card state (Half Day / Leave).
  const [applyType, setApplyType] = useState<ApplyType>("LEAVE");
  const [applyFromDate, setApplyFromDate] = useState<string>(todayISTString());
  // Empty = single-day. Only meaningful for LEAVE. Cleared when switching to HD.
  const [applyToDate, setApplyToDate] = useState<string>("");
  const [reason, setReason] = useState("");

  // Feedback for both cards.
  const [presentError, setPresentError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyInfo, setApplyInfo] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [t, page] = await Promise.all([
        attendanceApi.getMyToday(),
        attendanceApi.getMyHistory({ limit: 50 }),
      ]);
      setToday(t);
      setHistory(page.rows);
      setNextCursor(page.nextCursor);
    } catch (err) {
      console.error("Failed to load attendance", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await attendanceApi.getMyHistory({
        limit: 50,
        cursor: nextCursor,
      });
      setHistory((prev) => [...prev, ...page.rows]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      console.error("Failed to load more history", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleMarkPresent = async () => {
    setPresentError(null);
    setSubmitting("PRESENT");
    try {
      const next = await attendanceApi.mark("PRESENT");
      setToday(next);
      const page = await attendanceApi.getMyHistory({ limit: 50 });
      setHistory(page.rows);
      setNextCursor(page.nextCursor);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to mark attendance.";
      setPresentError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const handleApply = async () => {
    setApplyError(null);
    setApplyInfo(null);
    const todayStr = todayISTString();

    if (applyFromDate < todayStr) {
      setApplyError("Date cannot be in the past.");
      return;
    }
    if (applyType === "LEAVE") {
      if (!reason.trim()) {
        setApplyError("Please provide a reason for leave.");
        return;
      }
      if (applyToDate && applyToDate < applyFromDate) {
        setApplyError("'To' date cannot be before 'From' date.");
        return;
      }
    }

    setSubmitting(applyType);
    try {
      const isRange =
        applyType === "LEAVE" && !!applyToDate && applyToDate > applyFromDate;

      if (isRange) {
        const result = await attendanceApi.markLeaveRange(
          applyFromDate,
          applyToDate,
          reason.trim()
        );
        const todayRecord = result.records.find((r) => r.date === todayStr);
        if (todayRecord) setToday(todayRecord);

        const parts: string[] = [];
        if (result.count > 0) {
          parts.push(
            `Leave marked for ${result.count} day${result.count === 1 ? "" : "s"}.`
          );
        }
        if (result.skipped.length > 0) {
          const skippedDates = result.skipped
            .map((s) => `${s.date} (${s.status})`)
            .join(", ");
          parts.push(`Skipped: ${skippedDates}.`);
        }
        setApplyInfo(parts.join(" ") || "No new leave days marked.");
      } else {
        const next = await attendanceApi.mark(
          applyType,
          applyType === "LEAVE" ? reason.trim() : undefined,
          applyFromDate
        );
        if (applyFromDate === todayStr) setToday(next);
        setApplyInfo(
          `${STATUS_LABEL[applyType]} marked for ${applyFromDate}.`
        );
      }

      const page = await attendanceApi.getMyHistory({ limit: 50 });
      setHistory(page.rows);
      setNextCursor(page.nextCursor);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to submit.";
      setApplyError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const todayIST = todayISTString();
  const presentMarkedToday = today?.date === todayIST && today?.status === "PRESENT";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                My Attendance
              </h1>
              <p className="text-sm text-muted-foreground">
                Mark today's attendance or plan a half day / leave for any
                upcoming date.
              </p>
            </div>

            {/* CARD 1 — TODAY: Mark Present (today only, one click) */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Today — {todayIST}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : today && today.date === todayIST ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className={STATUS_TONE[today.status]}>
                      {today.status === "ABSENT"
                        ? "Absent"
                        : STATUS_LABEL[today.status as AttendanceStatus]}
                    </Badge>
                    {today.reason && (
                      <span className="text-sm text-muted-foreground">
                        Reason: {today.reason}
                      </span>
                    )}
                    {today.markedAt && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Marked at {new Date(today.markedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not marked yet. Tap below to mark yourself present.
                  </p>
                )}

                <Button
                  disabled={submitting !== null || presentMarkedToday}
                  onClick={handleMarkPresent}
                  className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                >
                  {submitting === "PRESENT" ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                  )}
                  {presentMarkedToday
                    ? "Already marked present today"
                    : "Mark me present (today)"}
                </Button>

                {presentError && (
                  <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                    {presentError}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* CARD 2 — APPLY: Half Day or Leave (today or future) */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-sky-600" />
                  Apply Half Day or Leave
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  For today or any upcoming date.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Type toggle */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setApplyType("HALF_DAY");
                      setApplyToDate(""); // To date is leave-only
                      setApplyError(null);
                      setApplyInfo(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition ${
                      applyType === "HALF_DAY"
                        ? "bg-amber-500 text-white shadow-sm"
                        : "text-gray-700 hover:bg-white"
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    Half Day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApplyType("LEAVE");
                      setApplyError(null);
                      setApplyInfo(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition ${
                      applyType === "LEAVE"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-gray-700 hover:bg-white"
                    }`}
                  >
                    <FileX className="h-4 w-4" />
                    Leave
                  </button>
                </div>

                {/* Date fields */}
                <div
                  className={`grid grid-cols-1 gap-3 ${
                    applyType === "LEAVE" ? "sm:grid-cols-2" : ""
                  }`}
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {applyType === "LEAVE" ? "From date" : "Date"}
                    </label>
                    <input
                      type="date"
                      value={applyFromDate}
                      min={todayISTString()}
                      onChange={(e) => {
                        setApplyFromDate(e.target.value);
                        if (applyToDate && applyToDate < e.target.value) {
                          setApplyToDate("");
                        }
                      }}
                      className="block w-full h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Today or any future date.
                    </p>
                  </div>

                  {applyType === "LEAVE" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        To date <span className="text-muted-foreground">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={applyToDate}
                        min={applyFromDate}
                        onChange={(e) => setApplyToDate(e.target.value)}
                        className="block w-full h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Leave blank for single day. Max 90 days.
                      </p>
                    </div>
                  )}
                </div>

                {/* Reason — required for Leave, optional for Half Day */}
                {applyType === "LEAVE" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Reason (required)
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Family function, medical, etc."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      rows={2}
                    />
                  </div>
                )}

                {/* Submit */}
                <Button
                  disabled={submitting !== null}
                  onClick={handleApply}
                  className={`w-full h-12 text-white ${
                    applyType === "LEAVE"
                      ? "bg-sky-600 hover:bg-sky-700"
                      : "bg-amber-500 hover:bg-amber-600"
                  }`}
                >
                  {submitting === applyType ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : applyType === "LEAVE" ? (
                    <FileX className="h-5 w-5 mr-2" />
                  ) : (
                    <Clock className="h-5 w-5 mr-2" />
                  )}
                  {applyType === "LEAVE"
                    ? applyToDate && applyToDate > applyFromDate
                      ? "Apply Leave (range)"
                      : "Apply Leave"
                    : "Apply Half Day"}
                </Button>

                {applyError && (
                  <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                    {applyError}
                  </p>
                )}
                {applyInfo && !applyError && (
                  <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                    {applyInfo}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* HISTORY */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">My History</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No attendance entries yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Reason</th>
                          <th className="py-2">Marked At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row) => (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">{row.date}</td>
                            <td className="py-2 pr-4">
                              <Badge className={STATUS_TONE[row.status]}>
                                {row.status === "ABSENT"
                                  ? "Absent"
                                  : STATUS_LABEL[row.status as AttendanceStatus]}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {row.reason ?? "—"}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {row.markedAt
                                ? new Date(row.markedAt).toLocaleString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {nextCursor && (
                      <div className="flex justify-center pt-3">
                        <Button
                          variant="outline"
                          disabled={loadingMore}
                          onClick={loadMore}
                        >
                          {loadingMore ? "Loading…" : "Load more"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
