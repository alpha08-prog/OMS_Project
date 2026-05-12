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
    { name: "Completed", value: 0, color: "#22c55e" },
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

        // Chart denominator excludes REJECTED and any other status not in the
        // three visible buckets, so the percentages reflect 100% of what's
        // shown rather than 100% of all-time records.
        const completed = grievances.resolved;
        const inProgress = grievances.inProgress + grievances.verified;
        const open = grievances.open;
        const shownTotal = completed + inProgress + open;

        setTotal(grievances.total);

        const buckets = [
          { name: "Completed", raw: completed, color: "#22c55e" },
          { name: "In Progress", raw: inProgress, color: "#f59e0b" },
          { name: "Open", raw: open, color: "#6366f1" },
        ];

        // Largest-remainder method: floor each share, then hand the leftover
        // points to the buckets with the biggest fractional parts so the
        // displayed percentages always sum to exactly 100.
        const percentages = (() => {
          if (shownTotal === 0) return buckets.map(() => 0);
          const shares = buckets.map((b) => (b.raw / shownTotal) * 100);
          const floors = shares.map((s) => Math.floor(s));
          let remainder = 100 - floors.reduce((a, b) => a + b, 0);
          const order = shares
            .map((s, i) => ({ i, frac: s - Math.floor(s) }))
            .sort((a, b) => b.frac - a.frac);
          for (const { i } of order) {
            if (remainder <= 0) break;
            floors[i] += 1;
            remainder -= 1;
          }
          return floors;
        })();

        setData(
          buckets.map((b, i) => ({ name: b.name, value: percentages[i], color: b.color }))
        );
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
            <div className="mt-4 grid gap-2 text-center grid-cols-3">
              {data.map((item) => (
                <div key={item.name} className="p-2 rounded-lg bg-muted/50">
                  <p className="font-bold text-2xl" style={{ color: item.color }}>
                    {item.value}%
                  </p>
                  <p className="text-muted-foreground break-words text-xs">{item.name}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
