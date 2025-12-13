import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "primary" | "success" | "warning" | "destructive";
}

const variantStyles = {
  default: "bg-card",
  primary: "bg-gradient-to-br from-primary to-accent text-primary-foreground",
  success: "bg-gradient-to-br from-success to-emerald-400 text-success-foreground",
  warning: "bg-gradient-to-br from-warning to-amber-400 text-warning-foreground",
  destructive: "bg-gradient-to-br from-destructive to-rose-400 text-destructive-foreground",
};

export function StatsCard({ title, value, icon: Icon, trend, variant = "default" }: StatsCardProps) {
  const isColored = variant !== "default";

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
      variantStyles[variant]
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className={cn(
              "text-sm font-medium",
              isColored ? "opacity-90" : "text-muted-foreground"
            )}>
              {title}
            </p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && (
              <p className={cn(
                "text-sm font-medium flex items-center gap-1",
                isColored ? "opacity-90" : (trend.isPositive ? "text-success" : "text-destructive")
              )}>
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
                <span className="opacity-70">vs last week</span>
              </p>
            )}
          </div>
          <div className={cn(
            "p-3 rounded-xl",
            isColored ? "bg-white/20" : "bg-primary/10"
          )}>
            <Icon className={cn(
              "h-6 w-6",
              isColored ? "text-current" : "text-primary"
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
