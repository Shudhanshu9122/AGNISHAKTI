import { NextResponse } from "next/server";
import { getUserByEmail } from "@/app/backend";

// POST /api/auth/login
export async function POST(req) {
  try {
    console.log("Login API route hit");

    if (!getUserByEmail) {
      console.error("getUserByEmail function not available");
      return NextResponse.json(
        { error: "Backend function not available" },
        { status: 500 }
      );
    }

    const { email } = await req.json();
    console.log("Email received:", email);

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    console.log("User found:", user ? "Yes" : "No");
    console.log("User data:", user);
    console.log("Normalized email:", email);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // AUTO RESET COOLDOWN FOR OWNERS (Demo Feature) - Clears Firebase alerts only
    /* 
    // DISABLED FOR DEBUGGING: Prevents alerts from vanishing on reload
    if (user.role === "owner") {
      try {
        const { resetCooldownForUser } = await import("@/app/backend");
        const resetResult = await resetCooldownForUser(email);
        console.log(`[LOGIN] Auto-reset for owner ${email}: ${resetResult.deletedCount} alerts cleared from Firebase`);
      } catch (resetErr) {
        console.warn("[LOGIN] Could not reset cooldown:", resetErr.message);
      }
    }
    */

    return NextResponse.json({ success: true, user });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Failed to login" },
      { status: 500 }
    );
  }
}
