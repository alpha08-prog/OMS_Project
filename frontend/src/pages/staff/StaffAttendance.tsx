import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FileX, Loader2 } from "lucide-react";
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

export default function StaffAttendance() {
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<AttendanceStatus | null>(null);
  const [reason, setReason] = useState("");
  const [leaveDate, setLeaveDate] = useState<string>(todayISTString());
  const [error, setError] = useState<string | null>(null);

  /** Initial / forced refresh — replaces the history list. */
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

  /** Append the next page; called by the "Load more" button. */
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

  const handleMark = async (status: AttendanceStatus) => {
    setError(null);
    if (status === "LEAVE" && !reason.trim()) {
      setError("Please provide a reason for leave.");
      return;
    }
    if (status === "LEAVE" && leaveDate < todayISTString()) {
      setError("Leave cannot be marked for a past date.");
      return;
    }
    setSubmitting(status);
    try {
      const next = await attendanceApi.mark(
        status,
        status === "LEAVE" ? reason.trim() : undefined,
        status === "LEAVE" ? leaveDate : undefined
      );
      // If we just marked today, update the today card. Future leaves only
      // refresh the history list.
      if (status !== "LEAVE" || leaveDate === todayISTString()) {
        setToday(next);
      }
      // Re-fetch first page so the new mark appears at the top.
      const page = await attendanceApi.getMyHistory({ limit: 50 });
      setHistory(page.rows);
      setNextCursor(page.nextCursor);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to mark attendance.";
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const todayIST = todayISTString();

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
                Mark your attendance for today and view your history.
              </p>
            </div>

            {/* TODAY'S MARK */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">Today — {todayIST}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : today ? (
                  <div className="flex items-center gap-3">
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
                    Not marked yet. Choose one below.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button
                    disabled={submitting !== null}
                    onClick={() => handleMark("PRESENT")}
                    className="h-20 flex flex-col gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {submitting === "PRESENT" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    <span>Mark Present</span>
                  </Button>
                  <Button
                    disabled={submitting !== null}
                    onClick={() => handleMark("HALF_DAY")}
                    className="h-20 flex flex-col gap-1 bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    {submitting === "HALF_DAY" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Clock className="h-5 w-5" />
                    )}
                    <span>Half Day</span>
                  </Button>
                  <Button
                    disabled={submitting !== null}
                    onClick={() => handleMark("LEAVE")}
                    className="h-20 flex flex-col gap-1 bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {submitting === "LEAVE" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <FileX className="h-5 w-5" />
                    )}
                    <span>Leave</span>
                  </Button>
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
                  <p className="text-sm font-medium text-sky-900">
                    Leave details (only used when marking Leave)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Leave date
                      </label>
                      <input
                        type="date"
                        value={leaveDate}
                        min={todayISTString()}
                        onChange={(e) => setLeaveDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Today or any future date.
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Reason (required for Leave)
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Family function, medical, etc."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                    {error}
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
