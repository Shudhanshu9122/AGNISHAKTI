import { NextResponse } from "next/server";
import { updateAlertImage } from "@/app/backend";
import { db } from "@/lib/firebase";

// POST /api/alerts/update-image
// Called by Python service during cooldown to update the detection image
export async function POST(req) {
  try {
    const body = await req.json();
    const { imageId, cameraId } = body;

    if (!imageId || !cameraId) {
      return NextResponse.json({ error: "imageId and cameraId are required" }, { status: 400 });
    }

    console.log(`[API] Update image for camera ${cameraId}: ${imageId}`);

    // Find the active alert for this camera
    const alertsSnap = await db.collection("alerts")
      .where("cameraId", "==", cameraId)
      .where("status", "in", ["NOTIFIED_COOLDOWN", "DISPATCHED", "CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS"])
      .limit(1)
      .get();

    if (alertsSnap.empty) {
      console.log(`[API] No active alert found for camera ${cameraId}`);
      return NextResponse.json({ success: false, message: "No active alert for this camera" });
    }

    const alertId = alertsSnap.docs[0].id;

    // Update the image
    const result = await updateAlertImage(alertId, imageId);

    return NextResponse.json({
      success: true,
      alertId,
      newImageUrl: result.newImageUrl
    });
  } catch (error) {
    console.error("[API] Update image error:", error);
    return NextResponse.json({ error: "Failed to update image" }, { status: 500 });
  }
}
