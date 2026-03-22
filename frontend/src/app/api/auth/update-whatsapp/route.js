// POST /api/auth/update-whatsapp
// Saves the logged-in owner's WhatsApp number to their Firestore user profile.
// The number is used to send alerts when fire is detected at their property.

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";

export async function POST(req) {
  try {
    const { email, whatsappNumber } = await req.json();

    if (!email || !whatsappNumber) {
      return NextResponse.json(
        { error: "email and whatsappNumber are required" },
        { status: 400 }
      );
    }

    // Normalize: ensure it starts with "whatsapp:+91..." or "whatsapp:+..."
    let normalized = whatsappNumber.trim();
    if (!normalized.startsWith("whatsapp:")) {
      // Strip any non-digit chars except leading +
      const digitsOnly = normalized.replace(/[^\d+]/g, "");
      normalized = `whatsapp:${digitsOnly.startsWith("+") ? digitsOnly : "+" + digitsOnly}`;
    }

    const safeEmail = email.trim().toLowerCase();
    await db.collection("users").doc(safeEmail).set(
      { whatsappNumber: normalized, updatedAt: new Date() },
      { merge: true }
    );

    console.log(`[API] ✅ WhatsApp number saved for ${safeEmail}: ${normalized}`);
    return NextResponse.json({ success: true, whatsappNumber: normalized });
  } catch (err) {
    console.error("[API] update-whatsapp error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
