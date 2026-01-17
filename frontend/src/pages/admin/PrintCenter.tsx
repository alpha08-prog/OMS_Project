import {
  Printer,
  FileText,
  Download,
  Eye,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const letters = [
  {
    id: "L-1023",
    type: "Grievance Letter",
    reference: "Rajesh Kumar – Water Supply",
    department: "PWD",
    date: "Today",
    status: "Ready",
  },
  {
    id: "L-1024",
    type: "Train EQ Letter",
    reference: "PNR 4567890123",
    department: "Railways",
    date: "Today",
    status: "Printed",
  },
  {
    id: "L-1025",
    type: "Tour Program Regret",
    reference: "School Annual Day",
    department: "Education",
    date: "Yesterday",
    status: "Ready",
  },
];

export default function PrintCenter() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">
            Print Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate, preview, and print official letters
          </p>
        </div>

        {/* Filters */}
        <Card className="rounded-2xl border border-indigo-100">
          <CardContent className="flex flex-wrap gap-3 py-4">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              All
            </Button>
            <Button variant="outline" size="sm">
              Grievance Letters
            </Button>
            <Button variant="outline" size="sm">
              Train EQ
            </Button>
            <Button variant="outline" size="sm">
              Tour Program
            </Button>
          </CardContent>
        </Card>

        {/* Letters Queue */}
        <Card className="rounded-2xl shadow-sm border border-indigo-100">
          <CardHeader>
            <CardTitle className="text-lg">
              Printable Letters
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">

            {letters.map((letter) => (
              <div
                key={letter.id}
                className="flex items-center justify-between rounded-xl border p-4 hover:bg-indigo-50/40 transition"
              >
                {/* Left */}
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-indigo-700" />
                  </div>

                  <div>
                    <p className="font-medium text-indigo-900">
                      {letter.type}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {letter.reference}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {letter.department} • {letter.date}
                    </p>
                  </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      letter.status === "Ready"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                    }
                  >
                    {letter.status}
                  </Badge>

                  <Button size="icon" variant="ghost">
                    <Eye className="h-4 w-4" />
                  </Button>

                  <Button size="icon" variant="ghost">
                    <Download className="h-4 w-4" />
                  </Button>

                  <Button
                    size="icon"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
