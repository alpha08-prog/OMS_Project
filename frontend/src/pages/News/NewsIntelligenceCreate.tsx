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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload } from "lucide-react";

export default function NewsIntelligenceCreate() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold text-indigo-900">
            Constituency News & Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Log political developments and prioritize critical intelligence
          </p>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl shadow-sm bg-white/90 backdrop-blur border border-indigo-100">
          <CardHeader>
            <CardTitle className="text-lg">
              Intelligence Entry
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-8">

            {/* LEFT COLUMN — FORM */}
            <div className="xl:col-span-2 space-y-8">

              {/* Headline */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Headline & Classification
                </h3>

                <div>
                  <Label>
                    Headline <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder="Short summary of the news or intelligence" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="development">
                          Development Work
                        </SelectItem>
                        <SelectItem value="conspiracy">
                          Conspiracy / Fake News
                        </SelectItem>
                        <SelectItem value="leader">
                          Leader Activity
                        </SelectItem>
                        <SelectItem value="party">
                          Party Activity
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>
                      Region <span className="text-red-500">*</span>
                    </Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select affected region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="central">Central Ward</SelectItem>
                        <SelectItem value="west">West Ward</SelectItem>
                        <SelectItem value="booth">Specific Booth</SelectItem>
                        <SelectItem value="village">Village Area</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Priority */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Priority Level
                </h3>

                <RadioGroup defaultValue="normal" className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="normal" id="normal" />
                    <Label htmlFor="normal">Normal</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="high" id="high" />
                    <Label htmlFor="high">High</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="critical" id="critical" />
                    <Label htmlFor="critical" className="text-red-600 font-medium">
                      Critical (Push Alert)
                    </Label>
                  </div>
                </RadioGroup>
              </section>

              {/* Source */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Source Information
                </h3>

                <div>
                  <Label>
                    Media Source <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder="Newspaper / Social Media link / Informant name" />
                </div>
              </section>

              {/* Upload */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                  Evidence Upload
                </h3>

                <div className="border border-dashed border-indigo-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center">
                  <Upload className="h-6 w-6 text-indigo-500" />
                  <p className="text-sm font-medium">
                    Upload Screenshot
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Screenshot of news article or tweet (optional but recommended)
                  </p>
                  <Input type="file" className="hidden" />
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

              <div className="border-t pt-4 space-y-3">
                <Button variant="outline" className="w-full">
                  Cancel
                </Button>
                <Button className="w-full bg-saffron text-black hover:bg-amber-600">
                  Save Intelligence
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
