import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  attendanceApi,
  type AttendanceRow,
  type AttendanceStats,
  type AttendanceAggregate,
} from "@/lib/api";

type ViewMode = "day" | "month" | "year";

const STATUS_TONE: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  HALF_DAY: "bg-amber-100 text-amber-800",
  LEAVE: "bg-sky-100 text-sky-800",
  ABSENT: "bg-rose-100 text-rose-800",
};

function todayISTString(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Last calendar day of a given (year, month). month is 1-12. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function AdminAttendance() {
  const [mode, setMode] = useState<ViewMode>("day");

  // Day mode
  const [date, setDate] = useState(todayISTString());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Month mode (YYYY-MM)
  const todayParts = todayISTString().split("-").map(Number);
  const [month, setMonth] = useState<string>(
    `${todayParts[0]}-${pad(todayParts[1])}`
  );

  // Year mode (YYYY)
  const [year, setYear] = useState<number>(todayParts[0]);

  // Aggregate (shared by month / year)
  const [aggregate, setAggregate] = useState<AttendanceAggregate | null>(null);

  const [loading, setLoading] = useState(true);

  const dayRange = useMemo(() => {
    if (mode === "day") return { startDate: date, endDate: date };
    if (mode === "month") {
      const [y, m] = month.split("-").map(Number);
      return {
        startDate: `${y}-${pad(m)}-01`,
        endDate: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`,
      };
    }
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }, [mode, date, month, year]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (mode === "day") {
          const [list, s] = await Promise.all([
            attendanceApi.getAll({ date }),
            date === todayISTString()
              ? attendanceApi.getTodayStats()
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setRows(list);
          setStats(s);
        } else {
          const agg = await attendanceApi.getAggregate(dayRange);
          if (cancelled) return;
          setAggregate(agg);
        }
      } catch (e) {
        if (!cancelled) console.error("Failed to fetch attendance", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, date, month, year, dayRange]);

  // ── Day mode derived data ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filterStatus === "ALL") return rows;
    return rows.filter((r) => r.status === filterStatus);
  }, [rows, filterStatus]);

  const dayCounts = useMemo(() => {
    let present = 0,
      halfDay = 0,
      leave = 0,
      absent = 0;
    for (const r of rows) {
      if (r.status === "PRESENT") present++;
      else if (r.status === "HALF_DAY") halfDay++;
      else if (r.status === "LEAVE") leave++;
      else if (r.status === "ABSENT") absent++;
    }
    return { present, halfDay, leave, absent };
  }, [rows]);

  const dayDisplay = stats ?? {
    date,
    totalStaff:
      dayCounts.present + dayCounts.halfDay + dayCounts.leave + dayCounts.absent,
    present: dayCounts.present,
    halfDay: dayCounts.halfDay,
    leave: dayCounts.leave,
    absent: dayCounts.absent,
  };

  // ── Aggregate (month/year) derived data ──────────────────────────────
  const aggTotals = useMemo(() => {
    if (!aggregate) return { present: 0, halfDay: 0, leave: 0, marked: 0 };
    let present = 0,
      halfDay = 0,
      leave = 0,
      marked = 0;
    for (const s of aggregate.staff) {
      present += s.present;
      halfDay += s.halfDay;
      leave += s.leave;
      marked += s.totalMarked;
    }
    return { present, halfDay, leave, marked };
  }, [aggregate]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  Staff Attendance
                </h1>
                <p className="text-sm text-muted-foreground">
                  Day view shows per-staff status with auto-absent. Month/Year
                  views show per-staff totals across the range.
                </p>
              </div>

              {/* View mode tabs */}
              <div className="inline-flex rounded-lg border border-indigo-200 bg-white p-0.5">
                {(["day", "month", "year"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={
                      "px-4 py-1.5 text-sm rounded-md transition-colors " +
                      (mode === m
                        ? "bg-indigo-600 text-white"
                        : "text-indigo-700 hover:bg-indigo-50")
                    }
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Picker for the active mode */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                {mode === "day" && (
                  <>
                    <label className="text-sm text-muted-foreground">Date</label>
                    <input
                      type="date"
                      value={date}
                      max={todayISTString()}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </>
                )}
                {mode === "month" && (
                  <>
                    <label className="text-sm text-muted-foreground">Month</label>
                    <input
                      type="month"
                      value={month}
                      max={`${todayParts[0]}-${pad(todayParts[1])}`}
                      onChange={(e) => setMonth(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </>
                )}
                {mode === "year" && (
                  <>
                    <label className="text-sm text-muted-foreground">Year</label>
                    <input
                      type="number"
                      value={year}
                      min={2024}
                      max={todayParts[0]}
                      onChange={(e) => setYear(Number(e.target.value) || todayParts[0])}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  Range: {dayRange.startDate} → {dayRange.endDate}
                </span>
              </CardContent>
            </Card>

            {/* ──────────────── DAY VIEW ──────────────── */}
            {mode === "day" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="rounded-2xl border border-emerald-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-emerald-700 tracking-wide">Present</p>
                      <p className="text-3xl font-semibold text-emerald-900">{dayDisplay.present}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-amber-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-amber-700 tracking-wide">Half Day</p>
                      <p className="text-3xl font-semibold text-amber-900">{dayDisplay.halfDay}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-sky-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-sky-700 tracking-wide">Leave</p>
                      <p className="text-3xl font-semibold text-sky-900">{dayDisplay.leave}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-rose-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-rose-700 tracking-wide">Absent</p>
                      <p className="text-3xl font-semibold text-rose-900">{dayDisplay.absent}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-2xl shadow-sm border border-indigo-100">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-lg">Staff Records — {date}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      {(["ALL", "PRESENT", "HALF_DAY", "LEAVE", "ABSENT"] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={filterStatus === s ? "default" : "outline"}
                          onClick={() => setFilterStatus(s)}
                        >
                          {s.replace("_", " ")}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No records.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b">
                              <th className="py-2 pr-4">Staff</th>
                              <th className="py-2 pr-4">Status</th>
                              <th className="py-2 pr-4">Reason</th>
                              <th className="py-2">Marked At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((row) => (
                              <tr key={row.id} className="border-b last:border-0">
                                <td className="py-2 pr-4 font-medium">{row.userName || "—"}</td>
                                <td className="py-2 pr-4">
                                  <Badge className={STATUS_TONE[row.status] ?? ""}>
                                    {row.status.replace("_", " ")}
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
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* ──────────────── MONTH / YEAR VIEW ──────────────── */}
            {mode !== "day" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="rounded-2xl border border-emerald-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-emerald-700 tracking-wide">Total Present</p>
                      <p className="text-3xl font-semibold text-emerald-900">{aggTotals.present}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-amber-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-amber-700 tracking-wide">Total Half Day</p>
                      <p className="text-3xl font-semibold text-amber-900">{aggTotals.halfDay}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-sky-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-sky-700 tracking-wide">Total Leave</p>
                      <p className="text-3xl font-semibold text-sky-900">{aggTotals.leave}</p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-indigo-200">
                    <CardContent className="p-5">
                      <p className="text-xs uppercase text-indigo-700 tracking-wide">Days Marked</p>
                      <p className="text-3xl font-semibold text-indigo-900">{aggTotals.marked}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-2xl shadow-sm border border-indigo-100">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Per-Staff Totals — {mode === "month" ? month : year}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : !aggregate || aggregate.staff.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No active staff or no data for this range.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b">
                              <th className="py-2 pr-4">Staff</th>
                              <th className="py-2 pr-4 text-right">Present</th>
                              <th className="py-2 pr-4 text-right">Half Day</th>
                              <th className="py-2 pr-4 text-right">Leave</th>
                              <th className="py-2 text-right">Days Marked</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aggregate.staff.map((s) => (
                              <tr key={s.userId} className="border-b last:border-0">
                                <td className="py-2 pr-4 font-medium">{s.userName || "—"}</td>
                                <td className="py-2 pr-4 text-right">
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">
                                    {s.present}
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800">
                                    {s.halfDay}
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800">
                                    {s.leave}
                                  </span>
                                </td>
                                <td className="py-2 text-right font-medium">
                                  {s.totalMarked}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground mt-3">
                          Absent days are not shown here because "working day"
                          depends on your office calendar (Sundays, holidays).
                          Compute as (working days in range) − (Days Marked).
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
