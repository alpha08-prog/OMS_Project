import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

type Visitor = {
  id: number;
  name: string;
  phone: string;
  designation: string;
  dob?: string;
  date: string;
  referencedBy?: string;
};

const MOCK_VISITORS: Visitor[] = [
  {
    id: 1,
    name: "Suresh Patel",
    phone: "9876543210",
    designation: "Party Worker",
    dob: "1990-03-24",
    date: "2025-03-24",
    referencedBy: "Local Leader",
  },
  {
    id: 2,
    name: "Anita Gupta",
    phone: "9123456780",
    designation: "Official",
    dob: "1985-07-10",
    date: "2025-03-24",
    referencedBy: "Office Staff",
  },
  {
    id: 3,
    name: "Vikram Singh",
    phone: "9988776655",
    designation: "Public",
    date: "2025-03-23",
  },
];

export default function ViewVisitors() {
  const [dateFilter, setDateFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    console.log("ViewVisitors component mounted");
  }, []);

  const filteredVisitors = MOCK_VISITORS.filter((v) => {
    return (
      (!dateFilter || v.date === dateFilter) &&
      (!designationFilter || (designationFilter === "all" ? true : v.designation === designationFilter)) &&
      (!search ||
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.phone.includes(search))
    );
  });

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                View Visitors
              </h1>
              <p className="text-sm text-muted-foreground">
                Visitor entries logged by staff
              </p>
            </div>

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>

              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Designation</Label>
                  <Select
                    value={designationFilter}
                    onValueChange={setDesignationFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Party Worker">
                        Party Worker
                      </SelectItem>
                      <SelectItem value="Official">Official</SelectItem>
                      <SelectItem value="Public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <Label>Search (Name / Phone)</Label>
                  <Input
                    placeholder="Enter name or phone number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Visitor List */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Visitors ({filteredVisitors.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {filteredVisitors.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No visitors found for selected filters.
                  </p>
                )}

                {filteredVisitors.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded-xl border bg-white"
                  >
                    <div>
                      <p className="font-medium text-indigo-900">
                        {v.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        📞 {v.phone} • {v.designation}
                      </p>
                      {v.referencedBy && (
                        <p className="text-xs text-muted-foreground">
                          Referred by: {v.referencedBy}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {v.dob && (
                        <Badge variant="outline">
                          🎂 {v.dob}
                        </Badge>
                      )}
                      <Badge variant="secondary">
                        {v.date}
                      </Badge>
                    </div>
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
