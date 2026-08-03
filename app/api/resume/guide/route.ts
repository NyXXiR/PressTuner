import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

import { requireTeamContext } from "@/lib/auth";
import { assertAndLogAiPanelUsage } from "@/lib/services/aiPanelUsageService";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.PT_BRIEF_MODEL ?? "gpt-4.1-mini";

const BodySchema = z.object({
  message: z.string().min(1),
  pathname: z.string().min(1),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        body: z.string(),
      }),
    )
    .optional(),
});

const GuideSchema = z.object({
  answer: z.string(),
  links: z
    .array(
      z.object({
        label: z.string(),
        href: z.string(),
      }),
    )
    .max(2),
});

const RESUME_DOMAIN_KEYWORDS = [
  "자소서",
  "자기소개서",
  "이력서",
  "경험",
  "문항",
  "지원서",
  "브릭",
  "첨삭",
  "작성",
  "resume",
];

const GENERAL_OFFTOPIC_KEYWORDS = [
  "날씨",
  "주식",
  "코딩",
  "파이썬",
  "번역",
  "영어로",
  "수학",
  "게임",
  "맛집",
  "여행",
  "뉴스",
  "비트코인",
  "연애",
];

function isResumeDomainQuestion(message: string) {
  const text = message.toLowerCase();
  return RESUME_DOMAIN_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isOffTopicQuestion(message: string) {
  const text = message.toLowerCase();
  return GENERAL_OFFTOPIC_KEYWORDS.some((keyword) =>
    text.includes(keyword.toLowerCase()),
  );
}

function buildRuleBasedGuide(input: {
  pathname: string;
  message: string;
}): z.infer<typeof GuideSchema> | null {
  const text = input.message.toLowerCase();

  if (
    (text.includes("이력서") || text.includes("경험") || text.includes("등록")) &&
    (text.includes("어디") || text.includes("어딨") || text.includes("어디서"))
  ) {
    return {
      answer: "경험이나 이력은 경험 보관함에서 먼저 정리하면 됩니다.",
      links: [{ label: "경험 보관함", href: "/resume/bricks" }],
    };
  }

  if (
    (text.includes("자소서") || text.includes("자기소개서") || text.includes("작성")) &&
    (text.includes("어디") || text.includes("시작") || text.includes("어디서"))
  ) {
    return {
      answer: "자기소개서 작성은 작성 화면에서 바로 시작하면 됩니다.",
      links: [{ label: "자기소개서 작성", href: "/resume/write" }],
    };
  }

  if (text.includes("뭐부터") || text.includes("무엇부터") || text.includes("다음")) {
    if (input.pathname === "/resume" || input.pathname === "/resume/dashboard") {
      return {
        answer: "처음이라면 경험 보관함에서 경험을 정리한 뒤 작성 화면으로 넘어가는 순서가 가장 자연스럽습니다.",
        links: [
          { label: "경험 보관함", href: "/resume/bricks" },
          { label: "자기소개서 작성", href: "/resume/write" },
        ],
      };
    }

    if (input.pathname.startsWith("/resume/bricks")) {
      return {
        answer: "경험 정리가 됐다면 이제 작성 화면에서 문항에 맞게 연결해보면 됩니다.",
        links: [{ label: "자기소개서 작성", href: "/resume/write" }],
      };
    }

    if (input.pathname.startsWith("/resume/write")) {
      return {
        answer: "지금은 작성 흐름 안입니다. 회사와 문항을 정리한 뒤 전략 설계와 문항별 작성으로 이어가면 됩니다.",
        links: [],
      };
    }
  }

  if (isOffTopicQuestion(input.message) && !isResumeDomainQuestion(input.message)) {
    return {
      answer:
        "이 패널은 자기소개서 작성, 경험 정리, 문항 관리, 페이지 안내처럼 현재 이력서 워크스페이스와 관련된 요청만 처리합니다.",
      links: [],
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    await assertAndLogAiPanelUsage({
      teamId: team.id,
      userId: user.id,
      scope: "resume:guide",
      meta: {
        pathname: parsed.data.pathname,
        messageLength: parsed.data.message.length,
      },
    });

    const localResult = buildRuleBasedGuide({
      pathname: parsed.data.pathname,
      message: parsed.data.message,
    });
    if (localResult) {
      return NextResponse.json({ ok: true, data: localResult });
    }

    const completion = await openai.chat.completions.parse({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `
You are a navigation assistant for a Korean resume SaaS.

Your job:
- Answer briefly in Korean.
- Recommend the most useful page or two from the route catalog.
- If the user asks where to register experiences or career history, point them to /resume/bricks and label it "경험 보관함".
- If the user asks to start or continue a cover letter, point them to /resume/write or /resume/applications.
- If the user asks what to do next, use the current pathname as context and suggest the next logical page.
- Recent conversation is provided. Use it to resolve short follow-ups like "그거 말고", "아까 말한 곳", "이어서 하려면?".
- Do not mention routes that are not in the catalog.

Route catalog:
- /resume/dashboard : 이력서 대시보드
- /resume/write : 자기소개서 작성 시작/진행
- /resume/applications : 저장된 지원서 목록
- /resume/bricks : 경험 보관함
- /resume/questions : 문항 관리
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            pathname: parsed.data.pathname,
            message: parsed.data.message,
            recentMessages: parsed.data.recentMessages ?? [],
          }),
        },
      ],
      response_format: zodResponseFormat(GuideSchema, "resume_guide"),
      temperature: 0.2,
    });

    const result = completion.choices[0].message.parsed ?? {
      answer: "현재 화면 기준으로 다음 이동 경로를 제안합니다.",
      links: [{ label: "이력서 대시보드", href: "/resume/dashboard" }],
    };

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    console.error("Resume guide error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_GUIDE_FAILED",
      error?.message ?? "Failed to answer resume guide question",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
