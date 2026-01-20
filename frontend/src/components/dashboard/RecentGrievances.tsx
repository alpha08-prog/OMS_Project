import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ArrowRight, FileText } from "lucide-react";
import { grievanceApi, type Grievance } from "../../lib/api";

const statusStyles: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-gray-100 text-gray-700",
};

export function RecentGrievances() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGrievances = async () => {
      try {
        const res = await grievanceApi.getAll({ limit: '5' });
        setGrievances(res.data);
      } catch (error) {
        console.error('Failed to fetch grievances:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGrievances();
  }, []);

  const formatCurrency = (value?: number) => {
    if (!value) return "";
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return date.toLocaleDateString();
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row justify-between items-center">
        <CardTitle className="text-lg font-semibold text-indigo-900">
          Recent Grievances
        </CardTitle>
        <Button variant="ghost" size="sm">
          View All <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground text-center py-4">Loading...</p>
        ) : grievances.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No grievances found</p>
        ) : (
          grievances.map((g) => (
            <div
              key={g.id}
              className="flex gap-4 p-4 bg-white border rounded-2xl hover:shadow-md transition"
            >
              <div className="p-3 bg-indigo-100 rounded-xl">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{g.petitionerName}</span>
                  <Badge className={statusStyles[g.status] || "bg-gray-100"}>
                    {g.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {g.grievanceType.replace('_', ' ')} • {g.constituency}
                  {g.monetaryValue && ` • ${formatCurrency(g.monetaryValue)}`}
                </p>
              </div>

              <span className="text-xs text-muted-foreground">{formatDate(g.createdAt)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
