export async function POST() {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}
