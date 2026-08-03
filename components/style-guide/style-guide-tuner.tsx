"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { useStyleGuideStore } from "@/stores/useStyleGuideStore";
import { z } from "zod"; // ✅ zod import
import { validate, V } from "@/lib/utils/validate"; // ✅ validate 유틸 import
import {
  Type,
  AlignLeft,
  MessageSquare,
  Ban,
  Plus,
  X,
  Sparkles,
  User,
  Info,
  ChevronDown,
  Save,
  LayoutTemplate,
  Globe,
  ArrowDown,
  Loader2,
  CheckCircle2,
  Regex,
} from "lucide-react";

// --- Types ---
type SectionType = "global" | "title" | "body" | "closing";

// --- [추가] 검증 스키마 정의 ---
// 1. 어휘 규칙: "A -> B" 형식 체크
const VocabRuleSchema = z.object({
  rule: z.string().refine((val) => val.includes("->"), {
    message: "어휘 규칙은 '원본 -> 변경' 형식이어야 합니다. (예: 금일 -> 오늘)",
  }),
});

// 2. 일반 규칙 (톤앤매너, 상용구 등): 길이 제한
const GeneralRuleSchema = z.object({
  rule: V.required("규칙 내용").max(
    200,
    "규칙 내용은 최대 200자까지 입력 가능합니다."
  ),
});

// 3. 금지어: 너무 길지 않게
const BanRuleSchema = z.object({
  word: V.required("금지어").max(30, "금지어는 최대 30자까지만 가능합니다."),
});

interface StyleGuideTunerProps {
  onSave: () => void;
  readOnly?: boolean;
}

export default function StyleGuideTuner({
  onSave,
  readOnly = false,
}: StyleGuideTunerProps) {
  const [activeSection, setActiveSection] = useState<SectionType>("global");

  const {
    rules,
    isSaving,
    addBanWord,
    removeBanWord,
    addToneRule,
    removeToneRule,
    addVocabRule,
    removeVocabRule,
    addBoilerplate,
    removeBoilerplate,
  } = useStyleGuideStore();

  // --- Rule Organization Helpers ---
  const { globalRules, bodyRules, leadRules, closingRules, counts } =
    useMemo(() => {
      const sortRules = <T,>(arr: T[] | undefined) =>
        [...(arr || [])].sort(
          (a: any, b: any) => (b.isManual ? 1 : 0) - (a.isManual ? 1 : 0)
        );

      const gRules = {
        tone: sortRules(rules.toneHints),
        ban: rules.banList || [],
        keywords: sortRules(rules.keywords),
      };

      const bRules = {
        vocab: sortRules(rules.vocabulary),
        boilerplateBody: sortRules(
          (rules.boilerplates || []).filter((b) => b.slot === "body")
        ),
      };

      const lRules = {
        boilerplateLead: sortRules(
          (rules.boilerplates || []).filter((b) => b.slot === "lead")
        ),
      };

      const cRules = {
        boilerplateClosing: sortRules(
          (rules.boilerplates || []).filter((b) => b.slot === "closing")
        ),
      };

      const counts = {
        global: gRules.tone.length + gRules.ban.length,
        title: lRules.boilerplateLead.length,
        body: bRules.vocab.length + bRules.boilerplateBody.length,
        closing: cRules.boilerplateClosing.length,
      };

      return {
        globalRules: gRules,
        bodyRules: bRules,
        leadRules: lRules,
        closingRules: cRules,
        counts,
      };
    }, [rules]);

  // --- Handlers ---
  const handleAddRule = (section: string, value: string) => {
    if (readOnly) return;

    // 1. 어휘 규칙 검증
    if (section === "vocab") {
      const { success, errors } = validate(VocabRuleSchema, { rule: value });
      if (!success && errors) {
        alert(Object.values(errors)[0]);
        return;
      }

      const [from, to] = value.split("->").map((s) => s.trim());
      if (from && to) {
        addVocabRule(from, to);
      } else {
        alert("원본 단어와 변경할 단어를 모두 입력해주세요.");
      }
      return;
    }

    // 2. 금지어 검증
    if (section === "ban") {
      const { success, errors } = validate(BanRuleSchema, { word: value });
      if (!success && errors) {
        alert(Object.values(errors)[0]);
        return;
      }
      addBanWord(value);
      return;
    }

    // 3. 나머지 일반 규칙 검증 (톤앤매너, 상용구)
    const { success, errors } = validate(GeneralRuleSchema, { rule: value });
    if (!success && errors) {
      alert(Object.values(errors)[0]);
      return;
    }

    if (section === "tone") addToneRule(value);
    if (section === "lead") addBoilerplate("lead", value);
    if (section === "body") addBoilerplate("body", value);
    if (section === "closing") addBoilerplate("closing", value);
  };

  // --- UI Configuration ---
  const navItems: {
    id: SectionType;
    label: string;
    icon: any;
    desc: string;
  }[] = [
    { id: "global", label: "전체 설정", icon: Globe, desc: "톤앤매너, 금지어" },
    { id: "title", label: "제목/도입", icon: Type, desc: "리드문 패턴" },
    { id: "body", label: "본문", icon: AlignLeft, desc: "어휘, 본문 문구" },
    {
      id: "closing",
      label: "맺음말",
      icon: MessageSquare,
      desc: "마무리 문구",
    },
  ];

  const activeItem = navItems.find((n) => n.id === activeSection);
  const ActiveIcon = activeItem?.icon;

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-background">
      {/* 1. Mobile Navigation */}
      <div className="lg:hidden shrink-0 border-b border-border bg-background sticky top-0 z-30 overflow-x-auto scrollbar-hide">
        <div className="flex p-2 min-w-max">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium mr-2 transition-all",
                activeSection === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Desktop Left Panel */}
      <div className="hidden lg:flex w-[380px] xl:w-[420px] shrink-0 border-r border-border bg-muted/5 flex-col items-center py-8 px-6 overflow-y-auto">
        <div className="w-full max-w-[340px] sticky top-4">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-foreground">
            <LayoutTemplate size={20} className="text-primary" />
            영역 선택
          </h2>

          <div className="flex flex-col gap-4">
            <div className="aspect-[1/1.4] bg-card border border-border p-6 flex flex-col gap-3 relative transition-all duration-500 overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border/.4)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border/.4)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={clsx(
                    "relative w-full border-2 p-3 text-left transition-all duration-200 group hover:-translate-y-0.5",
                    item.id === "body" ? "flex-1" : "h-auto",
                    activeSection === item.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 z-10"
                      : "border-dashed border-border/60 bg-muted/30 hover:border-primary/40 hover:bg-background/80"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx(
                          "p-1.5 rounded transition-colors",
                          activeSection === item.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:text-primary"
                        )}
                      >
                        <item.icon size={14} />
                      </div>
                      <span
                        className={clsx(
                          "text-sm font-bold",
                          activeSection === item.id
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                    {counts[item.id] > 0 && (
                      <span className="text-[10px] font-mono bg-muted-foreground/10 text-muted-foreground px-1.5 rounded">
                        {counts[item.id]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-8 opacity-80">
                    {item.desc}
                  </p>
                </button>
              ))}
            </div>

            <div className="bg-primary/5 border border-primary/10 text-primary text-xs p-4 flex gap-3 leading-relaxed">
              <Info size={16} className="shrink-0 mt-0.5" />
              <p>
                왼쪽 문서 영역을 클릭하면 해당 부분에 적용되는 AI 규칙을{" "}
                {readOnly ? "확인할" : "편집할"} 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
        {/* Editor Header */}
        <div className="shrink-0 h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur z-20">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 bg-primary/10 text-primary">
              {ActiveIcon && <ActiveIcon size={18} />}
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {activeItem?.label} 규칙 {readOnly ? "조회" : "편집"}
              </h2>
            </div>
          </div>
          <div className="hidden sm:block text-xs text-muted-foreground">
            {activeSection === "global" &&
              "전체 문서에 적용되는 기본 규칙입니다."}
            {activeSection === "title" && "제목과 첫 문단에 주로 적용됩니다."}
            {activeSection === "body" &&
              "본문 작성 시 어휘와 표현을 교정합니다."}
            {activeSection === "closing" &&
              "마지막 문단 및 맺음말에 적용됩니다."}
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-10 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-10 pb-20">
            {/* --- GLOBAL SECTION --- */}
            {activeSection === "global" && (
              <>
                <SectionBlock
                  title="AI 톤앤매너 (Tone & Manner)"
                  icon={Sparkles}
                  description="문서 전체의 분위기와 어투를 결정합니다."
                >
                  <div className="grid gap-3 grid-cols-1">
                    {globalRules.tone.map((rule: any, idx: number) => (
                      <ToneCard
                        key={idx}
                        rule={rule}
                        onDelete={() => removeToneRule(idx)}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                  {!readOnly && (
                    <QuickAddForm
                      placeholder="예: '친근한 어투보다는 전문적인 용어를 사용해'"
                      onAdd={(v) => handleAddRule("tone", v)}
                    />
                  )}
                </SectionBlock>

                <SectionBlock
                  title="금지어 필터링"
                  icon={Ban}
                  description="AI가 절대 사용하지 말아야 할 단어들입니다."
                >
                  <div className="flex flex-wrap items-center gap-2 p-4 bg-muted/20 border border-border min-h-[3.5rem]">
                    {globalRules.ban.map((word: string, idx: number) => (
                      <span
                        key={idx}
                        className="group flex items-center gap-1 pl-3 pr-2 py-1.5 bg-card border border-border text-sm text-foreground hover:border-red-300 transition-colors cursor-default"
                      >
                        {word}
                        {!readOnly && (
                          <button
                            onClick={() => removeBanWord(word)}
                            className="text-muted-foreground hover:text-red-500 p-0.5 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}

                    {globalRules.ban.length === 0 && (
                      <span className="text-sm text-muted-foreground/60 py-1 px-1">
                        등록된 금지어가 없습니다.
                      </span>
                    )}

                    {!readOnly && (
                      <QuickAddInline onAdd={(v) => handleAddRule("ban", v)} />
                    )}
                  </div>
                </SectionBlock>
              </>
            )}

            {/* --- TITLE SECTION --- */}
            {activeSection === "title" && (
              <SectionBlock
                title="리드문(도입부) 상용구"
                icon={Type}
                description="기사나 글의 시작 부분에 자주 쓰이는 패턴입니다."
              >
                <div className="grid gap-3 sm:grid-cols-1">
                  {leadRules.boilerplateLead.map((b: any, idx: number) => (
                    <BoilerplateCard
                      key={idx}
                      item={b}
                      onDelete={() => removeBoilerplate(b)}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
                {!readOnly && (
                  <QuickAddForm
                    placeholder="도입부에 자주 쓰는 문구 입력..."
                    onAdd={(v) => handleAddRule("lead", v)}
                  />
                )}
              </SectionBlock>
            )}

            {/* --- BODY SECTION --- */}
            {activeSection === "body" && (
              <>
                <SectionBlock
                  title="어휘 교정 (Vocabulary)"
                  icon={AlignLeft}
                  description="특정 단어를 우리 팀 스타일에 맞게 자동으로 변경합니다."
                >
                  <div className="grid gap-3 grid-cols-1">
                    {bodyRules.vocab.map((v: any, idx: number) => (
                      <VocabCard
                        key={idx}
                        item={v}
                        onDelete={() => removeVocabRule(idx)}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                  {bodyRules.vocab.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground bg-muted/10 border border-dashed">
                      등록된 어휘 교정 규칙이 없습니다.
                    </div>
                  )}
                  {!readOnly && (
                    <QuickAddForm
                      placeholder="예: '금일 -> 오늘' (화살표로 구분)"
                      onAdd={(v) => handleAddRule("vocab", v)}
                    />
                  )}
                </SectionBlock>

                <SectionBlock
                  title="본문 삽입 상용구"
                  icon={LayoutTemplate}
                  description="문의처, 주의사항 등 본문 중간에 반복적으로 포함되는 고정 문구입니다."
                >
                  <div className="grid gap-3">
                    {bodyRules.boilerplateBody.map((b: any, idx: number) => (
                      <BoilerplateCard
                        key={idx}
                        item={b}
                        onDelete={() => removeBoilerplate(b)}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                  {!readOnly && (
                    <QuickAddForm
                      placeholder="본문 삽입 상용구 추가..."
                      onAdd={(v) => handleAddRule("body", v)}
                    />
                  )}
                </SectionBlock>
              </>
            )}

            {/* --- CLOSING SECTION --- */}
            {activeSection === "closing" && (
              <SectionBlock
                title="맺음말 패턴"
                icon={MessageSquare}
                description="글을 마무리할 때 사용하는 표준 문구입니다."
              >
                <div className="grid gap-3">
                  {closingRules.boilerplateClosing.map(
                    (b: any, idx: number) => (
                      <BoilerplateCard
                        key={idx}
                        item={b}
                        onDelete={() => removeBoilerplate(b)}
                        readOnly={readOnly}
                      />
                    )
                  )}
                </div>
                {!readOnly && (
                  <QuickAddForm
                    placeholder="맺음말 문구 추가..."
                    onAdd={(v) => handleAddRule("closing", v)}
                  />
                )}
              </SectionBlock>
            )}
          </div>
        </div>

        {/* Floating Save Bar */}
        {!readOnly && (
          <div className="shrink-0 p-4 border-t border-border bg-background/80 backdrop-blur flex items-center justify-between gap-4 z-40">
            <div className="text-xs text-muted-foreground hidden sm:block">
              <span className="font-bold text-primary">Tip:</span> 규칙을
              추가/삭제한 뒤에는 반드시 저장을 눌러주세요.
            </div>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex-1 sm:flex-none sm:w-40 h-10 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {isSaving ? "저장 중..." : "변경사항 저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub Components ---

function SectionBlock({ title, icon: Icon, description, children }: any) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="border-b border-border pb-2 mb-4">
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Icon className="text-primary" size={20} />
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 ml-7">
            {description}
          </p>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ToneCard({
  rule,
  onDelete,
  readOnly,
}: {
  rule: any;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      onClick={() => setIsOpen(!isOpen)}
      className={clsx(
        "pt-surface cursor-pointer p-4 transition-all duration-200 relative group",
        isOpen
          ? "border-primary/50 ring-1 ring-primary/10 bg-card"
          : "pt-surface-hover"
      )}
    >
      {!readOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 p-1.5 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all z-10"
          title="규칙 삭제"
        >
          <X size={14} />
        </button>
      )}

      <div className="flex items-start justify-between gap-8 pr-6">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-primary/10 text-primary shrink-0">
              <Sparkles size={12} />
            </span>
            {rule.isManual && (
              <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 rounded py-0.5">
                USER
              </span>
            )}
            <span className="font-semibold text-sm text-foreground">
              {rule.recommendation}
            </span>
          </div>
        </div>
        {!isOpen && (
          <ChevronDown size={16} className="text-muted-foreground/50" />
        )}
      </div>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-border animate-in fade-in slide-in-from-top-1 duration-200 pl-6">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Regex size={12} />
              감지 패턴 (Trigger)
            </div>
            <div className="p-3 bg-muted/40 border border-border font-mono text-xs text-muted-foreground break-all">
              {rule.pattern}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1">
              * 위 패턴이나 문구가 발견되면 AI가 설정된 어조로 교정합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function BoilerplateCard({
  item,
  onDelete,
  readOnly,
}: {
  item: any;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className={clsx(
        "pt-surface group relative p-4 transition-all duration-200 flex gap-4",
        item.isManual ? "border-primary/30 bg-primary/5" : "pt-surface-hover"
      )}
    >
      <div className="text-2xl font-serif text-muted-foreground/30 leading-none pt-1">
        “
      </div>
      <div className="flex-1 space-y-1 pr-6">
        <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-wrap">
          {item.text}
        </p>
        {item.usageHint && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info size={10} /> {item.usageHint}
          </p>
        )}
      </div>

      {item.isManual && (
        <div className="absolute top-2 right-8 text-primary/40">
          <User size={12} />
        </div>
      )}

      {!readOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all"
          title="삭제"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function VocabCard({
  item,
  onDelete,
  readOnly,
}: {
  item: any;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const mainTitle = item.explanation || `${item.from} → ${item.to}`;

  return (
    <div
      onClick={() => setIsOpen(!isOpen)}
      className={clsx(
        "pt-surface cursor-pointer p-4 transition-all duration-200 relative group",
        isOpen
          ? "border-primary/50 ring-1 ring-primary/10 bg-card"
          : "pt-surface-hover"
      )}
    >
      {!readOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 p-1.5 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all z-10"
        >
          <X size={14} />
        </button>
      )}

      <div className="flex items-start justify-between gap-8 pr-6">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded bg-primary/10 text-primary shrink-0">
            <AlignLeft size={12} />
          </span>
          <span className="font-semibold text-sm text-foreground">
            {mainTitle}
          </span>
        </div>
        {!isOpen && (
          <ChevronDown size={16} className="text-muted-foreground/50" />
        )}
      </div>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-border animate-in fade-in pl-6 flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
            <CheckCircle2 size={12} />
            적용 예시
          </div>

          <div className="flex flex-col gap-2">
            <div className="p-3 bg-red-50 border border-red-100 dark:bg-red-950/40 dark:border-red-900/50">
              <div className="text-[10px] font-bold text-red-500/80 uppercase mb-1">
                Before
              </div>
              <p className="text-sm text-muted-foreground line-through decoration-red-500/30">
                {item.from}
              </p>
            </div>

            <div className="flex justify-center -my-1 z-10">
              <ArrowDown
                size={14}
                className="text-muted-foreground/40 bg-card p-0.5"
              />
            </div>

            <div className="p-3 bg-primary/5 border border-primary/10 dark:bg-primary/10 dark:border-primary/20">
              <div className="text-[10px] font-bold text-primary/80 uppercase mb-1">
                After
              </div>
              <p className="text-sm font-bold text-foreground">{item.to}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAddForm({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (val: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onAdd(value);
      setValue("");
      setIsExpanded(false);
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full py-3 border border-dashed border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
      >
        <Plus size={16} /> 새 규칙 추가하기
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pt-surface p-4 border-primary/40 ring-4 ring-primary/5 animate-in zoom-in-95 duration-200"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-bold text-primary">규칙 입력</span>
        <button type="button" onClick={() => setIsExpanded(false)}>
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full bg-muted/50 border border-border p-3 mb-3 resize-none text-sm focus:outline-none focus:border-primary"
        placeholder={placeholder}
        rows={2}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-medium disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </form>
  );
}

function QuickAddInline({ onAdd }: { onAdd: (v: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (val.trim()) {
      onAdd(val);
      setVal("");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={submit} className="flex items-center gap-1">
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="text-sm bg-background border border-primary/50 rounded px-2 py-1 w-24 focus:outline-none"
        />
        <button
          type="submit"
          className="text-xs bg-primary text-white px-2 py-1 rounded"
        >
          V
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="text-xs text-muted-foreground hover:text-red-500"
        >
          <X size={12} />
        </button>
      </form>
    );
  }
  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
    >
      <Plus size={12} /> 단어 추가
    </button>
  );
}
