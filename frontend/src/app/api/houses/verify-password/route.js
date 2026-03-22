import { NextResponse } from "next/server";
import { verifyHousePassword } from "@/app/backend";

export async function POST(req) {
  try {
    const { houseId, password } = await req.json();
    if (!houseId || !password) return NextResponse.json({ error: "houseId and password required" }, { status: 400 });
    const ok = await verifyHousePassword(houseId, password);
    return NextResponse.json({ success: ok });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
