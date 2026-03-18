import { useEffect, useState } from "react";
import { DashboardHeader } from "../components/layout/DashboardHeader";
import { StatsCard } from "../components/dashboard/StatsCard";
import { TodaySchedule } from "../components/dashboard/TodaySchedule";
import { RecentGrievances } from "../components/dashboard/RecentGrievances";
import { NewsAlerts } from "../components/dashboard/NewsAlerts";
import { BirthdayWidget } from "../components/dashboard/BirthdayWidget";
import { GrievanceChart } from "../components/dashboard/GrievanceChart";
import { FileText, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { statsApi, type DashboardStats } from "../lib/api";

const Home = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setUserName] = useState("User");

  useEffect(() => {
    // Get user name
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || "User");
      } catch {
        // ignore
      }
    }

    // Fetch dashboard stats from API (database-backed: /api/stats/summary)
    const fetchStats = async () => {
      try {
        const data = await statsApi.getSummary();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-amber-50">
      <div className="flex-1 flex flex-col">
        <DashboardHeader />

        <main className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-2xl p-6 text-white">
            <h1 className="text-2xl font-bold">Welcome, Shri Prahlad Joshi</h1>
            <p className="text-indigo-100">Super Admin Dashboard - Overview of all operations</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard 
              title="Total Grievances" 
              value={loading ? "..." : stats?.grievances.total || 0} 
              icon={FileText} 
              variant="primary" 
            />
            <StatsCard 
              title="Today's Visitors" 
              value={loading ? "..." : stats?.visitors.today || 0} 
              icon={Users} 
            />
            <StatsCard 
              title="Resolved" 
              value={loading ? "..." : stats?.grievances.resolved || 0} 
              icon={CheckCircle2} 
              variant="success" 
            />
            <StatsCard 
              title="Critical Alerts" 
              value={loading ? "..." : stats?.news.critical || 0} 
              icon={AlertTriangle} 
              variant="warning" 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <TodaySchedule />
              <RecentGrievances />
            </div>

            <div className="space-y-6">
              <NewsAlerts />
              <BirthdayWidget />
              <GrievanceChart />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Home;
