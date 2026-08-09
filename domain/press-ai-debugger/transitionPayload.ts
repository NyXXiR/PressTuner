import { pressCreationProcess } from "./processRegistry";
import { buildGeneratedPlain, validateSelectedReviewNotes } from "./processExecutor";

type JsonObject = Record<string, unknown>;
export type PressAttemptInput = Readonly<{ articleId: string; rawText: string; tone: "formal" | "neutral" | "friendly"; userInstruction?: string; reviewInstruction?: string; rewriteInstruction?: string; selectedNoteIds?: readonly string[] }>;

function object(value: unknown, code = "PRESS_AI_SOURCE_OUTPUT_INVALID"): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}

export function derivePressTransitionPayload(args: { edgeId: string; sourceOutput: unknown; attemptInput: PressAttemptInput; selections?: { selectedNoteIds?: readonly string[]; rewriteInstruction?: string } }): JsonObject {
  const edge = pressCreationProcess.edges.find((item) => item.id === args.edgeId);
  if (!edge) throw new Error("PRESS_AI_PROCESS_EDGE_INVALID");
  const sourceNode = pressCreationProcess.nodes.find((item) => item.id === edge.source)!;
  const output = sourceNode.outputSchema.parse(object(args.sourceOutput)) as JsonObject;
  let payload: JsonObject;
  switch (edge.id) {
    case "initialization-brief": payload = { articleId: String(output.articleId), rawText: args.attemptInput.rawText, tone: args.attemptInput.tone }; break;
    case "brief-draft": payload = { ...output, articleId: args.attemptInput.articleId }; break;
    case "draft-review": payload = { articleId: String(output.articleId), title: String(output.title), plain: typeof output.plain === "string" && output.plain.trim() ? output.plain : buildGeneratedPlain(output), ...((args.attemptInput.userInstruction ?? args.attemptInput.reviewInstruction) ? { userInstruction: (args.attemptInput.userInstruction ?? args.attemptInput.reviewInstruction)!.slice(0, 1000) } : {}) }; break;
    case "review-rewrite": {
      const notes = Array.isArray(output.notes) ? output.notes.map((note) => object(note)).filter((note): note is JsonObject & { id: string } => typeof note.id === "string") : [];
      const selectedNoteIds = validateSelectedReviewNotes(args.selections?.selectedNoteIds ?? args.attemptInput.selectedNoteIds ?? notes.map((note) => note.id), notes);
      const instruction = (args.selections?.rewriteInstruction ?? args.attemptInput.rewriteInstruction ?? "").trim().slice(0, 1000);
      if (!instruction) throw new Error("PRESS_AI_REWRITE_INSTRUCTION_REQUIRED");
      payload = { articleId: args.attemptInput.articleId, selectedNoteIds, userInstruction: instruction };
      break;
    }
    case "rewrite-review": payload = { articleId: args.attemptInput.articleId, title: String(output.title), plain: String(output.plain), ...(args.attemptInput.userInstruction ? { userInstruction: args.attemptInput.userInstruction.slice(0, 1000) } : {}) }; break;
    default: throw new Error("PRESS_AI_PROCESS_EDGE_INVALID");
  }
  return pressCreationProcess.nodes.find((item) => item.id === edge.target)!.inputSchema.parse(payload) as JsonObject;
}
