import { NextResponse } from "next/server";
import { deleteAlert } from "@/app/backend";

// DELETE /api/alerts/delete
// Used by providers to mark alerts as responded (delete them)
export async function POST(req) {
  try {
    const { alertId } = await req.json();
    
    if (!alertId) {
      return NextResponse.json(
        { success: false, message: "Alert ID is required" },
        { status: 400 }
      );
    }

    await deleteAlert(alertId);
    
    return NextResponse.json({
      success: true,
      message: "Alert marked as responded and deleted."
    });
  } catch (error) {
    console.error("[NEXT_API] ❌ Error deleting alert:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete alert" },
      { status: 500 }
    );
  }
}

