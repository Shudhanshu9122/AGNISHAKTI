import { NextResponse } from "next/server";
import { verifyWithGemini } from "@/app/backend";

export async function POST(req) {
  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    const result = await verifyWithGemini({ imageUrl });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
