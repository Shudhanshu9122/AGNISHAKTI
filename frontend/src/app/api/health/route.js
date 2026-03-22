export async function GET() {
  console.log("Health check route hit - server is up");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}


