import { useState } from "react";
import { Search, FileText, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { grievanceApi, visitorApi, type Grievance, type Visitor } from "@/lib/api";

/**
 * Global search over grievances + visitors, rendered as a search-icon button
 * that opens a results popover. Clicking a result shows its details in a
 * dialog (no navigation) so it works for every role regardless of which
 * list/detail routes they can reach. Surfaced to ADMIN/STAFF via the sidebar;
 * SUPER_ADMIN has the equivalent inline search in DashboardHeader.
 */
export function GlobalSearch({ className = "" }: { className?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{ grievances: Grievance[]; visitors: Visitor[] }>({ grievances: [], visitors: [] });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchOpen(true);
    try {
      const [gRes, vRes] = await Promise.all([
        grievanceApi.getAll({ search: q, limit: "5" }),
        visitorApi.getAll({ search: q, limit: "5" }),
      ]);
      setSearchResults({
        grievances: Array.isArray(gRes?.data) ? gRes.data : [],
        visitors: Array.isArray(vRes?.data) ? vRes.data : [],
      });
    } catch {
      setSearchResults({ grievances: [], visitors: [] });
    } finally {
      setSearchLoading(false);
    }
  };

  const openGrievanceDetail = async (g: Grievance) => {
    setSearchOpen(false);
    setSelectedVisitor(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      setSelectedGrievance(await grievanceApi.getById(g.id));
    } catch {
      setSelectedGrievance(g);
    } finally {
      setDetailLoading(false);
    }
  };

  const openVisitorDetail = async (v: Visitor) => {
    setSearchOpen(false);
    setSelectedGrievance(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      setSelectedVisitor(await visitorApi.getById(v.id));
    } catch {
      setSelectedVisitor(v);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedGrievance(null);
    setSelectedVisitor(null);
  };

  return (
    <>
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Search grievances and visitors"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:text-indigo-700 ${className}`}
          >
            <Search className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-0">
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="Search grievances, visitors…"
              className="h-9"
            />
            <p className="text-xs text-muted-foreground px-1 pt-1">Press Enter to search</p>
          </div>
          {searchLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Searching...</div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {searchResults.grievances.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-1 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Grievances
                  </p>
                  {searchResults.grievances.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => openGrievanceDetail(g)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm"
                    >
                      <span className="font-medium">{g.petitionerName}</span>
                      <span className="text-muted-foreground ml-1">· {g.grievanceType}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.visitors.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-1 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Visitors
                  </p>
                  {searchResults.visitors.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => openVisitorDetail(v)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm"
                    >
                      <span className="font-medium">{v.name}</span>
                      <span className="text-muted-foreground ml-1">· {v.purpose}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searchLoading &&
                searchResults.grievances.length === 0 &&
                searchResults.visitors.length === 0 &&
                searchQuery.trim() && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No results</div>
                )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={detailOpen} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-lg rounded-2xl border-2 border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white">
          <DialogHeader className="pb-4 border-b border-indigo-100">
            <DialogTitle className="text-indigo-900 flex items-center gap-2">
              {selectedGrievance && <FileText className="h-5 w-5 text-indigo-600" />}
              {selectedVisitor && <Users className="h-5 w-5 text-indigo-600" />}
              {selectedGrievance ? "Grievance details" : selectedVisitor ? "Visitor details" : "Search result"}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : selectedGrievance ? (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl bg-white border border-indigo-100 p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-indigo-900 text-lg">{selectedGrievance.petitionerName}</h3>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                    {(selectedGrievance.status ?? "UNKNOWN").replace("_", " ")}
                  </span>
                </div>
                <p className="text-sm text-indigo-700 font-medium mb-2">{(selectedGrievance.grievanceType ?? "").replace("_", " ")}</p>
                <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <span>Constituency</span>
                  <span className="font-medium text-foreground">{selectedGrievance.constituency}</span>
                  <span>Mobile</span>
                  <span className="font-medium text-foreground">{selectedGrievance.mobileNumber}</span>
                  {selectedGrievance.monetaryValue != null && (
                    <>
                      <span>Amount</span>
                      <span className="font-medium text-foreground">₹{selectedGrievance.monetaryValue.toLocaleString("en-IN")}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-indigo-50">{selectedGrievance.description}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Submitted {new Date(selectedGrievance.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </p>
              </div>
            </div>
          ) : selectedVisitor ? (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl bg-white border border-indigo-100 p-4 shadow-sm">
                <h3 className="font-semibold text-indigo-900 text-lg mb-3">{selectedVisitor.name}</h3>
                <p className="text-sm text-indigo-700 font-medium mb-3">{selectedVisitor.designation}</p>
                <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <span>Purpose</span>
                  <span className="font-medium text-foreground">{selectedVisitor.purpose}</span>
                  {selectedVisitor.phone && (
                    <>
                      <span>Phone</span>
                      <span className="font-medium text-foreground">{selectedVisitor.phone}</span>
                    </>
                  )}
                  <span>Visit date</span>
                  <span className="font-medium text-foreground">{new Date(selectedVisitor.visitDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                  {selectedVisitor.referencedBy && (
                    <>
                      <span>Referenced by</span>
                      <span className="font-medium text-foreground">{selectedVisitor.referencedBy}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-indigo-50">
                  Recorded {new Date(selectedVisitor.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
