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

export default function GrievanceCreate() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-indigo-900">
          Register New Grievance
        </h1>
        <p className="text-sm text-muted-foreground">
          Public Grievance & Letter Tracking
        </p>
      </div>

      {/* Main Form */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Grievance Details</CardTitle>
        </CardHeader>

        <CardContent className="space-y-8">
          
          {/* Petitioner Info */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Petitioner Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Petitioner Name</Label>
                <Input placeholder="Enter full name" />
              </div>

              <div>
                <Label>Mobile Number</Label>
                <Input placeholder="10-digit mobile number" />
                <p className="text-xs text-muted-foreground mt-1">
                  Used as primary tracking key
                </p>
              </div>
            </div>
          </section>

          {/* Grievance Info */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Grievance Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Constituency / Ward</Label>
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
                <Label>Grievance Type</Label>
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
              <Label>Description</Label>
              <Textarea
                placeholder="Enter detailed description of the grievance"
                className="min-h-[120px]"
              />
            </div>

            <div>
              <Label>Monetary Value (₹)</Label>
              <Input placeholder="Estimated cost / aid amount" />
              <p className="text-xs text-muted-foreground mt-1">
                Monetised value of work or aid requested
              </p>
            </div>
          </section>

          {/* Action & Letter */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Action & Letter Processing
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Action Required</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letter">Generate Letter</SelectItem>
                    <SelectItem value="call">Call Official</SelectItem>
                    <SelectItem value="forward">Forward to Department</SelectItem>
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
                    <SelectItem value="police">To Police Commissioner</SelectItem>
                    <SelectItem value="pwd">To PWD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="space-y-4">
            <h3 className="font-medium text-indigo-800">
              Ticket Status
            </h3>

            <Select defaultValue="open">
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-saffron text-black hover:bg-amber-600">
              Register Grievance
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
