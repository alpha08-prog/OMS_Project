import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Image } from "lucide-react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function PhotoBooth() {
  const [mode, setMode] = useState<"public" | "employee">("public");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-indigo-900">
                  Photo Booth
                </h1>
                <p className="text-sm text-muted-foreground">
                  Event photo archive & public search
                </p>
              </div>

              {/* Mode Switch */}
              <div className="flex gap-2">
                <Button
                  variant={mode === "public" ? "default" : "outline"}
                  onClick={() => setMode("public")}
                >
                  Public
                </Button>
                <Button
                  variant={mode === "employee" ? "default" : "outline"}
                  onClick={() => setMode("employee")}
                >
                  Employee
                </Button>
              </div>
            </div>

            {/* PUBLIC INTERFACE */}
            {mode === "public" && (
              <Card className="rounded-2xl border border-indigo-100 bg-white/90">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5 text-indigo-700" />
                    Find My Photos
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6 max-w-xl">
                  <div className="space-y-2">
                    <Label>
                      Event Date <span className="text-red-500">*</span>
                    </Label>
                    <Input type="date" />
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Event Name <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select event" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inauguration">
                          Ward Office Inauguration
                        </SelectItem>
                        <SelectItem value="grievance-camp">
                          Public Grievance Camp
                        </SelectItem>
                        <SelectItem value="school-event">
                          School Annual Day
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button className="bg-amber-500 text-black hover:bg-amber-600 w-full">
                    View Photos
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* EMPLOYEE INTERFACE */}
            {mode === "employee" && (
              <Card className="rounded-2xl border border-indigo-100 bg-white/90">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-indigo-700" />
                    Search Event Archive
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        From Date <span className="text-red-500">*</span>
                      </Label>
                      <Input type="date" />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        To Date <span className="text-red-500">*</span>
                      </Label>
                      <Input type="date" />
                    </div>
                  </div>

                  <div className="space-y-2 max-w-md">
                    <Label>
                      Event Name <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Eg: Inauguration / Rally / Meeting" />
                  </div>

                  <Button className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto">
                    Search Archive
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* PLACEHOLDER RESULT GRID */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Results Preview (Mock)
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-32 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm"
                  >
                    Photo {i}
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
