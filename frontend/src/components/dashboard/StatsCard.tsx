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
  default: "bg-white border",
  primary: "bg-gradient-to-br from-indigo-600 to-indigo-500 text-white",
  success: "bg-gradient-to-br from-emerald-600 to-emerald-500 text-white",
  warning: "bg-gradient-to-br from-amber-500 to-orange-400 text-black",
  destructive: "bg-gradient-to-br from-red-600 to-red-500 text-white",
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = "default",
}: StatsCardProps) {
  const colored = variant !== "default";

  return (
    <Card
      className={cn(
        "relative overflow-visible",            // ✅ prevents clipping
        "min-h-[110px]",                        // ✅ consistent height
        "rounded-2xl transition-all",
        "hover:shadow-lg hover:-translate-y-0.5", // ✅ reduced movement
        variantStyles[variant]
      )}
    >
      <CardContent className="p-5 h-full flex items-center">
        <div className="flex w-full items-center justify-between">
          
          {/* Left */}
          <div className="space-y-1">
            <p
              className={cn(
                "text-sm font-medium leading-tight",
                colored ? "opacity-90" : "text-muted-foreground"
              )}
            >
              {title}
            </p>

            <p className="text-3xl font-bold leading-none">
              {value}
            </p>

            {trend && (
              <p
                className={cn(
                  "text-xs font-medium mt-1",
                  colored
                    ? "opacity-90"
                    : trend.isPositive
                    ? "text-emerald-600"
                    : "text-red-600"
                )}
              >
                {trend.isPositive ? "↑" : "↓"} {trend.value}% vs last week
              </p>
            )}
          </div>

          {/* Right Icon */}
          <div
            className={cn(
              "p-3 rounded-xl flex items-center justify-center",
              colored ? "bg-white/20" : "bg-indigo-100"
            )}
          >
            <Icon
              className={cn(
                "h-6 w-6",
                colored ? "text-current" : "text-indigo-600"
              )}
            />
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
