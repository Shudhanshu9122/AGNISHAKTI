
import { NextResponse } from "next/server";
import { updateResponderHeartbeat } from "@/app/backend";

// POST /api/responder/heartbeat
export async function POST(req) {
    try {
        const body = await req.json();
        const { responderId, responderEmail, location, status } = body;

        if (!responderId && !responderEmail) {
            return NextResponse.json({ error: "Missing responder identifier" }, { status: 400 });
        }

        // Call backend function to update heartbeat/status
        await updateResponderHeartbeat({
            responderId,
            responderEmail,
            location,
            status
        });

        return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error("[API_RESPONDER_HEARTBEAT] Error:", error);
        return NextResponse.json({ error: "Failed to process heartbeat" }, { status: 500 });
    }
}
