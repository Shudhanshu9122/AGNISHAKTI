import { NextResponse } from "next/server";

// GET /api/snapshots/[imageId]
export async function GET(req, { params }) {
  try {
    const { imageId } = await params;
    
    if (!imageId) {
      return NextResponse.json({ error: "Image ID is required" }, { status: 400 });
    }

    // Construct URL to Python service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    const imageUrl = `${pythonServiceUrl}/snapshots/${imageId}`;
    
    // Fetch image from Python service with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    let response;
    try {
      response = await fetch(imageUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'AgniShakti-Proxy/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ error: "Image not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to fetch image" }, { status: response.status });
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      console.error("Fetch error:", fetchError);
      return NextResponse.json({ error: "Failed to connect to image service" }, { status: 503 });
    }
    
    // Get image data
    const imageBuffer = await response.arrayBuffer();
    
    // Return image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
    
  } catch (error) {
    console.error("Error serving snapshot:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
