import { FileText, Train, Calendar, Camera, Bell, Users, Newspaper, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

const actions = [
  { icon: FileText, label: "New Grievance", color: "bg-primary hover:bg-primary/90" },
  { icon: Train, label: "Train EQ Letter", color: "bg-accent hover:bg-accent/90" },
  { icon: Calendar, label: "Tour Program", color: "bg-info hover:bg-info/90" },
  { icon: Camera, label: "Photo Booth", color: "bg-success hover:bg-success/90" },
  { icon: Newspaper, label: "Add News", color: "bg-warning hover:bg-warning/90" },
  { icon: Users, label: "Log Visitor", color: "bg-rose-500 hover:bg-rose-600" },
  { icon: Gift, label: "Birthdays", color: "bg-pink-500 hover:bg-pink-600" },
  { icon: Bell, label: "Alerts", color: "bg-slate-600 hover:bg-slate-700" },
];

export function QuickActions() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="default"
              className={`${action.color} text-white h-auto py-4 flex flex-col gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md`}
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
