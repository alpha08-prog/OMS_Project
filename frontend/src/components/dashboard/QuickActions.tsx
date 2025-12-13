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

const actions = [
  { icon: FileText, label: "New Grievance", color: "bg-amber-500 text-black hover:bg-amber-600" },
  { icon: Train, label: "Train EQ Letter", color: "bg-indigo-600 hover:bg-indigo-700" },
  { icon: Calendar, label: "Tour Program", color: "bg-indigo-600 hover:bg-indigo-700" },
  { icon: Camera, label: "Photo Booth", color: "bg-indigo-600 hover:bg-indigo-700" },
  { icon: Newspaper, label: "Add News", color: "bg-amber-500 text-black hover:bg-amber-600" },
  { icon: Users, label: "Log Visitor", color: "bg-slate-700 hover:bg-slate-800" },
  { icon: Gift, label: "Birthdays", color: "bg-pink-500 hover:bg-pink-600" },
  { icon: Bell, label: "Alerts", color: "bg-red-600 hover:bg-red-700" },
];

export function QuickActions() {
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
              className={`h-auto py-4 rounded-2xl flex flex-col gap-2 text-white transition-all hover:scale-105 ${action.color}`}
            >
              <action.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
