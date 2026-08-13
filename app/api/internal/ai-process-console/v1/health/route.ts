import { createAiProcessConsoleHealthGetHandler } from "@/lib/services/ai-process-console/adapterRoutes.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createAiProcessConsoleHealthGetHandler();
