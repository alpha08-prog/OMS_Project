import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDown } from "lucide-react";

export default function TourProgramCreate() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">
            Invitation & Tour Program
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage the Minister’s schedule and invitations
          </p>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
          <CardHeader>
            <CardTitle className="text-lg">
              Event Details
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

            {/* LEFT COLUMN — FORM */}
            <div className="xl:col-span-2 space-y-8">

              {/* Event Information */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Event Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Event Name <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Enter event name" />
                  </div>

                  <div>
                    <Label>
                      Organizer <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Enter organizer name" />
                  </div>
                </div>
              </section>

              {/* Schedule */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Schedule
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Date & Time <span className="text-red-500">*</span>
                    </Label>
                    <Input type="datetime-local" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Warns if the selected time slot is already booked.
                    </p>
                  </div>

                  <div>
                    <Label>
                      Venue <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="Venue or Google Maps link" />
                  </div>
                </div>
              </section>

              {/* Decision */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Decision
                </h3>

                <div className="max-w-sm">
                  <Label>
                    Decision <span className="text-red-500">*</span>
                  </Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select decision" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accepted">
                        Accepted (Add to Tour Program)
                      </SelectItem>
                      <SelectItem value="regret">
                        Regret (Send Letter)
                      </SelectItem>
                      <SelectItem value="pending">
                        Pending
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN — ACTIONS */}
            <div className="space-y-6 bg-indigo-50/60 rounded-xl p-5 border border-indigo-100">

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Actions
                </h3>
                <p className="text-xs text-muted-foreground">
                  Fields marked with <span className="text-red-500">*</span> are mandatory.
                </p>
              </section>

              {/* Action Buttons */}
              <div className="border-t pt-4 space-y-3">
                <Button
                  variant="outline"
                  className="w-full flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Export Tour Program PDF
                </Button>

                <Button variant="outline" className="w-full">
                  Cancel
                </Button>

                <Button className="w-full bg-saffron text-black hover:bg-amber-600">
                  Save Tour Program
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
