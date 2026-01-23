import { useEffect, useState } from "react";
import { 
  Newspaper, 
  AlertTriangle, 
  RefreshCw, 
  Filter,
  Eye,
  Trash2,
  ExternalLink,
  MapPin,
  User,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { newsApi, type NewsIntelligence, type NewsPriority } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewsIntelligenceView() {
  const [news, setNews] = useState<NewsIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsIntelligence | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterPriority !== "all") {
        params.priority = filterPriority;
      }
      const res = await newsApi.getAll(params);
      console.log('NewsIntelligenceView - News response:', res);
      const newsArray = Array.isArray(res?.data) ? res.data : [];
      console.log('NewsIntelligenceView - News array:', newsArray);
      setNews(newsArray);
    } catch (err: any) {
      console.error('Failed to fetch news:', err);
      console.error('Error details:', err?.response?.data || err?.message);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to load news");
      setNews([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [filterPriority]);

  const handleViewDetails = (item: NewsIntelligence) => {
    setSelectedNews(item);
    setDetailsOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this news item?")) return;
    
    try {
      await newsApi.delete(id);
      setNews(prev => prev.filter(n => n.id !== id));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || "Failed to delete news");
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCategory = (category: string) => {
    const categoryMap: Record<string, string> = {
      'DEVELOPMENT_WORK': 'Development Work',
      'CONSPIRACY_FAKE_NEWS': 'Conspiracy / Fake News',
      'LEADER_ACTIVITY': 'Leader Activity',
      'PARTY_ACTIVITY': 'Party Activity',
      'OPPOSITION': 'Opposition Activity',
      'OTHER': 'Other',
    };
    return categoryMap[category] || category;
  };

  const getPriorityBadge = (priority: NewsPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return <Badge className="bg-red-100 text-red-800 border-red-300">🚨 Critical</Badge>;
      case 'HIGH':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">⚠️ High</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Normal</Badge>;
    }
  };

  const getCardStyle = (priority: NewsPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'border-l-4 border-l-red-500 bg-red-50/50';
      case 'HIGH':
        return 'border-l-4 border-l-amber-500 bg-amber-50/50';
      default:
        return 'border-l-4 border-l-gray-300';
    }
  };

  const criticalCount = news.filter(n => n.priority === 'CRITICAL').length;
  const highCount = news.filter(n => n.priority === 'HIGH').length;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 p-6 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                News & Intelligence
              </h1>
              <p className="text-sm text-muted-foreground">
                View all intelligence entries submitted by staff
              </p>
            </div>
            <Button variant="outline" onClick={fetchNews} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-xl bg-red-50 border-red-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-900">{criticalCount}</p>
                  <p className="text-sm text-red-700">Critical Alerts</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="rounded-xl bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-900">{highCount}</p>
                  <p className="text-sm text-amber-700">High Priority</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="rounded-xl bg-indigo-50 border-indigo-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Newspaper className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-900">{news.length}</p>
                  <p className="text-sm text-indigo-700">Total Entries</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              ❌ {error}
            </div>
          )}

          {/* Filters */}
          <Card className="rounded-2xl border border-indigo-100">
            <CardContent className="flex items-center gap-4 py-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filter by priority:</span>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="CRITICAL">🚨 Critical</SelectItem>
                  <SelectItem value="HIGH">⚠️ High</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* News List */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Intelligence Feed ({news.length})</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading news...</p>
              ) : news.length === 0 ? (
                <div className="text-center py-8">
                  <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-muted-foreground">No news entries found</p>
                </div>
              ) : (
                news.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border bg-white ${getCardStyle(item.priority)} hover:shadow-md transition`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-4 flex-1">
                        <div className={`p-2 rounded-lg ${
                          item.priority === 'CRITICAL' ? 'bg-red-100' : 
                          item.priority === 'HIGH' ? 'bg-amber-100' : 'bg-gray-100'
                        }`}>
                          {item.priority === 'CRITICAL' ? (
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                          ) : (
                            <Newspaper className={`h-5 w-5 ${
                              item.priority === 'HIGH' ? 'text-amber-600' : 'text-gray-600'
                            }`} />
                          )}
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-indigo-900">{item.headline}</p>
                            {getPriorityBadge(item.priority)}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Newspaper className="h-3.5 w-3.5" />
                              {formatCategory(item.category)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {item.region}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(item.createdAt)}
                            </span>
                          </div>
                          
                          <p className="text-sm text-muted-foreground">
                            Source: {item.mediaSource}
                          </p>
                          
                          {item.description && (
                            <p className="text-sm line-clamp-2">{item.description}</p>
                          )}
                          
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Reported by: {item.createdBy?.name || 'Unknown'}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleViewDetails(item)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Newspaper className="h-5 w-5" />
                Intelligence Details
              </DialogTitle>
              <DialogDescription>
                Full details of the news/intelligence entry
              </DialogDescription>
            </DialogHeader>
            
            {selectedNews && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getPriorityBadge(selectedNews.priority)}
                  <Badge variant="outline">{formatCategory(selectedNews.category)}</Badge>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">{selectedNews.headline}</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Region</p>
                    <p className="font-medium">{selectedNews.region}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Media Source</p>
                    <p className="font-medium">{selectedNews.mediaSource}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reported By</p>
                    <p className="font-medium">{selectedNews.createdBy?.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">
                      {new Date(selectedNews.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {selectedNews.referencedBy && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Referenced By</p>
                      <p className="font-medium">{selectedNews.referencedBy}</p>
                    </div>
                  )}
                </div>
                
                {selectedNews.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {selectedNews.description}
                    </p>
                  </div>
                )}
                
                {selectedNews.imageUrl && (
                  <div>
                    <p className="text-sm text-muted-foreground">Evidence Image</p>
                    <a 
                      href={selectedNews.imageUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-indigo-600 hover:underline mt-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Image
                    </a>
                  </div>
                )}
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
