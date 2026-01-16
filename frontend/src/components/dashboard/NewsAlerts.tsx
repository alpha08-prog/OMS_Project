import { AlertTriangle, Newspaper, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

const newsItems = [
  {
    headline: "Opposition Rally Announcement",
    priority: "Critical",
    source: "Social Media",
    time: "2h ago",
  },
  {
    headline: "Development Project Approved",
    priority: "Normal",
    source: "Newspaper",
    time: "5h ago",
  },
];

const styles = {
  Critical: "bg-amber-100 border-amber-400",
  Normal: "bg-white border",
};

const icons = {
  Critical: AlertTriangle,
  Normal: Newspaper,
};

export function NewsAlerts() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-indigo-900">
          News & Intelligence
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {newsItems.map((n, i) => {
          const Icon = icons[n.priority as keyof typeof icons];
          return (
            <div
              key={i}
              className={`p-4 rounded-2xl border ${styles[n.priority as keyof typeof styles]}`}
            >
              <div className="flex gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Icon className="h-4 w-4 text-amber-600" />
                </div>

                <div className="flex-1">
                  <p className="font-medium">{n.headline}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.source} • {n.time}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
