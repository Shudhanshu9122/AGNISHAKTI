import { NextResponse } from "next/server";
import { deleteAlert } from "@/app/backend";
import { db } from "@/lib/firebase";

// POST /api/alerts/cleanup-stale
// Manually clean up stale alerts that are blocking new detections
export async function POST(req) {
  try {
    const { cameraId, alertId } = await req.json();
    
    if (!cameraId && !alertId) {
      return NextResponse.json(
        { success: false, message: "Either cameraId or alertId is required" },
        { status: 400 }
      );
    }

    let cleanedCount = 0;
    
    if (alertId) {
      // Delete specific alert
      await deleteAlert(alertId);
      cleanedCount = 1;
      console.log(`[NEXT_API] [cleanup] Deleted alert ${alertId}`);
    } else if (cameraId) {
      // Clean up all stale alerts for this camera
      const activeStatuses = ["PENDING", "CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN"];
      const alertsSnapshot = await db.collection("alerts")
        .where("cameraId", "==", cameraId)
        .where("status", "in", activeStatuses)
        .get();
      
      const now = Date.now();
      
      for (const alertDoc of alertsSnapshot.docs) {
        const alert = alertDoc.data();
        const alertIdToCheck = alertDoc.id;
        
        // Check if stale
        const createdAt = alert.createdAt?.toDate ? alert.createdAt.toDate().getTime() : new Date(alert.createdAt).getTime();
        const ageSeconds = (now - createdAt) / 1000;
        
        // Clean if older than 5 minutes
        if (ageSeconds > 300) {
          await deleteAlert(alertIdToCheck);
          cleanedCount++;
          console.log(`[NEXT_API] [cleanup] Deleted stale alert ${alertIdToCheck} (age: ${ageSeconds.toFixed(0)}s)`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cleanedCount} stale alert(s)`,
      cleaned: cleanedCount
    });
  } catch (error) {
    console.error("[NEXT_API] ❌ Error cleaning up stale alerts:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to clean up alerts" },
      { status: 500 }
    );
  }
}

