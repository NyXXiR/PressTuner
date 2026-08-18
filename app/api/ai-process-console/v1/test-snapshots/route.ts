import { inspectProjectTestSnapshot } from "@/lib/services/ai-process-console/projectTestDebugService";

export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); }
  catch { input = null; }
  return Response.json(await inspectProjectTestSnapshot(input), { status: 200, headers: { "cache-control": "no-store" } });
}
