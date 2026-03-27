import { useEffect, useState } from "react";
import { AlertTriangle, Newspaper, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { newsApi, type NewsIntelligence } from "../../lib/api";

const styles: Record<string, string> = {
  CRITICAL: "bg-red-50 border-red-300",
  HIGH: "bg-amber-50 border-amber-300",
  NORMAL: "bg-white border",
};

export function NewsAlerts() {
  const [newsItems, setNewsItems] = useState<NewsIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const limit = 3;

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await newsApi.getAll({ limit: '20' });
        setNewsItems(res.data);
      } catch (error) {
        console.error('Failed to fetch news:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-indigo-900">
          News & Intelligence
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground text-center py-4">Loading...</p>
        ) : newsItems.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No news items</p>
        ) : (
          <>
            {(showAll ? newsItems : newsItems.slice(0, limit)).map((n) => {
              const Icon = n.priority === 'CRITICAL' ? AlertTriangle : Newspaper;
              return (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border ${styles[n.priority] || styles.NORMAL}`}
                >
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-lg ${n.priority === 'CRITICAL' ? 'bg-red-100' : 'bg-amber-100'}`}>
                      <Icon className={`h-4 w-4 ${n.priority === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'}`} />
                    </div>

                    <div className="flex-1">
                      <p className="font-medium">{n.headline}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.mediaSource} • {formatTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {newsItems.length > limit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? (
                  <>Show Less <ChevronUp className="ml-2 h-4 w-4" /></>
                ) : (
                  <>Show All ({newsItems.length}) <ChevronDown className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
