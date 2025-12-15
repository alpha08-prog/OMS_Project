import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function VisitorCreate() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-indigo-900">
          Office Attendees & Birthday Tracker
        </h1>
        <p className="text-sm text-muted-foreground">
          Log visitors and auto-flag birthdays
        </p>
      </div>

      {/* Visitor Form */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            Visitor Details
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-8">

          {/* Visitor Info */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Visitor Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Visitor Name</Label>
                <Input placeholder="Enter visitor full name" />
              </div>

              <div>
                <Label>Designation</Label>
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

          {/* Birth Date */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Date of Birth
            </h3>

            <div className="max-w-xs">
              <Label>Date of Birth</Label>
              <Input type="date" />
              <p className="text-xs text-muted-foreground mt-1">
              </p>
            </div>
          </section>

          {/* Visit Purpose */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Visit Purpose
            </h3>

            <div>
              <Label>Purpose</Label>
              <Textarea
                placeholder="Enter purpose of visit"
                className="min-h-[100px]"
              />
            </div>
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline">
              Cancel
            </Button>
            <Button className="bg-saffron text-black hover:bg-amber-600">
              Log Visitor
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
