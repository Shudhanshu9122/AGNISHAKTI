// src/app/api/alerts/cancel/route.js
import { NextResponse } from "next/server";
import { cancelAlertByUser, deleteAlert } from "@/app/backend";

export async function POST(req) {
  console.log(`[NEXT_API] 🚫 /api/alerts/cancel HIT`);
  try {
    const { alertId, userEmail } = await req.json();
    if (!alertId) {
      return NextResponse.json({ success: false, message: "Alert ID required." }, { status: 400 });
    }

    // This sets status to CANCELLED_BY_USER
    await cancelAlertByUser(alertId, userEmail);

    // As per the requirement, we delete the alert immediately after cancelling.
    await deleteAlert(alertId); 

    return NextResponse.json({ success: true, message: "Alert cancelled and deleted." });
  } catch (error) {
    console.error("[NEXT_API] ❌ Error in cancel-alert:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
