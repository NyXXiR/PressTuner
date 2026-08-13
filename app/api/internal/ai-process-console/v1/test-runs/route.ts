import { createAiProcessTestRunPostHandler } from "@/lib/services/ai-process-console/adapterRoutes.server";

export const runtime = "nodejs";

export const POST = createAiProcessTestRunPostHandler();
