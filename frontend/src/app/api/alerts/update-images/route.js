import { NextResponse } from "next/server";
import { updateActiveAlertImages } from "@/app/backend";

// POST /api/alerts/update-images
// Updates images for all active alerts (called periodically)
export async function POST(req) {
  try {
    // Optional: Add authentication/authorization check here
    // For now, we'll allow any request (can be called by cron or frontend)
    
    const result = await updateActiveAlertImages();
    
    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("[NEXT_API] ❌ Error updating alert images:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update alert images" },
      { status: 500 }
    );
  }
}

