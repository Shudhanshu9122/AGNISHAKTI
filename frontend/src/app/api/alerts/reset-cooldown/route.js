import { NextResponse } from "next/server";
import { resetCooldownForUser } from "@/app/backend";

// POST /api/alerts/reset-cooldown
// Called on user login to clear all active alerts for clean demo
export async function POST(req) {
    try {
        const body = await req.json();
        const { ownerEmail } = body;

        if (!ownerEmail) {
            return NextResponse.json({ error: "ownerEmail is required" }, { status: 400 });
        }

        console.log(`[API] Reset cooldown requested for: ${ownerEmail}`);

        const result = await resetCooldownForUser(ownerEmail);
        // Note: Python no longer manages cooldown - only Firebase alerts are cleared

        return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount,
            message: `Cleared ${result.deletedCount} alerts. System ready for demo.`
        });
    } catch (error) {
        console.error("[API] Reset cooldown error:", error);
        return NextResponse.json({ error: "Failed to reset cooldown" }, { status: 500 });
    }
}
