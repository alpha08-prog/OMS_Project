import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { statsApi } from "../../lib/api";

type ChartData = {
  name: string;
  value: number;
  color: string;
};

export function GrievanceChart() {
  const [data, setData] = useState<ChartData[]>([
    { name: "Resolved", value: 0, color: "#22c55e" },
    { name: "In Progress", value: 0, color: "#f59e0b" },
    { name: "Open", value: 0, color: "#6366f1" },
  ]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await statsApi.getSummary();
        const grievances = stats.grievances;
        const totalCount = grievances.total || 1; // Avoid division by zero
        
        setTotal(grievances.total);
        setData([
          { name: "Resolved", value: Math.round((grievances.resolved / totalCount) * 100), color: "#22c55e" },
          { name: "In Progress", value: Math.round(((grievances.inProgress + grievances.verified) / totalCount) * 100), color: "#f59e0b" },
          { name: "Open", value: Math.round((grievances.open / totalCount) * 100), color: "#6366f1" },
        ]);
      } catch (error) {
        console.error('Failed to fetch grievance stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const stops = data
    .reduce((result, d, index) => {
      const acc = data.slice(0, index).reduce((s, item) => s + item.value, 0);
      const start = (acc / 100) * 360;
      const end = ((acc + d.value) / 100) * 360;
      result.push(`${d.color} ${start}deg ${end}deg`);
      return result;
    }, [] as string[])
    .join(", ");

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Grievance Status</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <>
            <div className="h-[220px] flex items-center justify-center">
              <div className="relative">
                <div
                  className="h-40 w-40 rounded-full"
                  style={{ background: total > 0 ? `conic-gradient(${stops})` : '#e5e7eb' }}
                />
                <div className="absolute inset-4 rounded-full bg-card" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">{total}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {data.map((item) => (
                <div key={item.name} className="p-2 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold" style={{ color: item.color }}>
                    {item.value}%
                  </p>
                  <p className="text-xs text-muted-foreground">{item.name}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
