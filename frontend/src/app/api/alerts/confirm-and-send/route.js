// src/app/api/alerts/confirm-and-send/route.js
import { NextResponse } from "next/server";
import { confirmAndSendAlerts } from "@/app/backend";

export async function POST(req) {
  console.log(`[NEXT_API] 📧 /api/alerts/confirm-and-send HIT`);
  try {
    const { alertId } = await req.json();
    if (!alertId) {
      return NextResponse.json({ success: false, message: "Alert ID required." }, { status: 400 });
    }

    // This is the "Gatekeeper" function.
    const result = await confirmAndSendAlerts(alertId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[NEXT_API] ❌ Error in confirm-and-send:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

