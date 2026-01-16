import {
  FileText,
  Train,
  Calendar,
  Camera,
  Bell,
  Users,
  Newspaper,
  Gift,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";

/* --------------------------------------------------
   Action definitions (icon + color + route)
-------------------------------------------------- */
const actions = [
  {
    icon: FileText,
    label: "New Grievance",
    color: "bg-amber-500 text-black hover:bg-amber-600",
    route: "/grievances/new",
  },
  {
    icon: Train,
    label: "Train EQ Letter",
    color: "bg-indigo-600 hover:bg-indigo-700 text-white",
    route: "/train-eq",
  },
  {
    icon: Calendar,
    label: "Tour Program",
    color: "bg-sky-600 hover:bg-sky-700 text-white",
    route: "/tour-program",
  },
  {
    icon: Camera,
    label: "Photo Booth",
    color: "bg-violet-600 hover:bg-violet-700 text-white",
    route: "/photo-booth",
  },
  {
    icon: Newspaper,
    label: "Add News",
    color: "bg-teal-600 hover:bg-teal-700 text-white",
    route: "/news/add",
  },
  {
    icon: Users,
    label: "Log Visitor",
    color: "bg-slate-700 hover:bg-slate-800 text-white",
    route: "/visitors/new",
  },
  {
    icon: Gift,
    label: "Birthdays",
    color: "bg-rose-500 hover:bg-rose-600 text-white",
    route: "/birthdays",
  },
  {
    icon: Bell,
    label: "Alerts",
    color: "bg-red-600 hover:bg-red-700 text-white",
    route: "/alerts",
  },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-indigo-900">
          Quick Actions
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {actions.map((action) => (
            <Button
              key={action.label}
              onClick={() => navigate(action.route)}
              className={`
                h-auto py-4 rounded-2xl
                flex flex-col gap-2
                transition-all
                hover:scale-[1.03] hover:shadow-md
                ${action.color}
              `}
            >
              <action.icon className="h-5 w-5 opacity-90" />
              <span className="text-xs font-medium">
                {action.label}
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
