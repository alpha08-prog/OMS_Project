import { useEffect, useState } from "react";
import { Briefcase, Loader2, UserPlus, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { taskApi, type TaskAssignment } from "@/lib/api";

type Staff = { id: string; name: string; email: string };

export default function AdminOfficeTasks() {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>({}); // taskId -> staffId
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [resp, staffList] = await Promise.all([
        taskApi.getAll({ status: "UNASSIGNED" }),
        taskApi.getStaff(),
      ]);
      const office = (resp.data ?? []).filter(
        (t) => (t.source ?? "PUBLIC") === "OFFICE"
      );
      setTasks(office);
      setStaff(staffList);
    } catch (e) {
      console.error("Failed to load office tasks", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAssign = async (taskId: string) => {
    const staffId = selected[taskId];
    if (!staffId) {
      alert("Select a staff member first.");
      return;
    }
    setAssigning(taskId);
    try {
      await taskApi.assign(taskId, staffId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to assign task");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900 flex items-center gap-2">
                <Briefcase className="h-6 w-6" /> Office Tasks
              </h1>
              <p className="text-sm text-muted-foreground">
                Office grievances awaiting assignment. Assign each to a staff
                member — it then appears in their My Tasks.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : tasks.length === 0 ? (
              <Card className="rounded-2xl border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No office tasks awaiting assignment.
                </CardContent>
              </Card>
            ) : (
              tasks.map((t) => (
                <Card
                  key={t.id}
                  className="rounded-2xl shadow-sm border border-indigo-100"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {t.title}
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Unassigned
                      </Badge>
                      {t.referenceNo && (
                        <span className="font-mono text-xs text-indigo-700">
                          {t.referenceNo}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {t.description && (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <FileText className="h-4 w-4 mt-0.5 shrink-0" />{" "}
                        {t.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created{" "}
                      {t.createdAt
                        ? new Date(t.createdAt).toLocaleString("en-IN")
                        : "—"}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">Assign to:</span>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
                        value={selected[t.id] ?? ""}
                        onChange={(e) =>
                          setSelected((s) => ({ ...s, [t.id]: e.target.value }))
                        }
                      >
                        <option value="">Select staff…</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => handleAssign(t.id)}
                        disabled={assigning === t.id || !selected[t.id]}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {assigning === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <UserPlus className="h-4 w-4 mr-1" />
                        )}
                        Assign
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
