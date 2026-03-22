import { NextResponse } from "next/server";
import { startMonitoring } from "@/app/backend";

// POST /api/monitoring/start
export async function POST(req) {
  try {
    const { cameraId } = await req.json();
    if (!cameraId) {
      return NextResponse.json({ error: "Missing cameraId" }, { status: 400 });
    }

    const result = await startMonitoring(cameraId);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("Start monitoring error:", err);
    return NextResponse.json({ error: "Failed to start monitoring" }, { status: 500 });
  }
}
