import { NextResponse } from "next/server";
import { createPendingAlert, checkActiveAlert } from "@/app/backend"; 

// POST /api/alerts/trigger
// This endpoint is used by the Python service to trigger alerts
export async function POST(req) {
  try {
    // Get the secret service key from the request headers
    const serviceKey = req.headers.get("x-service-key");
    const expectedServiceKey = process.env.SERVICE_KEY;

    if (!serviceKey) {
      console.warn("[NEXT_API] [trigger] ❌ Service key is missing");
      return NextResponse.json({ error: "Service key is missing" }, { status: 401 });
    }

    if (serviceKey !== expectedServiceKey) {
      console.warn("[NEXT_API] [trigger] ❌ Invalid service key");
      return NextResponse.json({ error: "Invalid service key" }, { status: 401 });
    }

    // Get the full payload from the request body
    const body = await req.json();
    const { cameraId, imageId, className, confidence, bbox, timestamp } = body;

    if (!cameraId || !imageId || !className) {
      return NextResponse.json({ error: "Missing required fields: cameraId, imageId, className" }, { status: 400 });
    }

    console.log(`[NEXT_API] [trigger] 🔔 Alert triggered by Python service for camera: ${cameraId}`);

    // SPAM CHECK - prevent multiple active alerts for the same camera
    const activeAlert = await checkActiveAlert(cameraId);
    if (activeAlert) {
      console.warn(`[NEXT_API] [trigger] ❌ Spam check FAILED. Alert ${activeAlert.alertId} is already active for camera ${cameraId}.`);
      return NextResponse.json(
        { success: false, message: "An alert is already active for this camera." },
        { status: 429 } // 429 Too Many Requests
      );
    }

    // Construct the payload object that createPendingAlert expects
    const payload = {
      cameraId,
      imageId,
      className,
      confidence: confidence || 0,
      bbox: bbox || null,
      timestamp: timestamp || null
    };

    // Use the new alert pipeline
    console.log(`[NEXT_API] [trigger] ✅ Spam check PASSED. Calling createPendingAlert...`);
    const { alertId } = await createPendingAlert(payload);
    
    return NextResponse.json({ success: true, alertId });
  } catch (err) {
    console.error("[NEXT_API] [trigger] ❌ Error in trigger alert:", err);
    // Handle specific auth error
    if (err.status === 401) {
        return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to trigger alert", details: err.message }, { status: 500 });
  }
}