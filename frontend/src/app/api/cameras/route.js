import { NextResponse } from "next/server";
import {
  addCamera,
  getCamerasByOwnerEmail, // Correct function for GET
  deleteCamera,
} from "@/app/backend";

// POST /api/cameras → Add new camera
export async function POST(req) {
  try {
    // Read the correct properties from the request body
    const { houseId, label, source, streamType } = await req.json();

    // Validate required fields
    if (!houseId || !label || !source) {
      return NextResponse.json({ 
        success: false, 
        message: "Missing required fields (houseId, label, source)." 
      }, { status: 400 });
    }

    // Call addCamera with the correct parameters
    const camera = await addCamera({
      houseId,
      label,
      source,
      streamType: streamType || 'rtsp' // Default to rtsp
    });

    return NextResponse.json({ success: true, camera }, { status: 201 });
  } catch (error) {
    console.error("Add camera error:", error);
    return NextResponse.json({ 
      success: false, 
      message: error.message 
    }, { status: 500 });
  }
}

// GET /api/cameras?ownerEmail=abc@xyz.com → List cameras
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerEmail = searchParams.get("ownerEmail");
    if (!ownerEmail) {
      return NextResponse.json({ error: "Missing ownerEmail" }, { status: 400 });
    }

    const cameras = await getCamerasByOwnerEmail(ownerEmail);
    return NextResponse.json({ success: true, cameras });
  } catch (err) {
    console.error("Get cameras error:", err);
    return NextResponse.json({ error: "Failed to fetch cameras" }, { status: 500 });
  }
}

// DELETE /api/cameras → Remove camera
export async function DELETE(req) {
  try {
    const { cameraId } = await req.json();
    if (!cameraId) {
      return NextResponse.json({ error: "Missing cameraId" }, { status: 400 });
    }

    await deleteCamera(cameraId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete camera error:", err);
    return NextResponse.json({ error: "Failed to delete camera" }, { status: 500 });
  }
}