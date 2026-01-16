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

export default function VisitorCreate() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">
            Office Attendees & Birthday Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Log visitors and auto-flag birthdays
          </p>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
          <CardHeader>
            <CardTitle className="text-lg">
              Visitor Details
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

            {/* LEFT COLUMN — FORM */}
            <div className="xl:col-span-2 space-y-8">

              {/* Visitor Information */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Visitor Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Visitor Name <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Enter visitor full name" />
                  </div>

                  <div>
                    <Label>
                      Designation <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="party">Party Worker</SelectItem>
                        <SelectItem value="official">Official</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
              <ReferencedByField placeholder="Eg: Local Leader, Office Staff" />


              {/* Date of Birth */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Date of Birth
                </h3>

                <div className="max-w-xs">
                  <Label>
                    Date of Birth <span className="text-red-500">*</span>
                  </Label>
                  <Input type="date" />
                  <p className="text-xs text-muted-foreground mt-1">
                  </p>
                </div>
              </section>

              {/* Visit Purpose */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Visit Purpose
                </h3>

                <div>
                  <Label>
                    Purpose <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    placeholder="Enter purpose of visit"
                    className="min-h-[120px]"
                  />
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN — ACTIONS */}
            <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Submission
                </h3>
                <p className="text-xs text-muted-foreground">
                  All fields marked with <span className="text-red-500">*</span> are mandatory.
                </p>
              </section>

              <div className="border-t pt-4 space-y-3">
                <Button variant="outline" className="w-full">
                  Cancel
                </Button>
                <Button className="w-full bg-saffron text-black hover:bg-amber-600">
                  Log Visitor
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
