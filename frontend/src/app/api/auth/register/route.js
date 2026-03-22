import { NextResponse } from "next/server";
import { registerUser } from "@/app/backend"; // our backend.js function

// POST /api/auth/register
export async function POST(req) {
  try {
    console.log('Auth register API route hit');
    const { email, name, role } = await req.json();
    console.log('Received data:', { email, name, role });

    if (!email || !name || !role) {
      console.log('Missing required fields:', { email: !!email, name: !!name, role: !!role });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log('Calling registerUser with:', { email, name, role });
    const user = await registerUser({ email, name, role });
    console.log('registerUser result:', user);

    return NextResponse.json({ success: true, user });
  } catch (err) {
    console.error("Error registering user:", err);
    console.error("Error stack:", err.stack);
    return NextResponse.json(
      { error: "Failed to register user" },
      { status: 500 }
    );
  }
}
