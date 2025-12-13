import { AlertTriangle, Newspaper, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

const newsItems = [
  {
    headline: "Opposition Party Rally Announcement",
    category: "Conspiracy",
    priority: "Critical",
    source: "Social Media",
    time: "2 hours ago",
  },
  {
    headline: "New Development Project Approved",
    category: "Work",
    priority: "Normal",
    source: "Newspaper",
    time: "5 hours ago",
  },
  {
    headline: "Youth Wing Meeting Scheduled",
    category: "Party Development",
    priority: "High",
    source: "Informant",
    time: "Yesterday",
  },
];

const priorityStyles = {
  Critical: "bg-destructive text-destructive-foreground animate-pulse",
  High: "bg-warning text-warning-foreground",
  Normal: "bg-secondary text-secondary-foreground",
};

const priorityIcons = {
  Critical: AlertTriangle,
  High: TrendingUp,
  Normal: Newspaper,
};

export function NewsAlerts() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">News & Intelligence</CardTitle>
          <Badge variant="destructive" className="animate-pulse">
            1 Critical
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {newsItems.map((news, index) => {
          const Icon = priorityIcons[news.priority as keyof typeof priorityIcons];
          return (
            <div
              key={index}
              className={`p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
                news.priority === "Critical" 
                  ? "border-destructive/50 bg-destructive/5" 
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  news.priority === "Critical" 
                    ? "bg-destructive/10" 
                    : news.priority === "High"
                    ? "bg-warning/10"
                    : "bg-muted"
                }`}>
                  <Icon className={`h-4 w-4 ${
                    news.priority === "Critical"
                      ? "text-destructive"
                      : news.priority === "High"
                      ? "text-warning"
                      : "text-muted-foreground"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground mb-1">{news.headline}</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={priorityStyles[news.priority as keyof typeof priorityStyles]}>
                      {news.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {news.category} • {news.source}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {news.time}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
