import { useEffect, useState } from "react";
import { DashboardHeader } from "../components/layout/DashboardHeader";
import { TodaySchedule } from "../components/dashboard/TodaySchedule";
import { RecentGrievances } from "../components/dashboard/RecentGrievances";
import { NewsAlerts } from "../components/dashboard/NewsAlerts";
import { BirthdayWidget } from "../components/dashboard/BirthdayWidget";
import { GrievanceChart } from "../components/dashboard/GrievanceChart";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { statsApi, type DashboardStats } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";

type StatItem = {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  trend?: string;
};

const Home = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await statsApi.getSummary();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statItems: StatItem[] = [
    {
      label: "Total Grievances",
      value: loading ? "—" : stats?.grievances.total ?? 0,
      sub: `${loading ? "—" : stats?.grievances.open ?? 0} pending`,
      icon: FileText,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      trend: "open",
    },
    {
      label: "Resolved",
      value: loading ? "—" : stats?.grievances.resolved ?? 0,
      sub: "grievances closed",
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Critical Alerts",
      value: loading ? "—" : stats?.news.critical ?? 0,
      sub: "news items flagged",
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Tour Programs",
      value: loading ? "—" : stats?.tourPrograms.total ?? 0,
      sub: `${loading ? "—" : stats?.tourPrograms.pending ?? 0} pending`,
      icon: CalendarDays,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
  ];

  const now = new Date();
  const timeOfDay =
    now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-amber-50/30">
      <DashboardHeader />

      <main className="px-6 py-6 space-y-8 max-w-7xl mx-auto w-full">

        {/* ── Hero Banner ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-500 text-white shadow-xl">
          {/* decorative circles */}
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
          <div className="absolute right-24 -bottom-12 h-40 w-40 rounded-full bg-amber-400/10" />

          <div className="relative px-8 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-indigo-200 text-sm font-medium mb-1">Good {timeOfDay}</p>
              <h1 className="text-3xl font-bold tracking-tight">Shri Pralhad Joshi</h1>
              <p className="text-indigo-200 mt-1 text-sm">Super Administrator · Office Management System</p>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-2xl font-semibold text-white leading-none">
                  {loading ? "—" : stats?.grievances.inProgress ?? 0}
                </p>
                <p className="text-xs text-indigo-200 mt-2">In Progress</p>
              </div>
              <div className="w-px h-10 bg-white/20" />
              <div className="text-center">
                <p className="text-2xl font-semibold text-white leading-none">
                  {loading ? "—" : (stats?.tourPrograms.pending ?? 0) + (stats?.trainRequests.pending ?? 0)}
                </p>
                <p className="text-xs text-indigo-200 mt-2">Pending Actions</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats Grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statItems.map((s) => (
            <Card
              key={s.label}
              className="rounded-2xl border-0 shadow-sm hover:shadow-md transition-shadow"
            >
              <CardContent className="p-5 space-y-4">
                <div className={`inline-flex p-2.5 rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-foreground leading-none">{s.value}</p>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  {s.sub && (
                    <p className="text-xs text-muted-foreground">{s.sub}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Main Content Grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column – schedule + grievances */}
          <div className="lg:col-span-2 space-y-6">
            <TodaySchedule />
            <RecentGrievances />
          </div>

          {/* Right column – widgets */}
          <div className="space-y-6">
            <GrievanceChart />
            <BirthdayWidget />
            <NewsAlerts />
          </div>

        </div>
      </main>
    </div>
  );
};

export default Home;
