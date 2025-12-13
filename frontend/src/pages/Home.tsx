import { DashboardHeader } from "../components/layout/DashboardHeader";
import { DashboardSidebar } from "../components/layout/DashboardSidebar";
import { StatsCard } from "../components/dashboard/StatsCard";
import { QuickActions } from "../components/dashboard/QuickActions";
import { TodaySchedule } from "../components/dashboard/TodaySchedule";
import { RecentGrievances } from "../components/dashboard/RecentGrievances";
import { NewsAlerts } from "../components/dashboard/NewsAlerts";
import { BirthdayWidget } from "../components/dashboard/BirthdayWidget";
import { GrievanceChart } from "../components/dashboard/GrievanceChart";
import { 
  FileText, 
  Users, 
  CheckCircle2, 
  AlertTriangle 
} from "lucide-react";

const Home = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Grievances"
                value="1,284"
                icon={FileText}
                trend={{ value: 12, isPositive: true }}
                variant="primary"
              />
              <StatsCard
                title="Today's Visitors"
                value="48"
                icon={Users}
                trend={{ value: 8, isPositive: true }}
              />
              <StatsCard
                title="Resolved This Week"
                value="156"
                icon={CheckCircle2}
                trend={{ value: 23, isPositive: true }}
                variant="success"
              />
              <StatsCard
                title="Critical Alerts"
                value="3"
                icon={AlertTriangle}
                variant="destructive"
              />
            </div>

            {/* Quick Actions */}
            <QuickActions />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Schedule */}
              <div className="lg:col-span-2 space-y-6">
                <TodaySchedule />
                <RecentGrievances />
              </div>

              {/* Right Column - Widgets */}
              <div className="space-y-6">
                <NewsAlerts />
                <BirthdayWidget />
                <GrievanceChart />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Home;
