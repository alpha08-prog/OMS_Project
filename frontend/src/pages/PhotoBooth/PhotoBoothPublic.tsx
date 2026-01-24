import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { 
  Camera, 
  Upload, 
  ArrowLeft, 
  RefreshCw, 
  Download,
  X,
  Image as ImageIcon,
  Scan,
  CheckCircle,
  AlertCircle
} from "lucide-react";

type SearchState = 'idle' | 'uploading' | 'scanning' | 'complete' | 'error';

interface FoundPhoto {
  id: string;
  url: string;
  eventName: string;
  eventDate: string;
  similarity: number;
}

export default function PhotoBoothPublic() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [foundPhotos, setFoundPhotos] = useState<FoundPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
        setSearchState('idle');
        setFoundPhotos([]);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError('Unable to access camera. Please check permissions.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg');
      setUploadedImage(imageData);
      stopCamera();
      setSearchState('idle');
      setFoundPhotos([]);
      setError(null);
    }
  };

  // Simulate AI face recognition search
  const startSearch = useCallback(async () => {
    if (!uploadedImage) return;
    
    setSearchState('uploading');
    setError(null);
    setScanProgress(0);
    
    // Simulate upload
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSearchState('scanning');
    
    // Simulate scanning progress
    for (let i = 0; i <= 100; i += 10) {
      setScanProgress(i);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Simulate found photos (mock data)
    const mockPhotos: FoundPhoto[] = [
      {
        id: '1',
        url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400',
        eventName: 'Annual Conference 2024',
        eventDate: '2024-01-15',
        similarity: 98
      },
      {
        id: '2',
        url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=400',
        eventName: 'Inauguration Ceremony',
        eventDate: '2024-01-10',
        similarity: 95
      },
      {
        id: '3',
        url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400',
        eventName: 'Town Hall Meeting',
        eventDate: '2024-01-05',
        similarity: 92
      },
      {
        id: '4',
        url: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=400',
        eventName: 'Press Conference',
        eventDate: '2024-01-02',
        similarity: 88
      },
    ];
    
    setFoundPhotos(mockPhotos);
    setSearchState('complete');
  }, [uploadedImage]);

  // Reset search
  const resetSearch = () => {
    setUploadedImage(null);
    setFoundPhotos([]);
    setSearchState('idle');
    setError(null);
    setScanProgress(0);
    stopCamera();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />

      <main className="flex-1 overflow-auto">
        <div className="w-full min-h-screen bg-gradient-to-b from-green-50/60 to-white px-6 py-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/photo-booth")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-green-900">
                  Find My Photo
                </h1>
                <p className="text-sm text-muted-foreground">
                  Upload a selfie to find your photos from events
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Panel - Upload Section */}
              <div className="lg:col-span-1 space-y-4">
                <Card className="rounded-2xl border-2 border-green-200">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Upload className="h-5 w-5 text-green-600" />
                      Upload Your Photo
                    </CardTitle>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Preview Area */}
                    <div className="aspect-square rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative">
                      {cameraActive ? (
                        <video 
                          ref={videoRef} 
                          autoPlay 
                          playsInline 
                          className="w-full h-full object-cover"
                        />
                      ) : uploadedImage ? (
                        <>
                          <img 
                            src={uploadedImage} 
                            alt="Uploaded" 
                            className="w-full h-full object-cover"
                          />
                          <Button 
                            size="icon"
                            variant="destructive"
                            className="absolute top-2 right-2"
                            onClick={resetSearch}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <div className="text-center p-4">
                          <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Upload a selfie or use camera
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Camera/Upload Buttons */}
                    {!uploadedImage && !cameraActive && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => fileInputRef.current?.click()}
                          className="h-12"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={startCamera}
                          className="h-12"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Camera
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </div>
                    )}

                    {/* Camera Controls */}
                    {cameraActive && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={capturePhoto} className="h-12 bg-green-600 hover:bg-green-700">
                          <Camera className="h-4 w-4 mr-2" />
                          Capture
                        </Button>
                        <Button variant="outline" onClick={stopCamera} className="h-12">
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    )}

                    {/* Search Button */}
                    {uploadedImage && searchState === 'idle' && (
                      <Button 
                        onClick={startSearch}
                        className="w-full h-12 bg-green-600 hover:bg-green-700"
                      >
                        <Scan className="h-5 w-5 mr-2" />
                        Find My Photos
                      </Button>
                    )}

                    {/* Scanning Progress */}
                    {(searchState === 'uploading' || searchState === 'scanning') && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          <span className="text-sm font-medium">
                            {searchState === 'uploading' ? 'Uploading...' : 'Scanning event photos...'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-600 transition-all duration-300"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-center text-muted-foreground">
                          {scanProgress}% complete
                        </p>
                      </div>
                    )}

                    {/* Error Message */}
                    {error && (
                      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Instructions */}
                <Card className="rounded-xl bg-green-50 border-green-200">
                  <CardContent className="p-4 text-sm space-y-2">
                    <h4 className="font-semibold text-green-800">Tips for best results:</h4>
                    <ul className="list-disc list-inside text-green-700 space-y-1">
                      <li>Use a clear, front-facing photo</li>
                      <li>Good lighting improves accuracy</li>
                      <li>Remove sunglasses or hats</li>
                      <li>Face should be clearly visible</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Right Panel - Results */}
              <div className="lg:col-span-2">
                <Card className="rounded-2xl min-h-[500px]">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">
                      {searchState === 'complete' 
                        ? `Found ${foundPhotos.length} Photos`
                        : 'Your Photos Will Appear Here'
                      }
                    </CardTitle>
                    {searchState === 'complete' && (
                      <Button variant="outline" size="sm" onClick={resetSearch}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        New Search
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent>
                    {searchState === 'idle' && !uploadedImage && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Camera className="h-16 w-16 text-gray-300 mb-4" />
                        <p className="text-lg font-medium text-gray-500">Upload a selfie to get started</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Our AI will find all event photos featuring you
                        </p>
                      </div>
                    )}

                    {searchState === 'idle' && uploadedImage && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Scan className="h-16 w-16 text-green-300 mb-4" />
                        <p className="text-lg font-medium text-gray-500">Ready to scan</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Click "Find My Photos" to search through event galleries
                        </p>
                      </div>
                    )}

                    {(searchState === 'uploading' || searchState === 'scanning') && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="relative">
                          <Scan className="h-16 w-16 text-green-600 animate-pulse" />
                          <div className="absolute inset-0 border-4 border-green-200 rounded-full animate-ping" />
                        </div>
                        <p className="text-lg font-medium text-green-700 mt-6">
                          Scanning event photos...
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          This may take a moment
                        </p>
                      </div>
                    )}

                    {searchState === 'complete' && foundPhotos.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {foundPhotos.map((photo) => (
                          <div 
                            key={photo.id} 
                            className="group relative rounded-xl overflow-hidden border-2 border-gray-200 hover:border-green-400 transition-all"
                          >
                            <img 
                              src={photo.url} 
                              alt={photo.eventName}
                              className="w-full aspect-square object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                <p className="font-semibold text-sm">{photo.eventName}</p>
                                <p className="text-xs opacity-80">{photo.eventDate}</p>
                                <div className="flex items-center gap-1 mt-1">
                                  <CheckCircle className="h-3 w-3 text-green-400" />
                                  <span className="text-xs">{photo.similarity}% match</span>
                                </div>
                              </div>
                            </div>
                            <Button 
                              size="icon"
                              variant="secondary"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {searchState === 'complete' && foundPhotos.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <AlertCircle className="h-16 w-16 text-yellow-400 mb-4" />
                        <p className="text-lg font-medium text-gray-500">No photos found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Try uploading a different photo or check back later
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
