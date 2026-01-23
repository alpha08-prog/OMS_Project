import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Camera, Search, Users, Upload, Calendar, Grid } from "lucide-react";

export default function PhotoBooth() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-6">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* Page Header */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center p-4 bg-indigo-100 rounded-2xl mb-4">
                <Camera className="h-10 w-10 text-indigo-600" />
              </div>
              <h1 className="text-3xl font-bold text-indigo-900">
                Photo Booth
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                AI-Powered Event Photo Management System
              </p>
            </div>

            {/* Interface Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Public Interface Card */}
              <Card className="rounded-2xl shadow-lg border-2 border-transparent hover:border-indigo-300 transition-all duration-300 cursor-pointer group"
                onClick={() => navigate("/photo-booth/public")}
              >
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                    <Users className="h-12 w-12 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl text-green-800">Find My Photo</CardTitle>
                  <p className="text-muted-foreground">Public Interface</p>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Upload className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Input</p>
                        <p className="text-muted-foreground">Upload Selfie / Live Camera Capture</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Camera className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Action</p>
                        <p className="text-muted-foreground">AI Face Recognition scans event gallery</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Grid className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Output</p>
                        <p className="text-muted-foreground">Displays all photos containing that person</p>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full bg-green-600 hover:bg-green-700" size="lg">
                    <Users className="h-5 w-5 mr-2" />
                    Find My Photos
                  </Button>
                </CardContent>
              </Card>

              {/* Employee Interface Card */}
              <Card className="rounded-2xl shadow-lg border-2 border-transparent hover:border-indigo-300 transition-all duration-300 cursor-pointer group"
                onClick={() => navigate("/photo-booth/employee")}
              >
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                    <Search className="h-12 w-12 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl text-blue-800">Search Archive</CardTitle>
                  <p className="text-muted-foreground">Employee Interface</p>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Input</p>
                        <p className="text-muted-foreground">Date Range, Event Name (e.g., "Inauguration")</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Search className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Action</p>
                        <p className="text-muted-foreground">Search through archived event photos</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Grid className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Output</p>
                        <p className="text-muted-foreground">Grid view of all photos from that event</p>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
                    <Search className="h-5 w-5 mr-2" />
                    Search Archives
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Info Section */}
            <Card className="rounded-2xl bg-indigo-50 border-indigo-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-indigo-100 rounded-lg">
                    <Camera className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-indigo-900">AI-Powered Photo Recognition</h3>
                    <p className="text-sm text-indigo-700 mt-1">
                      Our advanced face recognition technology helps visitors find their photos from events instantly. 
                      Simply upload a selfie and let our AI scan through thousands of event photos to find you.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
