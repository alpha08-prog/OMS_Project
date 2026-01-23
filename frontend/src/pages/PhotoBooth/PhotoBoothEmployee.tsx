import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { 
  Search, 
  ArrowLeft, 
  RefreshCw, 
  Download,
  Calendar,
  Image as ImageIcon,
  Filter,
  Grid,
  List,
  Upload,
  Trash2,
  Eye,
  FolderOpen
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventPhoto {
  id: string;
  url: string;
  filename: string;
  uploadedAt: string;
  size: string;
}

interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
  photoCount: number;
}

export default function PhotoBoothEmployee() {
  const navigate = useNavigate();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<EventPhoto | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Mock events data
  const events: Event[] = [
    { id: '1', name: 'Annual Conference 2024', date: '2024-01-15', location: 'Convention Center', photoCount: 245 },
    { id: '2', name: 'Inauguration Ceremony', date: '2024-01-10', location: 'Town Hall', photoCount: 189 },
    { id: '3', name: 'Town Hall Meeting', date: '2024-01-05', location: 'Community Center', photoCount: 156 },
    { id: '4', name: 'Press Conference', date: '2024-01-02', location: 'Media Room', photoCount: 78 },
    { id: '5', name: 'Foundation Day', date: '2023-12-28', location: 'Main Auditorium', photoCount: 312 },
  ];

  // Mock photos data
  const mockPhotos: EventPhoto[] = [
    { id: '1', url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400', filename: 'IMG_001.jpg', uploadedAt: '2024-01-15 10:30', size: '2.4 MB' },
    { id: '2', url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=400', filename: 'IMG_002.jpg', uploadedAt: '2024-01-15 10:32', size: '1.8 MB' },
    { id: '3', url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400', filename: 'IMG_003.jpg', uploadedAt: '2024-01-15 10:35', size: '2.1 MB' },
    { id: '4', url: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=400', filename: 'IMG_004.jpg', uploadedAt: '2024-01-15 10:38', size: '3.2 MB' },
    { id: '5', url: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=400', filename: 'IMG_005.jpg', uploadedAt: '2024-01-15 10:40', size: '2.7 MB' },
    { id: '6', url: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=400', filename: 'IMG_006.jpg', uploadedAt: '2024-01-15 10:42', size: '1.9 MB' },
    { id: '7', url: 'https://images.unsplash.com/photo-1560439514-4e9645039924?w=400', filename: 'IMG_007.jpg', uploadedAt: '2024-01-15 10:45', size: '2.5 MB' },
    { id: '8', url: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=400', filename: 'IMG_008.jpg', uploadedAt: '2024-01-15 10:48', size: '2.0 MB' },
    { id: '9', url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=400', filename: 'IMG_009.jpg', uploadedAt: '2024-01-15 10:50', size: '1.6 MB' },
    { id: '10', url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400', filename: 'IMG_010.jpg', uploadedAt: '2024-01-15 10:52', size: '2.8 MB' },
    { id: '11', url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400', filename: 'IMG_011.jpg', uploadedAt: '2024-01-15 10:55', size: '3.1 MB' },
    { id: '12', url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400', filename: 'IMG_012.jpg', uploadedAt: '2024-01-15 10:58', size: '2.3 MB' },
  ];

  // Handle search
  const handleSearch = async () => {
    setLoading(true);
    setHasSearched(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Filter mock photos based on criteria
    setPhotos(mockPhotos);
    setLoading(false);
  };

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setSelectedEvent("all");
    setPhotos([]);
    setHasSearched(false);
  };

  // Download all
  const downloadAll = () => {
    alert('Downloading all photos... (This is a demo)');
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-blue-50/60 to-white px-6 py-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate("/photo-booth")}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-blue-900">
                    Search Archive
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Browse and manage event photos
                  </p>
                </div>
              </div>
              
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Upload className="h-4 w-4 mr-2" />
                Upload Photos
              </Button>
            </div>

            {/* Search Filters */}
            <Card className="rounded-2xl border-2 border-blue-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5 text-blue-600" />
                  Search Filters
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Event Name Search */}
                  <div className="space-y-2">
                    <Label>Event Name</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="e.g., Inauguration"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Event Dropdown */}
                  <div className="space-y-2">
                    <Label>Select Event</Label>
                    <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Events" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        {events.map(event => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.name} ({event.photoCount})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Start Date */}
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* End Date */}
                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button variant="outline" onClick={resetFilters}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset Filters
                  </Button>
                  <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700">
                    <Search className="h-4 w-4 mr-2" />
                    Search Archive
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Events Overview */}
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-blue-600" />
                  Recent Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {events.map(event => (
                    <div 
                      key={event.id}
                      className="p-3 rounded-lg bg-gray-50 hover:bg-blue-50 cursor-pointer transition-colors border hover:border-blue-300"
                      onClick={() => {
                        setSelectedEvent(event.id);
                        handleSearch();
                      }}
                    >
                      <p className="font-medium text-sm truncate">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{event.date}</p>
                      <p className="text-xs text-blue-600 mt-1">{event.photoCount} photos</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">
                  {hasSearched 
                    ? `Found ${photos.length} Photos`
                    : 'Photo Gallery'
                  }
                </CardTitle>
                
                <div className="flex items-center gap-2">
                  {photos.length > 0 && (
                    <Button variant="outline" size="sm" onClick={downloadAll}>
                      <Download className="h-4 w-4 mr-2" />
                      Download All
                    </Button>
                  )}
                  <div className="flex border rounded-lg overflow-hidden">
                    <Button 
                      variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="rounded-none"
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="rounded-none"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mb-4" />
                    <p className="text-muted-foreground">Searching archive...</p>
                  </div>
                ) : !hasSearched ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ImageIcon className="h-16 w-16 text-gray-300 mb-4" />
                    <p className="text-lg font-medium text-gray-500">Search the archive</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Use the filters above to find photos from events
                    </p>
                  </div>
                ) : photos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ImageIcon className="h-16 w-16 text-gray-300 mb-4" />
                    <p className="text-lg font-medium text-gray-500">No photos found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Try adjusting your search filters
                    </p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {photos.map((photo) => (
                      <div 
                        key={photo.id} 
                        className="group relative rounded-xl overflow-hidden border-2 border-gray-200 hover:border-blue-400 transition-all cursor-pointer"
                        onClick={() => setPreviewPhoto(photo)}
                      >
                        <img 
                          src={photo.url} 
                          alt={photo.filename}
                          className="w-full aspect-square object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="icon" variant="secondary" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="secondary" className="h-8 w-8">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                          <p className="text-white text-xs truncate">{photo.filename}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {photos.map((photo) => (
                      <div 
                        key={photo.id} 
                        className="flex items-center gap-4 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                      >
                        <img 
                          src={photo.url} 
                          alt={photo.filename}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{photo.filename}</p>
                          <p className="text-sm text-muted-foreground">
                            {photo.uploadedAt} • {photo.size}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPreviewPhoto(photo)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                          <Button size="sm" variant="destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Photo Preview Dialog */}
        <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{previewPhoto?.filename}</DialogTitle>
            </DialogHeader>
            {previewPhoto && (
              <div className="space-y-4">
                <img 
                  src={previewPhoto.url} 
                  alt={previewPhoto.filename}
                  className="w-full rounded-lg"
                />
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Uploaded: {previewPhoto.uploadedAt} • Size: {previewPhoto.size}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
