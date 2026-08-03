// prisma/seed.ts
import {
  PrismaClient,
  PlanType,
  TeamRole,
  ArticleStatus,
  ArticleType,
  FeedbackVote,
  UsageAction,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // --- 팀 생성 ---
  const teamPress = await prisma.team.create({
    data: {
      slug: "press-team",
      name: "보도자료팀",
      plan: PlanType.FREE,
      credits: 1000,
      model: "gpt-4.1-mini",
      feedbackEnabled: true,
    },
  });

  const teamMarketing = await prisma.team.create({
    data: {
      slug: "marketing-team",
      name: "마케팅팀",
      plan: PlanType.PRO,
      credits: 5000,
      model: "gpt-4.1-mini",
      feedbackEnabled: true,
    },
  });

  // --- 유저 생성 ---
  const user1 = await prisma.user.create({
    data: {
      loginId: "editor1",
      label: "에디터 1",
      password: "password-editor1", // 실제에선 해시 필요
    },
  });

  const user2 = await prisma.user.create({
    data: {
      loginId: "editor2",
      label: "에디터 2",
      password: "password-editor2",
    },
  });

  const user3 = await prisma.user.create({
    data: {
      loginId: "manager1",
      label: "매니저 1",
      password: "password-manager1",
    },
  });

  // --- 팀 멤버십 (many-to-many) ---
  await prisma.teamMember.createMany({
    data: [
      { teamId: teamPress.id, userId: user1.id, role: TeamRole.OWNER },
      { teamId: teamPress.id, userId: user2.id, role: TeamRole.MEMBER },
      { teamId: teamMarketing.id, userId: user2.id, role: TeamRole.ADMIN },
      { teamId: teamMarketing.id, userId: user3.id, role: TeamRole.OWNER },
    ],
  });

  // --- 팀 스타일 가이드(새 모델: StyleGuide) ---
  const pressGuideDefault = await prisma.styleGuide.create({
    data: {
      teamId: teamPress.id,
      name: "기본 가이드",
      description: "제목은 간결하게, 본문은 3단락 이내 권장.",
      isArchived: false,
      isDefault: true,
      basePrompt:
        "보도자료팀 기본 톤을 따르세요. 감정 배제, 사실 위주, 문장 종결은 '~다'.",
      config: {},
    },
  });

  // 마케팅팀은 가이드를 2개 만들어 다중 가이드 UX 확인
  const marketingGuideDefault = await prisma.styleGuide.create({
    data: {
      teamId: teamMarketing.id,
      name: "마케팅 기본",
      description: "친근한 톤, 이모지 사용 허용.",
      isArchived: false,
      isDefault: true,
      basePrompt:
        "친근하고 캐주얼한 톤을 우선하며, 필요 시 적절한 이모지를 허용한다.",
      config: {},
    },
  });

  const marketingGuideAlt = await prisma.styleGuide.create({
    data: {
      teamId: teamMarketing.id,
      name: "캠페인/프로모션용",
      description: "CTA 강조, 혜택 수치 전면 배치.",
      isArchived: false,
      isDefault: false,
      basePrompt:
        "프로모션/캠페인 문서용 톤. CTA 강조, 수치/혜택을 문서 상단에 배치.",
      config: { threshold: 5.0, decayRate: 0.05 },
    },
  });

  // --- 초기 컴파일 결과(옵션) ---
  await prisma.guideCompiled.createMany({
    data: [
      {
        guideId: pressGuideDefault.id,
        rulesJson: { vocabulary: [], tone: [], banList: [] },
        version: 1,
      },
      {
        guideId: marketingGuideDefault.id,
        rulesJson: { vocabulary: [], tone: [], banList: [] },
        version: 1,
      },
      {
        guideId: marketingGuideAlt.id,
        rulesJson: { vocabulary: [], tone: [], banList: [] },
        version: 1,
      },
    ],
  });

  // --- 예시 기사(ExampleArticle) ---
  await prisma.exampleArticle.createMany({
    data: [
      {
        teamId: teamPress.id,
        title: "신제품 출시 보도자료 예시",
        body: "이곳은 신제품 출시 보도자료 예시 본문입니다.",
        source: "generated",
      },
      {
        teamId: teamMarketing.id,
        title: "캠페인 런칭 블로그 예시",
        body: "이곳은 캠페인 런칭 블로그 예시 본문입니다.",
        source: "generated",
      },
    ],
  });

  // --- 실제 Article (PressExtra 분리) ---
  // 보도자료팀 문서
  const article1 = await prisma.article.create({
    data: {
      teamId: teamPress.id,
      userId: user1.id,
      status: ArticleStatus.DRAFT,
      type: ArticleType.PRESS_RELEASE,
      title: "brieFFlow 베타 출시 보도자료",
      bodyJson: {
        paragraphs: [
          {
            text: "brieFFlow 보도자료 작성을 돕는 AI 도구입니다.",
            importance: 1,
          },
          {
            text: "팀별 스타일 가이드 기반으로 일관된 톤을 유지합니다.",
            importance: 1,
          },
        ],
        closing: "자세한 문의는 PR팀으로 연락 바랍니다.",
      },
      rawInput: "신규 AI 보도자료 도구 출시 내용 정리",
    },
  });

  // PressExtra 생성 (lead/fact는 여기)
  await prisma.pressExtra.create({
    data: {
      articleId: article1.id,
      lead: "brieFFlow가 베타 서비스를 시작합니다.",
      fact: "2025년 1월 베타 시작, 초기 고객 10팀 확보",
    },
  });

  // 마케팅팀 문서(블로그)
  const article2 = await prisma.article.create({
    data: {
      teamId: teamMarketing.id,
      userId: user2.id,
      status: ArticleStatus.IN_PROGRESS,
      type: ArticleType.BLOG_POST,
      title: "brieFFlow 활용 사례 정리",
      bodyJson: {
        paragraphs: [
          {
            text: "여러 스타트업 팀들이 brieFFlow로 보도자료를 자동화하고 있습니다.",
            importance: 1,
          },
        ],
        closing: "다음 글에서는 캠페인 효과를 정량 분석합니다.",
      },
    },
  });

  // --- 피드백(Feedback) ---
  await prisma.feedback.createMany({
    data: [
      {
        teamId: teamPress.id,
        articleId: article1.id,
        userId: user2.id,
        vote: FeedbackVote.LIKE,
        comment: "톤이 전체적으로 적절합니다.",
      },
      {
        teamId: teamMarketing.id,
        articleId: article2.id,
        userId: user3.id,
        vote: FeedbackVote.DISLIKE,
        comment: "좀 더 구체적인 숫자 사례가 있으면 좋겠습니다.",
      },
    ],
  });

  // --- FeedbackBlock 예시: 보도자료팀에서 user2 피드백 제외 ---
  await prisma.feedbackBlock.create({
    data: {
      teamId: teamPress.id,
      userId: user2.id,
      reason: "테스트용 피드백 제외 설정",
    },
  });

  // --- UsageLog 예시 (ENUM 사용) ---
  await prisma.usageLog.createMany({
    data: [
      {
        teamId: teamPress.id,
        userId: user1.id,
        action: UsageAction.GENERATE_ARTICLE,
        model: "gpt-4.1-mini",
        inputTokens: 1200,
        outputTokens: 800,
        totalTokens: 2000,
        cost: 10,
        targetId: article1.id,
        meta: { note: "초안 생성" },
      },
      {
        teamId: teamMarketing.id,
        userId: user2.id,
        action: UsageAction.REFINE_ARTICLE,
        model: "gpt-4.1-mini",
        inputTokens: 800,
        outputTokens: 400,
        totalTokens: 1200,
        cost: 3,
        targetId: article2.id,
        meta: { note: "문장 다듬기" },
      },
    ],
  });

  console.log("✅ Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
