export const metadata = {
  title: "사용법 안내 | brieFFlow",
  description: "brieFFlow 자기소개서 작성 흐름을 간단히 안내합니다.",
};

export default function ResumeAboutPage() {
  return (
    <div className="theme-resume mx-auto w-full max-w-5xl px-6 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          사용법 안내
        </h1>
        <p className="text-muted-foreground">
          경험 브릭을 쌓고, 문항을 입력하면 AI가 맞춤 답변을 생성합니다.
        </p>
      </header>

      <section className="mt-10 grid gap-6 md:grid-cols-3">
        <div className="border border-border bg-card/60 p-6">
          <div className="text-xs font-bold text-primary mb-2">STEP 1</div>
          <h2 className="text-lg font-semibold">경험 브릭 쌓기</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            PDF 이력서를 업로드하거나 직접 입력하여 경험을 브릭 단위로
            저장합니다.
          </p>
        </div>

        <div className="border border-border bg-card/60 p-6">
          <div className="text-xs font-bold text-primary mb-2">STEP 2</div>
          <h2 className="text-lg font-semibold">문항/공고 입력</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            기업 정보와 채용 공고, 자기소개서 문항을 입력합니다.
          </p>
        </div>

        <div className="border border-border bg-card/60 p-6">
          <div className="text-xs font-bold text-primary mb-2">STEP 3</div>
          <h2 className="text-lg font-semibold">맞춤 답변 생성</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            AI가 브릭을 매칭해 문항별 답변을 생성하고 첨삭까지 제공합니다.
          </p>
        </div>
      </section>

      <section className="mt-10 border border-border bg-card/60 p-6">
        <h3 className="text-lg font-semibold">요약</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          PDF/직접 입력으로 브릭을 만들고, 공고/문항을 입력하면 AI가 결과물을
          리턴합니다. 이후에는 첨삭과 다듬기를 통해 최종 답변을 완성하세요.
        </p>
      </section>
    </div>
  );
}
