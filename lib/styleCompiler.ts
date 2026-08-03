// lib/styleCompiler.ts
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

// ---------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------
export type CompileMode = "FAST" | "SLOW";

export type StyleKeyword = {
  key: string;
  kind?: "tone" | "topic" | "structure" | "other";
  weight?: number; // 0~1
};

export type StyleRuleSet = {
  vocabulary?: Array<{
    from: string;
    to: string;
    explanation?: string;
  }>;
  toneHints?: Array<{
    pattern: string;
    recommendation: string;
  }>;
  boilerplates?: Array<{
    slot: "lead" | "closing" | "body";
    text: string;
    usageHint?: string;
  }>;
  banList?: string[];
  keywords?: StyleKeyword[];
  [key: string]: any;
};

export type StyleCompileResult = {
  guideId: string;
  mode: CompileMode;
  version: number;
  rules: StyleRuleSet;
};

type CompileInput = {
  guide: {
    id: string;
    name: string;
    description?: string | null;
    basePrompt?: string | null;
  };
  window: {
    mode: CompileMode;
    fromISO: string;
    toISO: string;
  };
  stats: {
    totalSignals: number;
    signalsBySource: Record<string, number>;
  };
  examples: {
    manualEdits: Array<{
      articleId: string;
      section: "title" | "lead" | "body" | "closing" | "fact" | "other";
      before: string;
      after: string;
    }>;
    feedbackVotes: Array<{
      vote: "LIKE" | "DISLIKE";
      hasComment: boolean;
      commentSnippet?: string | null;
      articleType?: string | null;
      articleStatus?: string | null;
    }>;
  };
  previousRules?: StyleRuleSet | null;
};

// ---------------------------------------------------------
// LLM Helpers
// ---------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function normalizeStyleRuleSet(raw: any): StyleRuleSet {
  const result: StyleRuleSet = {};
  const isStr = (v: any): v is string =>
    typeof v === "string" && v.trim().length > 0;

  // 1. Vocabulary
  if (Array.isArray(raw?.vocabulary)) {
    result.vocabulary = raw.vocabulary
      .map((v: any) => {
        if (!isStr(v?.from) || !isStr(v?.to)) return null;
        return {
          from: v.from.trim(),
          to: v.to.trim(),
          explanation: isStr(v?.explanation) ? v.explanation.trim() : undefined,
        };
      })
      .filter(Boolean);
  }

  // 2. Tone Hints
  if (Array.isArray(raw?.toneHints)) {
    result.toneHints = raw.toneHints
      .map((t: any) => {
        if (!isStr(t?.pattern) || !isStr(t?.recommendation)) return null;
        return {
          pattern: t.pattern.trim(),
          recommendation: t.recommendation.trim(),
        };
      })
      .filter(Boolean);
  }

  // 3. Boilerplates
  if (Array.isArray(raw?.boilerplates)) {
    result.boilerplates = raw.boilerplates
      .map((b: any) => {
        if (!isStr(b?.text)) return null;
        const slotRaw = b?.slot;
        const allowedSlots = ["lead", "body", "closing"] as const;
        const slot = allowedSlots.includes(slotRaw) ? slotRaw : undefined;
        if (!slot) return null;

        return {
          slot,
          text: b.text.trim(),
          usageHint: isStr(b?.usageHint) ? b.usageHint.trim() : undefined,
        };
      })
      .filter(Boolean);
  }

  // 4. Ban List
  if (Array.isArray(raw?.banList)) {
    result.banList = raw.banList
      .map((s: any) => (isStr(s) ? s.trim() : null))
      .filter(Boolean);
  }

  // 5. Keywords
  if (Array.isArray(raw?.keywords)) {
    const allowedKinds = ["tone", "topic", "structure", "other"] as const;
    result.keywords = raw.keywords
      .map((k: any) => {
        if (!isStr(k?.key)) return null;
        const kind = allowedKinds.includes(k?.kind) ? k.kind : "other";
        let weight: number | undefined;
        if (typeof k?.weight === "number" && !Number.isNaN(k.weight)) {
          weight = Math.min(1, Math.max(0, k.weight));
        }

        return {
          key: k.key.trim(),
          kind,
          ...(weight !== undefined ? { weight } : {}),
        };
      })
      .filter(Boolean);
  }

  return result;
}

async function callStyleGuideLLM(input: CompileInput): Promise<StyleRuleSet> {
  // ✅ [수정됨] 사용자 요구사항을 반영한 엄격한 가이드라인 프롬프트
  const system = `
You are a "Style Guide Compiler" that analyzes edit history.
Your mission is to extract ONLY **syntactic and grammatical patterns**, NEVER semantic content.

🚨 **CRITICAL RULE: NO NOUNS IN VOCABULARY**
1. **Vocabulary (Grammar & Phrasing)**:
   - Extract ONLY the **changing parts** (verb endings, particles, connectors).
   - **NEVER** include specific nouns, product names, or business logic.
   - **MAX 3-4 WORDS**: If the 'from' or 'to' contains a full sentence or a noun (e.g., "자산", "게이미피케이션"), it is a FAILURE.
   - Use placeholders if necessary, but focus on the functional change.
   - ✅ GOOD: {"from": "~한다.", "to": "~합니다.", "explanation": "Politeness change"}
   - ✅ GOOD: {"from": "특히", "to": "무엇보다도", "explanation": "Emphasis style"}
   - ❌ BAD: {"from": "자산 증대 경험을 제공한다", "to": "실질적인 자산 증대 경험을 제공합니다"} (Contains Nouns)

2. **Tone Hints (Abstract Advice)**:
   - Provide abstract linguistic advice.
   - ❌ BAD: "Use the word 'Platform' instead of 'Service'" (This is a content rule).
   - ✅ GOOD: "Avoid using double negatives," "Prefer active voice for clarity."

3. **BanList**:
   - Only for harmful writing habits (slang, repetitive fillers).
   - NEVER ban a topic or a noun.

✅ Output Format (JSON Only):
{
  "vocabulary": [ { "from": "fragment", "to": "fragment", "explanation": "..." } ],
  "toneHints": [ { "pattern": "...", "recommendation": "..." } ],
  "boilerplates": [],
  "banList": [],
  "keywords": []
}
`.trim();

  const user = `
[Input Data]
${JSON.stringify(input, null, 2)}

[Specific Instructions for this run]
1. Scan 'Manual Edits' for consistent morphological changes (e.g., changing '~다' to '~습니다' or vice versa).
2. If an edit changes a whole sentence to a different sentence, **DO NOT** add it to vocabulary. Instead, extract the **TENSE** or **POLITENESS** shift and put it in 'toneHints'.
3. **Ignore all Nouns**: Do not care about Nouns. Only care about HOW they are connected and ended. GRAMMAR is the key.
4. If there are no clear grammatical patterns, return an empty array for 'vocabulary'.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo", // gpt-4-turbo가 지시사항 이행 능력이 가장 우수함
    temperature: 0.1, // 창의성 최소화 -> 규칙 준수 강화
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = completion.choices[0].message.content;
  if (!content) throw new Error("LLM 응답이 비어 있습니다.");

  try {
    return normalizeStyleRuleSet(JSON.parse(content));
  } catch (e) {
    console.error("LLM JSON parse 실패", e);
    throw new Error("LLM JSON 파싱 실패");
  }
}

// ---------------------------------------------------------
// Main Logic (기존과 동일)
// ---------------------------------------------------------

export async function getOrCreateTeamGuide(teamId: string) {
  const existing = await prisma.styleGuide.findFirst({
    where: { teamId, isDefault: true, isArchived: false },
  });
  if (existing) return existing;

  return await prisma.styleGuide.create({
    data: {
      teamId,
      name: "Default Style Guide",
      description: "팀의 기본 스타일 가이드 (자동 생성됨)",
      basePrompt: "",
      config: {
        fastLookbackDays: 3,
        slowLookbackDays: 30,
      },
      isDefault: true,
      isArchived: false,
    },
  });
}

export async function getDefaultGuideIdForTeam(
  teamId: string,
): Promise<string | null> {
  const guide = await prisma.styleGuide.findFirst({
    where: {
      teamId,
      isDefault: true,
      isArchived: false,
    },
    select: { id: true },
  });
  return guide?.id ?? null;
}

export async function compileStyleGuide(
  guideId: string,
  mode: CompileMode,
): Promise<StyleCompileResult> {
  // 1) Atomic Lock
  const lockResult = await prisma.styleGuide.updateMany({
    where: {
      id: guideId,
      isCompiling: false,
    },
    data: {
      isCompiling: true,
    },
  });

  if (lockResult.count === 0) {
    throw new Error("ALREADY_COMPILING");
  }

  try {
    // 2) 가이드 정보 조회
    const guide = await prisma.styleGuide.findUnique({
      where: { id: guideId },
      select: {
        id: true,
        teamId: true,
        name: true,
        description: true,
        basePrompt: true,
        config: true,
      },
    });
    if (!guide) throw new Error("Guide not found");

    const cfg = (guide.config as any) ?? {};
    const lookbackDays =
      mode === "FAST"
        ? Number(cfg.fastLookbackDays ?? 3)
        : Number(cfg.slowLookbackDays ?? 30);

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - lookbackDays);

    const prevCompiled = await prisma.guideCompiled.findUnique({
      where: { guideId },
      select: { rulesJson: true, version: true },
    });

    // 3) 신호 수집
    const signals = await prisma.styleSignal.findMany({
      where: {
        guideId,
        createdAt: { gte: fromDate },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        source: true,
        weight: true,
        payload: true,
        createdAt: true,
        articleId: true,
      },
    });

    const statsBySource: Record<string, number> = {};
    for (const s of signals) {
      statsBySource[s.source] = (statsBySource[s.source] ?? 0) + 1;
    }

    const manualEdits: CompileInput["examples"]["manualEdits"] = [];
    const feedbackVotes: CompileInput["examples"]["feedbackVotes"] = [];

    for (const s of signals) {
      const payload = s.payload as any;

      // Manual Edits
      if (
        payload?.kind === "manual_edit_diff" &&
        Array.isArray(payload.diffs)
      ) {
        for (const d of payload.diffs.slice(0, 3)) {
          if (!d?.from || !d?.to) continue;
          manualEdits.push({
            articleId: s.articleId ?? "unknown",
            section: ["title", "lead", "body", "closing", "fact"].includes(
              d.field,
            )
              ? d.field
              : "other",
            before: String(d.from).slice(0, 400),
            after: String(d.to).slice(0, 400),
          });
        }
      }

      // Feedback Votes
      if (payload?.kind === "feedback_vote") {
        feedbackVotes.push({
          vote: payload.vote === "DISLIKE" ? "DISLIKE" : "LIKE",
          hasComment: !!payload.hasComment,
          commentSnippet: payload.commentSnippet ?? null,
          articleType: payload.articleType ?? null,
          articleStatus: payload.articleStatus ?? null,
        });
      }
    }

    // 4) LLM 호출
    const input: CompileInput = {
      guide: {
        id: guide.id,
        name: guide.name,
        description: guide.description,
        basePrompt: guide.basePrompt,
      },
      window: {
        mode,
        fromISO: fromDate.toISOString(),
        toISO: toDate.toISOString(),
      },
      stats: {
        totalSignals: signals.length,
        signalsBySource: statsBySource,
      },
      examples: {
        manualEdits: manualEdits.slice(0, 40),
        feedbackVotes: feedbackVotes.slice(0, 40),
      },
      previousRules: (prevCompiled?.rulesJson as any) ?? null,
    };

    const newRules = await callStyleGuideLLM(input);

    // 5) 저장 및 버전 관리
    let version = prevCompiled?.version ?? 1;
    const isChanged =
      JSON.stringify(prevCompiled?.rulesJson) !== JSON.stringify(newRules);

    if ((mode === "SLOW" && isChanged) || !prevCompiled) {
      version++;
    }

    await prisma.$transaction(async (tx) => {
      await tx.guideCompiled.upsert({
        where: { guideId },
        create: {
          guideId,
          rulesJson: newRules,
          version,
          lastSlowCompiledAt: mode === "SLOW" ? new Date() : null,
        },
        update: {
          rulesJson: newRules,
          version,
          ...(mode === "SLOW" ? { lastSlowCompiledAt: new Date() } : {}),
        },
      });

      await tx.styleGuide.update({
        where: { id: guideId },
        data: {
          isCompiling: false,
          pendingSignalCount: 0,
        },
      });
    });

    return { guideId, mode, version, rules: newRules };
  } catch (err) {
    console.error("[Compile Failed]", err);
    await prisma.styleGuide.update({
      where: { id: guideId },
      data: { isCompiling: false },
    });
    throw err;
  }
}
