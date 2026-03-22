import { NextResponse } from "next/server";
import { getAlertsByOwnerEmail } from "@/app/backend";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerEmail = searchParams.get("ownerEmail");
    
    if (!ownerEmail) {
      return NextResponse.json({ error: "ownerEmail required" }, { status: 400 });
    }
    
    const alerts = await getAlertsByOwnerEmail(ownerEmail);
    return NextResponse.json({ success: true, alerts });
  } catch (err) {
    console.error('[NEXT_API] Error fetching alerts:', err.message);
    // Handle quota exceeded gracefully
    if (err.code === 8 || err.message.includes("Quota exceeded")) {
      console.warn('[NEXT_API] Firestore quota exceeded, returning empty array');
      return NextResponse.json({ success: true, alerts: [] }); // Return empty instead of error
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
