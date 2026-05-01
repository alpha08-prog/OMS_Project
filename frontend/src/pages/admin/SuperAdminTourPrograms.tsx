import { useEffect, useState } from "react";
import {
  Calendar,
  RefreshCw,
  Eye,
  MapPin,
  Phone,
  Mail,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { tourProgramApi, type TourProgram } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Super Admin — Tour Program list.
 *
 * Shows every tour invitation the admin has ACCEPTED. Read-only: no
 * verify/assign, no edit, no delete. Click View on a row to see the
 * full event detail in a side dialog.
 */
/** Inner content (no sidebar wrapper). Reused by the standalone page
 *  and by the dashboard popup on the SUPER_ADMIN home screen. */
export function SuperAdminTourProgramsContent() {
  const [programs, setPrograms] = useState<TourProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TourProgram | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchPrograms = async () => {
    setLoading(true);
    setError(null);
    try {
      // Match the admin-page latency pattern: limit=50 + push date filters
      // to the server so the backend hits indexed columns rather than
      // scanning the full table client-side.
      const params: Record<string, string> = { limit: '50' };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await tourProgramApi.getAll(params);
      const all = Array.isArray(res?.data) ? res.data : [];
      const decided = all
        .filter((p) => {
          const d = String(p.decision);
          return d === 'ACCEPTED' || d === 'REGRET';
        })
        // Sort latest-first by event dateTime so newest programs appear first.
        .sort((a, b) => {
          const ta = a.dateTime ? new Date(a.dateTime).getTime() : 0;
          const tb = b.dateTime ? new Date(b.dateTime).getTime() : 0;
          return tb - ta;
        });
      setPrograms(decided);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tour programs');
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Refetch when date filters change so server-side params take effect.
    fetchPrograms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // Date range is applied server-side now; no client filter needed.
  const pager = usePagination(programs, 10);

  const formatDateTime = (s?: string | null) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">Tour Program</h1>
                <p className="text-sm text-muted-foreground">
                  Tour invitations decided by admin (accepted + regret)
                </p>
              </div>
              <Button variant="outline" onClick={fetchPrograms} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  fromLabel="Event from"
                  toLabel="Event to"
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Tour Programs ({filtered.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading…</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-muted-foreground">No decided tour programs yet</p>
                  </div>
                ) : (
                  pager.pageItems.map((p) => {
                    const isAccepted = String(p.decision) === 'ACCEPTED';
                    const isExpanded = expandedIds.has(p.id);
                    return (
                    <div
                      key={p.id}
                      className="p-4 rounded-xl border bg-white hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(p.id)}
                          aria-label={isExpanded ? 'Collapse tour' : 'Expand tour'}
                          className="mt-0.5 p-0.5 rounded hover:bg-indigo-50 text-indigo-700 shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        <div className={`p-2 rounded-lg flex-shrink-0 ${isAccepted ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          <Calendar className={`h-5 w-5 ${isAccepted ? 'text-emerald-700' : 'text-red-700'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-indigo-900 truncate">{p.eventName}</p>
                            {isAccepted ? (
                              <Badge className="bg-emerald-100 text-emerald-800">Accepted</Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800">Regret</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(p.dateTime)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(p);
                          setDetailsOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t pl-9 space-y-1">
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {p.venue || '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Organizer: {p.organizer || '—'}
                          </p>
                          {p.description && (
                            <p className="text-sm mt-2">{p.description}</p>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })
                )}
                <Pagination
                  page={pager.page}
                  totalPages={pager.totalPages}
                  total={pager.total}
                  rangeStart={pager.rangeStart}
                  rangeEnd={pager.rangeEnd}
                  onChange={pager.setPage}
                />
              </CardContent>
            </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tour Program Details
            </DialogTitle>
          </DialogHeader>
            {selected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800">Accepted</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Event Name" value={selected.eventName} />
                  <Field label="Date & Time" value={formatDateTime(selected.dateTime)} />
                  <Field label="Venue" value={selected.venue} />
                  <Field label="Organizer" value={selected.organizer} />
                  <Field label="Organizer phone" value={selected.organizerPhone} icon={<Phone className="h-3 w-3" />} />
                  <Field label="Organizer email" value={selected.organizerEmail} icon={<Mail className="h-3 w-3" />} />
                  <Field label="Referenced by" value={selected.referencedBy} />
                </div>
                {selected.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="mt-1 p-3 rounded bg-slate-50 text-sm whitespace-pre-wrap">{selected.description}</p>
                  </div>
                )}
                {selected.decisionNote && (
                  <div>
                    <p className="text-xs text-muted-foreground">Decision note</p>
                    <p className="mt-1 p-3 rounded bg-emerald-50 text-sm whitespace-pre-wrap">{selected.decisionNote}</p>
                  </div>
                )}
              </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Standalone page (route /super-admin/tour-program). */
export default function SuperAdminTourPrograms() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <SuperAdminTourProgramsContent />
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="font-medium text-sm mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}
