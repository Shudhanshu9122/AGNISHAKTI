import { NextResponse } from "next/server";
import { stopMonitoring } from "@/app/backend";

// POST /api/monitoring/stop
export async function POST(req) {
  try {
    const { cameraId } = await req.json();
    if (!cameraId) {
      return NextResponse.json({ error: "Missing cameraId" }, { status: 400 });
    }

    const result = await stopMonitoring(cameraId);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("Stop monitoring error:", err);
    return NextResponse.json({ error: "Failed to stop monitoring" }, { status: 500 });
  }
}
