import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";

export default function TrainEQCreate() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">
            Train Emergency (EQ) Entry
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate Railway Emergency Quota letter instantly
          </p>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
          <CardHeader>
            <CardTitle className="text-lg">
              Passenger & Journey Details
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

            {/* LEFT COLUMN — FORM */}
            <div className="xl:col-span-2 space-y-8">

              {/* Passenger Information */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Passenger Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Passenger Name <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Enter passenger full name" />
                  </div>

                  <div>
                    <Label>
                      PNR Number <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="10-digit PNR number" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Must be exactly 10 digits
                    </p>
                  </div>
                </div>
              </section>
              <ReferencedByField placeholder="Eg: MP Recommendation / Emergency Call" />


              {/* Train Details */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Train Details
                </h3>

                <div>
                  <Label>
                    Train No. & Name
                  </Label>
                  <Input
                    placeholder="Auto-filled from Railway database"
                    disabled
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically fetched using PNR
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Date of Journey
                    </Label>
                    <Input type="date" />
                  </div>

                  <div>
                    <Label>
                      Class
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1a">1A</SelectItem>
                        <SelectItem value="2a">2A</SelectItem>
                        <SelectItem value="3a">3A</SelectItem>
                        <SelectItem value="sl">SL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>
                    Route
                  </Label>
                  <Input placeholder="From [Station] to [Station]" />
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN — ACTIONS */}
            <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Letter Options
                </h3>

                <div className="flex items-start gap-3">
                  <Checkbox id="digital-sign" />
                  <div className="text-sm">
                    <Label htmlFor="digital-sign">
                      Attach Digital Signature<span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Appends Minister’s stored digital signature to the PDF
                    </p>
                  </div>
                </div>
              </section>

              <section className="text-xs text-muted-foreground">
                Fields marked with <span className="text-red-500">*</span> are mandatory.
              </section>

              <div className="border-t pt-4 space-y-3">
                <Button variant="outline" className="w-full">
                  Cancel
                </Button>
                <Button className="w-full bg-saffron text-black hover:bg-amber-600">
                  Generate EQ Letter
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
