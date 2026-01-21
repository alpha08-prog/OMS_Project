import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

const birthdays = [
  {
    name: "Rajesh Kumar",
    phone: "9876543210",
    dob: "1990-09-21",
  },
  {
    name: "Priya Sharma",
    phone: "9123456789",
    dob: "1988-09-22",
  },
  {
    name: "Amit Verma",
    phone: "9988776655",
    dob: "1995-10-02",
  },
];

export default function Birthdays() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div>
              <h1 className="text-2xl font-semibold text-indigo-900">
                Birthdays
              </h1>
              <p className="text-sm text-muted-foreground">
                Visitors & constituents birthday list
              </p>
            </div>

            {/* Filters */}
            <Card className="rounded-2xl border border-indigo-100">
              <CardContent className="flex flex-wrap gap-4 py-4">
                <Select>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">January</SelectItem>
                    <SelectItem value="02">February</SelectItem>
                    <SelectItem value="03">March</SelectItem>
                    <SelectItem value="04">April</SelectItem>
                    <SelectItem value="05">May</SelectItem>
                    <SelectItem value="06">June</SelectItem>
                    <SelectItem value="07">July</SelectItem>
                    <SelectItem value="08">August</SelectItem>
                    <SelectItem value="09">September</SelectItem>
                    <SelectItem value="10">October</SelectItem>
                    <SelectItem value="11">November</SelectItem>
                    <SelectItem value="12">December</SelectItem>
                  </SelectContent>
                </Select>

                <Select>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filter by Date" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => (
                      <SelectItem key={i + 1} value={`${i + 1}`}>
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Birthday List */}
            <Card className="rounded-2xl shadow-sm border border-indigo-100">
              <CardHeader>
                <CardTitle className="text-lg">
                  Birthday List
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {birthdays.map((b, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-xl border bg-white hover:bg-indigo-50/40 transition"
                  >
                    <div>
                      <p className="font-medium text-indigo-900">
                        {b.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        📞 {b.phone}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        🎂 {new Date(b.dob).toLocaleDateString("en-IN")}
                      </Badge>

                      {/* Example: highlight today */}
                      {new Date(b.dob).getDate() === new Date().getDate() && (
                        <Badge className="bg-amber-100 text-amber-800">
                          Today
                        </Badge>
                      )}
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
