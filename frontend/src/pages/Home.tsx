import { DashboardHeader } from "../components/layout/DashboardHeader";
import { DashboardSidebar } from "../components/layout/DashboardSidebar";
import { StatsCard } from "../components/dashboard/StatsCard";
import { QuickActions } from "../components/dashboard/QuickActions";
import { TodaySchedule } from "../components/dashboard/TodaySchedule";
import { RecentGrievances } from "../components/dashboard/RecentGrievances";
import { NewsAlerts } from "../components/dashboard/NewsAlerts";
import { BirthdayWidget } from "../components/dashboard/BirthdayWidget";
import { GrievanceChart } from "../components/dashboard/GrievanceChart";
import { FileText, Users, CheckCircle2, AlertTriangle } from "lucide-react";

const Home = () => {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-amber-50">
      <DashboardSidebar />

      <div className="flex-1 flex flex-col">
        <DashboardHeader />

        <main className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Total Grievances" value="1,284" icon={FileText} variant="primary" />
            <StatsCard title="Today's Visitors" value="48" icon={Users} />
            <StatsCard title="Resolved This Week" value="156" icon={CheckCircle2} variant="success" />
            <StatsCard title="Critical Alerts" value="3" icon={AlertTriangle} variant="warning" />
          </div>

          <QuickActions />

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
