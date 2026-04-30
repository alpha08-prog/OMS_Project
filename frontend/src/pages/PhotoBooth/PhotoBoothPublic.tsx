import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Camera, ArrowLeft } from "lucide-react";

/**
 * Photo Booth — Public ("Find My Photo") view.
 *
 * Gated as "Coming soon" until the Stratus upload pipeline is restored.
 * Original implementation lives in git history (commit 410e6db) and can be
 * restored once uploads are working.
 */
export default function PhotoBoothPublic() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-indigo-50/60 to-white px-6 py-12">
          <div className="max-w-2xl mx-auto">
            <Card className="rounded-2xl border-amber-200">
              <CardHeader className="text-center">
                <div className="mx-auto p-4 bg-amber-100 rounded-2xl mb-2 w-fit">
                  <Camera className="h-10 w-10 text-amber-600" />
                </div>
                <CardTitle className="text-2xl text-amber-900">Find My Photo — Coming soon</CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">
                  This feature relies on photo uploads, which are currently being upgraded.
                  We'll switch it back on as soon as the upload service is ready.
                </p>
                <Button variant="outline" onClick={() => navigate("/photo-booth")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Photo Booth
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
