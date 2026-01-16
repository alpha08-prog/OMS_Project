import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ReferencedByField } from "@/components/common/ReferencedByField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GrievanceCreate() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">
            Register New Grievance
          </h1>
          <p className="text-sm text-muted-foreground">
            Public Grievance & Letter Tracking
          </p>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
          <CardHeader>
            <CardTitle className="text-lg">Grievance Details</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* LEFT COLUMN */}
            <div className="xl:col-span-2 space-y-8">
              {/* Petitioner Info */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Petitioner Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Petitioner Name <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Enter full name" />
                  </div>

                  <div>
                    <Label>
                      Mobile Number <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="10-digit mobile number" />
                  </div>
                </div>
              </section>

              {/* Grievance Info */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Grievance Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Constituency / Ward{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select constituency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="central">Central</SelectItem>
                        <SelectItem value="west">West</SelectItem>
                        <SelectItem value="ward12">Ward 12</SelectItem>
                        <SelectItem value="villageX">Village X</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>
                      Grievance Type <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grievance type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="water">Water</SelectItem>
                        <SelectItem value="road">Road</SelectItem>
                        <SelectItem value="police">Police</SelectItem>
                        <SelectItem value="health">Health</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                        <SelectItem value="financial">Financial Aid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>
                    Description <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    placeholder="Enter detailed description of the grievance"
                    className="min-h-[140px]"
                  />
                </div>

                <div>
                  <Label>
                    Monetary Value (₹) <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder="Estimated cost / aid amount" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Monetised value of work or aid requested
                  </p>
                </div>
              </section>

              {/* Action & Letter */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Action & Letter Processing
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Action Required <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="letter">Generate Letter</SelectItem>
                        <SelectItem value="call">Call Official</SelectItem>
                        <SelectItem value="forward">
                          Forward to Department
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Letter Template</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dc">To DC</SelectItem>
                        <SelectItem value="police">
                          To Police Commissioner
                        </SelectItem>
                        <SelectItem value="pwd">To PWD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN */}
            <section className="space-y-4">
              <h3 className="font-medium text-indigo-800">
                Reference Information
              </h3>

              <ReferencedByField />
            </section>
            <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Ticket Status
                </h3>

                <Label>
                  Status <span className="text-red-500">*</span>
                </Label>
                <Select defaultValue="open">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </section>

              <div className="border-t pt-4 space-y-3">
                <Button variant="outline" className="w-full">
                  Cancel
                </Button>
                <Button className="w-full bg-saffron text-black hover:bg-amber-600">
                  Register Grievance
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
