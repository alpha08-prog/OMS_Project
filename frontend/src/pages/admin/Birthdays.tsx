import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { birthdayApi, type Birthday } from "@/lib/api";
import { RefreshCw, Cake, Gift, Calendar, Phone, User, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function Birthdays() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [todayBirthdays, setTodayBirthdays] = useState<Birthday[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState<Birthday | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBirthdays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '500' };
      if (filterMonth && filterMonth !== "all") {
        params.month = filterMonth;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      
      const [allRes, todayRes, upcomingRes] = await Promise.all([
        birthdayApi.getAll(params),
        birthdayApi.getTodayBirthdays(),
        birthdayApi.getUpcoming(),
      ]);
      
      // Handle response structure
      let birthdaysArray: Birthday[] = [];
      if (allRes) {
        if (Array.isArray(allRes)) {
          birthdaysArray = allRes;
        } else if (allRes.data && Array.isArray(allRes.data)) {
          birthdaysArray = allRes.data;
        }
      }
      setBirthdays(birthdaysArray);
      setTodayBirthdays(Array.isArray(todayRes) ? todayRes : []);
      setUpcomingBirthdays(Array.isArray(upcomingRes) ? upcomingRes : []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load birthdays";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, searchQuery]);

  useEffect(() => {
    fetchBirthdays();
  }, [fetchBirthdays]);

  const handleSearch = () => {
    fetchBirthdays();
  };

  const handleDelete = async () => {
    if (!selectedBirthday) return;
    
    setDeleting(true);
    try {
      await birthdayApi.delete(selectedBirthday.id);
      setDeleteDialogOpen(false);
      setSelectedBirthday(null);
      fetchBirthdays();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete birthday";
      setError(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isTodayBirthday = (dob: string) => {
    const date = new Date(dob);
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
  };

  const getRelationBadgeColor = (relation: string) => {
    switch (relation) {
      case 'VIP': return 'bg-purple-100 text-purple-800';
      case 'Family': return 'bg-pink-100 text-pink-800';
      case 'Official': return 'bg-blue-100 text-blue-800';
      case 'Party Worker': return 'bg-orange-100 text-orange-800';
      case 'Media': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-pink-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-pink-900 flex items-center gap-2">
                  <Cake className="h-6 w-6" />
                  Birthdays
                </h1>
                <p className="text-sm text-muted-foreground">
                  Birthday reminders added by staff
                </p>
              </div>
              <Button variant="outline" onClick={fetchBirthdays} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Today's Birthdays Banner */}
            {todayBirthdays.length > 0 && (
              <Card className="rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl">
                      <Gift className="h-8 w-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Today's Birthdays! 🎉</h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {todayBirthdays.map((b) => (
                          <Badge key={b.id} className="bg-white/20 text-white text-sm px-3 py-1">
                            {b.name} {b.phone && `• ${b.phone}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="rounded-xl bg-pink-50 border-pink-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-pink-100 rounded-lg">
                    <Cake className="h-6 w-6 text-pink-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-pink-900">{birthdays.length}</p>
                    <p className="text-sm text-pink-700">Total Birthdays</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-rose-50 border-rose-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-rose-100 rounded-lg">
                    <Gift className="h-6 w-6 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-rose-900">{todayBirthdays.length}</p>
                    <p className="text-sm text-rose-700">Today</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl bg-amber-50 border-amber-200">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-lg">
                    <Calendar className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-900">{upcomingBirthdays.length}</p>
                    <p className="text-sm text-amber-700">Upcoming (7 days)</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Filters */}
            <Card className="rounded-2xl border border-pink-100">
              <CardContent className="flex flex-wrap gap-4 py-4">
                <div className="flex gap-2 flex-1 max-w-sm">
                  <Input
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button variant="outline" onClick={handleSearch}>
                    Search
                  </Button>
                </div>
                
                <div className="w-[200px]">
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    <SelectItem value="1">January</SelectItem>
                    <SelectItem value="2">February</SelectItem>
                    <SelectItem value="3">March</SelectItem>
                    <SelectItem value="4">April</SelectItem>
                    <SelectItem value="5">May</SelectItem>
                    <SelectItem value="6">June</SelectItem>
                    <SelectItem value="7">July</SelectItem>
                    <SelectItem value="8">August</SelectItem>
                    <SelectItem value="9">September</SelectItem>
                    <SelectItem value="10">October</SelectItem>
                    <SelectItem value="11">November</SelectItem>
                    <SelectItem value="12">December</SelectItem>
                  </SelectContent>
                </Select>
                </div>

                {(filterMonth !== "all" || searchQuery) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => { setFilterMonth("all"); setSearchQuery(""); }}
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Birthdays */}
            {upcomingBirthdays.length > 0 && (
              <Card className="rounded-2xl shadow-sm border border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
                    <Calendar className="h-5 w-5" />
                    Upcoming Birthdays (Next 7 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {upcomingBirthdays.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-3 rounded-xl border bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <User className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium">{b.name}</p>
                          {b.phone && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {b.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getRelationBadgeColor(b.relation)}>{b.relation}</Badge>
                        <Badge variant="outline">🎂 {formatDate(b.dob)}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Birthday List */}
            <Card className="rounded-2xl shadow-sm border border-pink-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  All Birthdays ({birthdays.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading birthdays...</p>
                ) : birthdays.length === 0 ? (
                  <div className="text-center py-8">
                    <Cake className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No birthdays found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Staff can add birthdays from their dashboard
                    </p>
                  </div>
                ) : (
                  birthdays.map((b) => (
                    <div
                      key={b.id}
                      className={`flex items-center justify-between p-4 rounded-xl border bg-white hover:bg-pink-50/40 transition ${
                        isTodayBirthday(b.dob) ? 'border-pink-400 bg-pink-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${isTodayBirthday(b.dob) ? 'bg-pink-200' : 'bg-pink-100'}`}>
                          <User className="h-5 w-5 text-pink-600" />
                        </div>
                        <div>
                          <p className="font-medium text-pink-900 flex items-center gap-2">
                            {b.name}
                            {isTodayBirthday(b.dob) && (
                              <span className="text-lg">🎉</span>
                            )}
                          </p>
                          {b.phone && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {b.phone}
                            </p>
                          )}
                          {b.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{b.notes}</p>
                          )}
                          {b.createdBy && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Added by: {b.createdBy.name}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge className={getRelationBadgeColor(b.relation)}>{b.relation}</Badge>
                        <Badge variant="outline">
                          🎂 {formatFullDate(b.dob)}
                        </Badge>
                        {isTodayBirthday(b.dob) && (
                          <Badge className="bg-pink-500 text-white">
                            Today!
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSelectedBirthday(b);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Birthday Entry</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the birthday entry for "{selectedBirthday?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
