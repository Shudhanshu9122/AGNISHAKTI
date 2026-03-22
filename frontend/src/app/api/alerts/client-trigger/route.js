// src/app/api/alerts/client-trigger/route.js
import { NextResponse } from "next/server";
import { createPendingAlert, checkActiveAlert } from "@/app/backend";

export async function POST(req) {
  console.log(`[NEXT_API] 🔔 /api/alerts/client-trigger HIT`);
  try {
    const body = await req.json();

    // SPAM CHECK
    const activeAlert = await checkActiveAlert(body.cameraId);
    if (activeAlert) {
      console.warn(`[NEXT_API] ❌ Spam check FAILED. Alert ${activeAlert.alertId} is already active.`);
      return NextResponse.json(
        { success: false, message: "An alert is already active for this camera." },
        { status: 429 } // 429 Too Many Requests
      );
    }

    console.log(`[NEXT_API] ✅ Spam check PASSED. Calling createPendingAlert...`);
    const { alertId } = await createPendingAlert(body);

    return NextResponse.json({ success: true, alertId: alertId }, { status: 201 });

  } catch (error) {
    console.error("[NEXT_API] ❌ Error in client-trigger:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

