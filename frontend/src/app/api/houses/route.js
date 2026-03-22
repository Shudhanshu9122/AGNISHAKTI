import { NextResponse } from "next/server";
import { createHouse, getHousesByOwnerEmail } from "@/app/backend";

export async function POST(req) {
  try {
    const { ownerEmail, address, coords, monitorPassword } = await req.json();
    console.log('Houses POST request:', { ownerEmail, address, coords, monitorPassword });
    
    const result = await createHouse({ ownerEmail, address, coords, monitorPassword });
    console.log('House created successfully:', result);
    
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error creating house:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerEmail = searchParams.get("ownerEmail");
    if (!ownerEmail) return NextResponse.json({ error: "ownerEmail required" }, { status: 400 });
    const houses = await getHousesByOwnerEmail(ownerEmail);
    return NextResponse.json({ success: true, houses });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
