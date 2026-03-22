import { NextResponse } from "next/server";
import { getProviderDashboardData } from "@/app/backend";

// GET /api/provider/dashboard?providerEmail=abc@xyz.com
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const providerEmail = searchParams.get("providerEmail");

    if (!providerEmail) {
      return NextResponse.json({ error: "Missing providerEmail" }, { status: 400 });
    }

    const dashboard = await getProviderDashboardData(providerEmail);
    return NextResponse.json({ success: true, dashboard });
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
