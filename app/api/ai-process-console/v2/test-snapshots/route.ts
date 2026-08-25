import { createProjectTestDebugPostHandler, PROJECT_TEST_DEBUG_SNAPSHOT_PATH } from "@/lib/services/ai-process-console/projectTestDebugRoutes.server";

export const runtime = "nodejs";
export const POST = createProjectTestDebugPostHandler(PROJECT_TEST_DEBUG_SNAPSHOT_PATH);
