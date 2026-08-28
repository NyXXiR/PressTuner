"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, ClipboardCheck, Copy, Edit3, Eye, EyeOff, FileText, FileUp, GripVertical, LayoutTemplate, MoreHorizontal, Plus, Printer, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { Reorder, useDragControls, type DragControls } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addCustomSection,
  addRoleCustomSection,
  addSharedSection,
  clearDocumentItemSetting,
  clearRoleProfileItemSetting,
  createRoleProfile,
  createSupportVariant,
  deleteCustomSection,
  deleteRoleProfile,
  deleteRoleCustomSection,
  deleteSupportVariant,
  deleteSharedSection,
  duplicateVariant,
  formatItemPeriod,
  inspectResumeReadiness,
  linkExperienceBricks,
  narrativeCharacterCount,
  narrativePlainText,
  orderResumeSections,
  promoteRoleCustomSectionToShared,
  promoteSupportCustomSectionToShared,
  resolveDocumentRole,
  resolveSection,
  resolveSectionTitle,
  resetRoleProfileSectionToShared,
  resetSupportVariantSectionToRole,
  updateDocumentItemSetting,
  updateCustomSection,
  updateRoleCustomSection,
  updateRoleProfile,
  updateRoleProfileItemSetting,
  updateRoleProfileSectionSetting,
  updateRoleProfileSectionOrder,
  updateSectionOrder,
  updateSectionSetting,
  updateSharedSection,
  updateSharedSectionOrder,
  updateSharedSectionTitle,
  type ExperienceBrickReference,
  type EligibilityContent,
  type IdentityContent,
  type ItemContent,
  type ItemMode,
  type ItemsContent,
  type NarrativeContent,
  type NarrativeBlock,
  type NarrativeBlockType,
  type NarrativeRun,
  type ResumeDocumentState,
  type ResumeReadinessIssue,
  type ResumeRoleProfile,
  type ResumeSection,
  type SectionContent,
  type SectionKind,
  type SectionLayout,
  type SectionMode,
  type TagsContent,
} from "@/domain/resume-documents/model";
import { DateInput } from "@/components/ui/DateInput";
import { formatDateOnly } from "@/components/ui/dateOnly";
import { applyResumeImportCommand, type ResumeDocumentImportCommand } from "@/domain/resume-documents/importCandidate";
import { ResumeDocumentImportPanel } from "@/components/resume/ResumeDocumentImportPanel";
import { ResumePdfPreviewDialog } from "@/components/resume/ResumePdfPreviewDialog";
import {
  ResumeEditorHeader,
  ResumeEditorSection,
} from "@/components/resume/ResumeEditorDocument";
import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import {
  calculateAutomaticCareerDurationMonths,
  normalizeCareerDurationOverride,
} from "@/domain/resume-documents/experiencePresentation";
import { useResumeDocumentPersistence } from "@/components/resume/useResumeDocumentPersistence";
import { ResumeItemDateFields } from "@/components/resume/ResumeItemDateFields";
import { findResumeItemDateIssue, normalizeResumeItemDates, resolveResumeItemKind } from "@/domain/resume-documents/itemDatePolicy";

const roleModes: Record<SectionMode, string> = { inherit: "공통 정보 사용", override: "이 직군용 재작성", hidden: "이 직군에서 숨김" };
const sectionKindGuidance: Record<SectionKind, string> = {
  identity: "연락처와 기본 정보를 한눈에 보여주는 프로필 형식",
  eligibility: "병역·보훈·장애·취업보호 정보를 정리하는 자격 형식",
  narrative: "문단 중심으로 소개와 핵심역량을 설명하는 글 형식",
  items: "기간과 항목을 나란히 정리하는 경력·학력 형식",
  tags: "짧은 키워드를 모아 빠르게 훑어보는 역량 형식",
};
type SectionTemplateCategory = "recommended" | "career" | "content" | "basic";
type SectionTemplate = {
  id: string;
  category: SectionTemplateCategory;
  title: string;
  defaultTitle: string;
  description: string;
  kind: SectionKind;
  layout: SectionLayout;
};
const sectionTemplateCategories: Array<{ id: "all" | SectionTemplateCategory; label: string }> = [
  { id: "all", label: "전체" },
  { id: "recommended", label: "추천" },
  { id: "career", label: "경력·성과" },
  { id: "content", label: "소개·역량" },
  { id: "basic", label: "기본정보" },
];
const sectionTemplates: SectionTemplate[] = [
  { id: "highlight-grid", category: "recommended", title: "2열 핵심역량 카드", defaultTitle: "핵심 역량", description: "두 개씩 묶인 사각 카드로 강점과 설명을 상단에서 강조합니다.", kind: "items", layout: "highlight-grid" },
  { id: "introduction", category: "recommended", title: "소개글", defaultTitle: "소개", description: "지원 동기, 강점, 일하는 방식을 문단으로 설명합니다.", kind: "narrative", layout: "standard" },
  { id: "career-list", category: "career", title: "경력 목록", defaultTitle: "경력", description: "기간과 조직, 역할, 성과를 시간순으로 정리합니다.", kind: "items", layout: "standard" },
  { id: "project-list", category: "career", title: "프로젝트·성과", defaultTitle: "프로젝트 · 성과", description: "프로젝트나 주요 업무 성과를 항목별로 설명합니다.", kind: "items", layout: "standard" },
  { id: "keywords", category: "content", title: "역량 키워드", defaultTitle: "역량 · 키워드", description: "짧은 기술, 도구, 업무 키워드를 칩 형태로 나열합니다.", kind: "tags", layout: "standard" },
  { id: "education", category: "career", title: "학력·교육", defaultTitle: "학력 · 교육", description: "학교, 교육 과정, 훈련 이력을 기간과 함께 정리합니다.", kind: "items", layout: "compact" },
  { id: "credentials", category: "career", title: "자격·수상", defaultTitle: "자격 · 수상", description: "자격증, 수상, 외부 활동을 간결하게 모읍니다.", kind: "items", layout: "compact" },
  { id: "identity", category: "basic", title: "인적사항", defaultTitle: "인적사항", description: "이름과 연락처, 사진 등 한 번만 쓰는 기본정보입니다.", kind: "identity", layout: "standard" },
  { id: "eligibility", category: "basic", title: "병역·보훈 등 자격", defaultTitle: "병역 · 보훈 · 장애 · 취업보호", description: "선택적인 지원 자격 정보를 문서 하단에 정리합니다.", kind: "eligibility", layout: "compact" },
];
const DEFAULT_SECTION_TEMPLATE_ID = "highlight-grid";
const selectedSectionTemplate = (templateId: string): SectionTemplate => sectionTemplates.find((template) => template.id === templateId) ?? sectionTemplates[0]!;
const templateContent = (template: SectionTemplate): SectionContent => {
  if (template.id === "highlight-grid") return { items: [
    { id: `highlight-${Date.now()}-1`, meta: "", title: "핵심 역량 1", subtitle: "", body: "강점을 뒷받침하는 경험이나 성과를 짧게 설명해 주세요." },
    { id: `highlight-${Date.now()}-2`, meta: "", title: "핵심 역량 2", subtitle: "", body: "두 번째 강점을 구체적인 근거와 함께 설명해 주세요." },
  ] };
  if (template.kind === "identity") return { name: "", email: "", phone: "", location: "", gender: "", birthDate: "", links: [] };
  if (template.kind === "eligibility") return { militaryStatus: "", veteranStatus: "", disabilityStatus: "", employmentProtectionStatus: "" };
  if (template.kind === "narrative") return { body: "" };
  if (template.kind === "tags") return { items: [] };
  return { items: [] };
};
type EditDraft = { scope: "shared" | "role" | "variant" | "role-custom" | "variant-custom"; section: ResumeSection; content: SectionContent; title: string; saveTarget: "current" | "parent" };
type ItemEditorState = { scope: "role" | "document"; section: ResumeSection };
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");
const clone = <T,>(value: T): T => structuredClone(value);
// 접힌 항목(details) 안의 날짜 필드도 포커스할 수 있도록 먼저 펼친 뒤 이동한다.
const focusItemDateField = (itemId: string, field: string) => {
  const target = document.querySelector<HTMLElement>(`[data-resume-edit-item-id="${itemId}"] [data-resume-date-field="${field}"]`);
  if (!target) return;
  target.closest("details")?.setAttribute("open", "");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus();
};
const currentLocalMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const isCareerTimelineSectionId = (sectionId: string) => sectionId === "experience" || sectionId === "projects";
const acceptsExperienceBricks = (sectionId: string) => sectionId === "experience" || sectionId === "projects";
const defaultItemKind = (sectionId: string) => resolveResumeItemKind({}, sectionId);
const detailTypeLabels = { project: "프로젝트", responsibility: "상시 책임", improvement: "개선", troubleshooting: "문제 해결" } as const;

export function ResumeDocumentBuilder() {
  const { state, setState, hydrated, storageStatus, loadServerCopy, overwriteServerCopy } = useResumeDocumentPersistence();
  const [view, setView] = useState<"resume" | "shared">("resume");
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [sharedSectionDialogOpen, setSharedSectionDialogOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionTemplateId, setNewSectionTemplateId] = useState(DEFAULT_SECTION_TEMPLATE_ID);
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [pdfSnapshot, setPdfSnapshot] = useState<ResumePdfSnapshot | null>(null);
  useEffect(() => {
    if (!draft && !insertAfterId && !experienceDialogOpen && !importPanelOpen && !readinessOpen && !sharedSectionDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setDraft(null); setInsertAfterId(null); setExperienceDialogOpen(false); setImportPanelOpen(false); setReadinessOpen(false); setSharedSectionDialogOpen(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [draft, experienceDialogOpen, importPanelOpen, insertAfterId, readinessOpen, sharedSectionDialogOpen]);

  const active = useMemo(() => state.variants.find((item) => item.id === state.activeVariantId), [state]);
  const activeProfile = useMemo(() => state.roleProfiles.find((item) => item.id === (active?.roleProfileId ?? state.activeRoleProfileId)) ?? state.roleProfiles[0], [active?.roleProfileId, state.activeRoleProfileId, state.roleProfiles]);
  const roleVariants = useMemo(() => state.variants.filter((item) => item.roleProfileId === activeProfile?.id), [activeProfile?.id, state.variants]);
  const orderedSections = useMemo(() => activeProfile ? orderResumeSections(state.sharedSections, activeProfile, active) : state.sharedSections, [active, activeProfile, state.sharedSections]);
  const latestSectionOrderRef = useRef(orderedSections.map((section) => section.id));
  useEffect(() => {
    latestSectionOrderRef.current = orderedSections.map((section) => section.id);
  }, [orderedSections]);
  const commitSectionOrder = useCallback((sectionOrder: string[]) => {
    latestSectionOrderRef.current = sectionOrder;
    const profileId = activeProfile?.id;
    if (!profileId) return;
    const variantId = active?.id;
    setState((current) => variantId && current.variants.some((variant) => variant.id === variantId && variant.roleProfileId === profileId)
      ? updateSectionOrder(current, variantId, sectionOrder)
      : updateRoleProfileSectionOrder(current, profileId, sectionOrder));
  }, [active?.id, activeProfile?.id, setState]);
  const finalizeSectionOrder = useCallback(() => {
    commitSectionOrder(latestSectionOrderRef.current);
  }, [commitSectionOrder]);
  const resolvedWorkItems = useMemo(() => {
    const experience = state.sharedSections.find((section) => section.id === "experience");
    if (!experience || !activeProfile) return [];
    const content = resolveSection(experience, activeProfile, active).content as ItemsContent;
    return content.items.filter((item) => item.itemKind === "work");
  }, [active, activeProfile, state.sharedSections]);
  const readinessIssues = useMemo(() => inspectResumeReadiness(state, activeProfile?.id ?? "", active?.id), [active?.id, activeProfile?.id, state]);
  const readinessIssueCounts = useMemo(() => readinessIssues.reduce<Record<string, number>>((counts, issue) => {
    if (issue.sectionId) counts[issue.sectionId] = (counts[issue.sectionId] ?? 0) + 1;
    return counts;
  }, {}), [readinessIssues]);
  const syncExperienceBricks = useCallback((items: ExperienceBrickReference[]) => {
    setState((current) => linkExperienceBricks(current, items));
  }, [setState]);
  const applyApprovedImport = useCallback((command: ResumeDocumentImportCommand) => {
    setState((current) => applyResumeImportCommand(current, command));
  }, [setState]);
  if (!activeProfile) return null;
  const printableSections = orderedSections.map((section) => {
    const resolved = resolveSection(section, activeProfile, active);
    return {
      ...section,
      title: resolveSectionTitle(section, activeProfile, active),
      content: resolved.content,
      layout: resolved.layout,
      hidden: resolved.mode === "hidden",
    };
  }) as ResumePdfSnapshot["sections"];
  const openPdfPreview = () => {
    const snapshot: ResumePdfSnapshot = {
      company: active?.company || activeProfile.name,
      currentMonth: currentLocalMonth(),
      documentName: active?.name || `${activeProfile.name} 이력서`,
      relatedWorkItems: resolvedWorkItems,
      role: resolveDocumentRole(activeProfile, active),
      sections: printableSections,
    };
    setPdfSnapshot(snapshot);
  };
  const focusReadinessIssue = (issue: ResumeReadinessIssue) => {
    setReadinessOpen(false);
    if (!issue.sectionId) {
      setMobileSettingsOpen(true);
      window.setTimeout(() => document.getElementById("resume-role-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      return;
    }
    setSelectedSectionId(issue.sectionId);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-resume-editor-section-id="${issue.sectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };
  const updateActive = (patch: Partial<NonNullable<typeof active>>) => active && setState((current) => ({ ...current, variants: current.variants.map((item) => item.id === active.id ? { ...item, ...patch } : item) }));
  const setting = (sectionId: string, patch: Parameters<typeof updateSectionSetting>[3]) => setState((current) => active ? updateSectionSetting(current, active.id, sectionId, patch) : updateRoleProfileSectionSetting(current, activeProfile.id, sectionId, patch));
  const openEditor = (scope: EditDraft["scope"], section: ResumeSection, content: SectionContent) => {
    setDraft({ scope, section, content: clone(content), title: resolveSectionTitle(section, activeProfile, active), saveTarget: "current" });
  };
  const saveDraft = (nextDraft?: EditDraft) => {
    const savedDraft = nextDraft ?? draft;
    if (!savedDraft) return;
    setState((current) => {
      if (savedDraft.scope === "shared") return updateSharedSectionTitle(updateSharedSection(current, savedDraft.section.id, savedDraft.content), savedDraft.section.id, savedDraft.title);
      if (savedDraft.scope === "role" && savedDraft.saveTarget === "parent") return resetRoleProfileSectionToShared(updateSharedSectionTitle(updateSharedSection(current, savedDraft.section.id, savedDraft.content), savedDraft.section.id, savedDraft.title), activeProfile.id, savedDraft.section.id);
      if (savedDraft.scope === "variant" && savedDraft.saveTarget === "parent" && active) return resetSupportVariantSectionToRole(updateRoleProfileSectionSetting(current, activeProfile.id, savedDraft.section.id, { mode: "override", title: savedDraft.title, content: savedDraft.content }), active.id, savedDraft.section.id);
      if (savedDraft.scope === "role") return updateRoleProfileSectionSetting(current, activeProfile.id, savedDraft.section.id, { mode: "override", title: savedDraft.title, content: savedDraft.content });
      if (savedDraft.scope === "role-custom") return updateRoleCustomSection(current, activeProfile.id, savedDraft.section.id, { title: savedDraft.title.trim() || "새 섹션", content: savedDraft.content });
      if (savedDraft.scope === "variant-custom" && active) return updateCustomSection(current, active.id, savedDraft.section.id, { title: savedDraft.title.trim() || "새 섹션", content: savedDraft.content });
      return active ? updateSectionSetting(current, active.id, savedDraft.section.id, { mode: "override", title: savedDraft.title, content: savedDraft.content }) : current;
    });
    setDraft(null);
  };
  const newSectionTemplate = selectedSectionTemplate(newSectionTemplateId);
  const prepareNewSection = () => {
    const template = selectedSectionTemplate(DEFAULT_SECTION_TEMPLATE_ID);
    setNewSectionTemplateId(template.id);
    setNewSectionTitle(template.defaultTitle);
  };
  const selectNewSectionTemplate = (templateId: string) => {
    const currentTemplate = selectedSectionTemplate(newSectionTemplateId);
    const nextTemplate = selectedSectionTemplate(templateId);
    setNewSectionTemplateId(nextTemplate.id);
    if (!newSectionTitle.trim() || newSectionTitle === currentTemplate.defaultTitle) setNewSectionTitle(nextTemplate.defaultTitle);
  };
  const createCustom = () => {
    if (!insertAfterId) return;
    const result = active
      ? addCustomSection(state, active.id, { title: newSectionTitle, kind: newSectionTemplate.kind, layout: newSectionTemplate.layout, content: templateContent(newSectionTemplate), afterSectionId: insertAfterId })
      : addRoleCustomSection(state, activeProfile.id, { title: newSectionTitle, kind: newSectionTemplate.kind, layout: newSectionTemplate.layout, content: templateContent(newSectionTemplate), afterSectionId: insertAfterId });
    setState(result.state);
    setNewSectionTitle("");
    setInsertAfterId(null);
    openEditor(active ? "variant-custom" : "role-custom", result.section, result.section.content);
  };
  const removeCustom = (section: ResumeSection) => {
    setState((current) => active ? deleteCustomSection(current, active.id, section.id) : deleteRoleCustomSection(current, activeProfile.id, section.id));
    setPendingDeleteId(null);
  };
  const promoteCustom = (section: ResumeSection, origin: "role" | "variant") => {
    if (!window.confirm(`‘${section.title}’ 섹션을 공통 정보로 전환할까요? 모든 직군과 지원 버전에 표시됩니다.`)) return;
    setState((current) => origin === "variant" && active
      ? promoteSupportCustomSectionToShared(current, active.id, section.id)
      : promoteRoleCustomSectionToShared(current, activeProfile.id, section.id));
    setPendingDeleteId(null);
  };
  const deleteActive = () => {
    if (!active || !window.confirm(`‘${active.name}’ 지원 버전을 삭제할까요?`)) return;
    setState((current) => deleteSupportVariant(current, active.id));
  };
  const createShared = () => {
    const result = addSharedSection(state, { title: newSectionTitle, kind: newSectionTemplate.kind, layout: newSectionTemplate.layout, content: templateContent(newSectionTemplate), afterSectionId: state.sharedSections.at(-1)?.id });
    setState(result.state);
    setNewSectionTitle("");
    setSharedSectionDialogOpen(false);
    openEditor("shared", result.section, result.section.content);
  };

  return (
    <div className="resume-document-builder wongoji-sharp mx-auto w-full max-w-[1280px] pb-20">
      <header className="resume-builder-chrome border-b-2 border-foreground pb-5">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div><p className="flex items-center gap-2 text-[11px] font-bold tracking-[.18em] text-primary"><FileText className="h-4 w-4" /> RESUME DOCUMENTS</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">이력서 문서 편집</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">공통 정보를 직군별 이력서로 다듬으세요. 같은 직군에 여러 장이 필요할 때만 회사별 지원 버전을 추가할 수 있습니다.</p></div>
          {view === "resume" && <div className="resume-builder-actions flex flex-wrap gap-2"><button className="inline-flex h-11 items-center gap-2 border border-border bg-background px-4 text-sm font-bold text-foreground hover:border-primary hover:text-primary" onClick={() => setImportPanelOpen(true)}><FileUp className="h-4 w-4" /> 기존 이력서 가져오기</button><button className="inline-flex h-11 items-center gap-2 border border-primary bg-background px-4 text-sm font-bold text-primary" onClick={() => setReadinessOpen(true)}><ClipboardCheck className="h-4 w-4" /> 작성 점검{readinessIssues.length > 0 && <span className="bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{readinessIssues.length}</span>}</button><button className="inline-flex h-11 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={!hydrated} onClick={openPdfPreview}><Printer className="h-4 w-4" /> PDF 미리보기</button></div>}
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div aria-label="이력서 문서 화면" className="flex flex-wrap border border-border bg-background p-1" role="tablist"><Tab active={view === "resume"} onClick={() => setView("resume")}>직군 이력서</Tab><Tab active={view === "shared"} onClick={() => setView("shared")}>공통 정보</Tab></div>
        </div>
      </header>

      {view === "shared" ? <SharedManager profiles={state.roleProfiles} sections={state.sharedSections} onAdd={() => { prepareNewSection(); setSharedSectionDialogOpen(true); }} onDelete={(section) => window.confirm(`‘${section.title}’ 공통 섹션을 모든 직군과 지원 버전에서 삭제할까요?`) && setState((current) => deleteSharedSection(current, section.id))} onEdit={(section) => openEditor("shared", section, section.content)} onLinkExperience={() => setExperienceDialogOpen(true)} onOrder={(sectionOrder) => setState((current) => updateSharedSectionOrder(current, sectionOrder))} /> : (
        <div className="resume-builder-layout mt-6 grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <button aria-controls="resume-role-settings" aria-expanded={mobileSettingsOpen} className="resume-builder-chrome resume-mobile-settings-toggle flex h-12 w-full items-center justify-between border border-primary/30 bg-primary/5 px-4 text-sm font-extrabold text-primary xl:hidden" onClick={() => setMobileSettingsOpen((open) => !open)} type="button"><span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4" /> 직군·지원 버전 설정</span><span className="text-xs">{mobileSettingsOpen ? "접기" : "열기"}</span></button>
          <aside className={cx("resume-builder-chrome border border-border bg-card p-5 xl:sticky xl:top-24 xl:block", mobileSettingsOpen ? "block" : "hidden")} id="resume-role-settings">
            <h2 className="flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4 text-primary" /> 직군 이력서 설정</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">직군 이력서<select className="wg-field h-10 px-3 text-sm font-normal" value={activeProfile.id} onChange={(event) => setState((current) => ({ ...current, activeRoleProfileId: event.target.value, activeVariantId: null }))}>{state.roleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
              <Field label="이력서 이름" value={activeProfile.name} onChange={(name) => setState((current) => updateRoleProfile(current, activeProfile.id, { name }))} />
              <Field label="표시 직무" value={activeProfile.roleTitle} onChange={(roleTitle) => setState((current) => updateRoleProfile(current, activeProfile.id, { roleTitle }))} />
              {state.roleProfiles.length > 1 && <button className="inline-flex h-10 items-center justify-center gap-2 border border-red-200 text-xs font-bold text-red-600" onClick={() => window.confirm(`‘${activeProfile.name}’ 직군 이력서를 삭제할까요?`) && setState((current) => deleteRoleProfile(current, activeProfile.id))}><Trash2 className="h-3.5 w-3.5" /> 직군 이력서 삭제</button>}
            </div>
            <NewRoleResume onAdd={(name, roleTitle) => setState((current) => createRoleProfile(current, { name, roleTitle }))} />
              <div className="mt-6 border-t border-border pt-5">
                {roleVariants.length > 0 ? <>
                  <h3 className="text-sm font-extrabold">지원처별 버전</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">직군 기본과 지원처별 맞춤 문서를 전환합니다.</p>
                  <select aria-label="지원 버전 선택" className="mt-3 h-10 w-full border border-border bg-background px-3 text-sm" value={active?.id ?? ""} onChange={(event) => setState((current) => ({ ...current, activeVariantId: event.target.value || null }))}><option value="">직군 기본</option>{roleVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select>
                  {active ? <div className="mt-3 grid gap-3"><Field label="버전 이름" value={active.name} onChange={(name) => updateActive({ name })} /><Field label="지원 회사" value={active.company} onChange={(company) => updateActive({ company })} /><Field label="표시 직무(선택)" placeholder={activeProfile.roleTitle} value={active.role} onChange={(role) => updateActive({ role })} /><div className="grid grid-cols-2 gap-2"><button className="inline-flex h-10 items-center justify-center gap-2 border border-primary/40 text-xs font-bold text-primary" onClick={() => setState((current) => duplicateVariant(current, active.id))}><Copy className="h-3.5 w-3.5" /> 지원 버전 복제</button><button className="inline-flex h-10 items-center justify-center gap-2 border border-red-200 text-xs font-bold text-red-600" onClick={deleteActive}><Trash2 className="h-3.5 w-3.5" /> 삭제</button></div></div> : <NewSupportVersion onAdd={(name, company) => setState((current) => createSupportVariant(current, activeProfile.id, { name, company }))} />}
                </> : <NewSupportVersion compact onAdd={(name, company) => setState((current) => createSupportVariant(current, activeProfile.id, { name, company }))} />}
              </div>
            <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-extrabold">{active ? "지원 버전" : "직군 이력서"} 전용 섹션</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">원하는 섹션 아래의 추가 버튼을 누르세요.</p></div>
            <p aria-live="polite" className={cx("mt-6 flex items-start gap-1.5 border-t border-border pt-4 text-[11px] leading-5", storageStatus === "error" || storageStatus === "conflict" ? "text-red-600" : storageStatus === "offline" ? "text-amber-700" : "text-muted-foreground")}><Check className={cx("mt-0.5 h-3.5 w-3.5 shrink-0", storageStatus === "error" || storageStatus === "conflict" ? "text-red-600" : "text-primary")} /> {storageStatus === "error" ? "자동 저장에 실패했습니다. 브라우저 임시본은 유지됩니다." : storageStatus === "conflict" ? "다른 기기에서 변경된 문서와 충돌했습니다. 이 브라우저의 편집 내용은 보존되어 있습니다." : storageStatus === "offline" ? "서버에 연결할 수 없어 브라우저에 임시 저장했습니다. 연결되면 다시 저장합니다." : storageStatus === "saved" ? "모든 변경 내용이 서버에 저장됐습니다." : storageStatus === "saving" ? "변경 내용을 서버에 저장하는 중입니다." : "저장 내용을 불러오는 중입니다."}</p>
            {storageStatus === "conflict" && <div className="mt-2 grid grid-cols-2 gap-2"><button className="h-9 border border-border bg-background px-2 text-[10px] font-bold" onClick={() => { void loadServerCopy(); }} type="button">서버 문서 불러오기</button><button className="h-9 border border-red-300 bg-background px-2 text-[10px] font-bold text-red-700" onClick={overwriteServerCopy} type="button">이 편집본으로 저장</button></div>}
          </aside>
          <div className="resume-preview-shell min-w-0"><div className="resume-builder-chrome mb-3 flex flex-wrap items-center justify-between gap-2 border border-primary/25 bg-primary/5 px-4 py-3 text-xs"><span className="font-bold text-primary"><span className="hidden md:inline">편집 화면은 A4 너비를 기준으로 표시됩니다.</span><span className="md:hidden">모바일 편집 보기 · PDF는 A4로 저장됩니다.</span></span><span className="font-extrabold">실제 페이지 구분은 PDF 미리보기에서 확인하세요.</span></div><article className="resume-paper mx-auto w-full max-w-[210mm] bg-white text-slate-950 shadow-xl"><div className="resume-paper-inner min-h-[297mm] px-[18mm] py-[16mm]"><ResumeEditorHeader company={active?.company || activeProfile.name} role={resolveDocumentRole(activeProfile, active)} /><p className="resume-reorder-help mb-4 flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><GripVertical className="h-3.5 w-3.5" /> 섹션을 선택하면 편집 도구가 표시됩니다. 핸들을 끌어 순서를 바꿀 수 있습니다.</p><Reorder.Group axis="y" className="resume-print-sections grid gap-12" onReorder={commitSectionOrder} values={orderedSections.map((section) => section.id)}>{orderedSections.map((section) => {
            const resolved = resolveSection(section, activeProfile, active);
            const title = resolveSectionTitle(section, activeProfile, active);
            const roleCustom = activeProfile.customSections.some((item) => item.id === section.id);
            const variantCustom = Boolean(active?.customSections.some((item) => item.id === section.id));
            const canReset = !section.custom && ((!active && resolved.source === "role") || (Boolean(active) && resolved.source === "document"));
            const resetToParent = () => setState((current) => active ? resetSupportVariantSectionToRole(current, active.id, section.id) : resetRoleProfileSectionToShared(current, activeProfile.id, section.id));
            const restoreVisibility = () => {
              const localSetting = active ? active.settings[section.id] : activeProfile.settings[section.id];
              const keepsCustomization = Boolean(localSetting && Object.entries(localSetting).some(([key, value]) => key !== "mode" && value !== undefined));
              if (keepsCustomization) setting(section.id, { mode: "override" });
              else resetToParent();
            };
            return <SortableSection key={section.id} onReorderEnd={finalizeSectionOrder} onSelect={() => setSelectedSectionId(section.id)} sectionId={section.id} selected={selectedSectionId === section.id}>{(dragControls) => <>{resolved.mode === "hidden" ? <HiddenSection section={{ ...section, title }} dragControls={dragControls} onShow={restoreVisibility} /> : <DocumentSection dragControls={dragControls} section={{ ...section, title, layout: resolved.layout }} content={resolved.content} issueCount={readinessIssueCounts[section.id] ?? 0} relatedWorkItems={resolvedWorkItems} source={resolved.source} onHide={!section.custom ? () => setting(section.id, { mode: "hidden" }) : undefined} onReset={canReset ? () => window.confirm(`${active ? "이 지원 버전의 맞춤 내용" : "이 직군 이력서의 맞춤 내용"}을 버리고 ${active ? "직군 이력서" : "공통 정보"}로 되돌릴까요?`) && resetToParent() : undefined} resetLabel={active ? "직군 이력서로 되돌리기" : "공통 정보로 되돌리기"} onEdit={() => openEditor(roleCustom ? active ? "variant" : "role-custom" : variantCustom ? "variant-custom" : active ? "variant" : "role", section, resolved.content)} onItems={section.kind === "items" && !section.custom ? () => setItemEditor({ scope: active ? "document" : "role", section }) : undefined} onPromote={section.custom ? () => promoteCustom(section, variantCustom ? "variant" : "role") : undefined} deletePending={pendingDeleteId === section.id} onDelete={section.custom && (!roleCustom || !active) ? () => pendingDeleteId === section.id ? removeCustom(section) : setPendingDeleteId(section.id) : undefined} />}<button className="resume-section-controls resume-section-insert inline-flex h-9 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-[10px] font-bold text-slate-500 hover:border-orange-400 hover:text-orange-600" onClick={() => { setInsertAfterId(section.id); prepareNewSection(); }}><Plus className="h-3.5 w-3.5" /> {title} 뒤에 새 섹션 추가</button></>}</SortableSection>;
          })}</Reorder.Group></div></article></div>
        </div>
      )}
      {view === "resume" && <nav aria-label="모바일 이력서 편집" className="resume-mobile-actions">
        <button onClick={() => { const lastSection = orderedSections[orderedSections.length - 1]; if (lastSection) { setInsertAfterId(lastSection.id); prepareNewSection(); } }} type="button"><Plus className="h-4 w-4" /> 섹션 추가</button>
        <button onClick={() => setReadinessOpen(true)} type="button"><ClipboardCheck className="h-4 w-4" /> 작성 점검{readinessIssues.length > 0 && <span>{readinessIssues.length}</span>}</button>
        <button disabled={!hydrated} onClick={openPdfPreview} type="button"><Printer className="h-4 w-4" /> PDF 미리보기</button>
      </nav>}
      {draft && <Editor draft={draft} profileCount={state.roleProfiles.length} profileName={activeProfile.name} roleVariantCount={roleVariants.length} variantName={active?.name} workItems={resolvedWorkItems} onChange={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft} />}
      {insertAfterId && <AddSectionDialog afterTitle={orderedSections.find((section) => section.id === insertAfterId)?.title ?? "선택한 섹션"} templateId={newSectionTemplateId} title={newSectionTitle} onTemplate={selectNewSectionTemplate} onTitle={setNewSectionTitle} onCancel={() => setInsertAfterId(null)} onAdd={createCustom} />}
      {sharedSectionDialogOpen && <AddSectionDialog afterTitle="공통 정보 마지막" templateId={newSectionTemplateId} title={newSectionTitle} onTemplate={selectNewSectionTemplate} onTitle={setNewSectionTitle} onCancel={() => setSharedSectionDialogOpen(false)} onAdd={createShared} />}
      {itemEditor && <ItemTailoringDialog state={state} profileId={activeProfile.id} variantId={itemEditor.scope === "document" ? active?.id : undefined} scope={itemEditor.scope} section={itemEditor.section} workItems={resolvedWorkItems} onSave={setState} onClose={() => setItemEditor(null)} onEditParent={() => { const parentContent = itemEditor.scope === "role" ? itemEditor.section.content : resolveSection(itemEditor.section, activeProfile).content; setItemEditor(null); openEditor(itemEditor.scope === "role" ? "shared" : "role", itemEditor.section, parentContent); }} onEditCurrent={() => { const content = resolveSection(itemEditor.section, activeProfile, itemEditor.scope === "document" ? active : undefined).content; setItemEditor(null); openEditor(itemEditor.scope === "document" ? "variant" : "role", itemEditor.section, content); }} />}
      {experienceDialogOpen && <ExperienceBrickSyncDialog onClose={() => setExperienceDialogOpen(false)} onSync={syncExperienceBricks} />}
      {importPanelOpen && <ResumeDocumentImportPanel sections={orderedSections} workItems={resolvedWorkItems} onApply={applyApprovedImport} onClose={() => setImportPanelOpen(false)} />}
      {readinessOpen && <ReadinessDialog issues={readinessIssues} onClose={() => setReadinessOpen(false)} onIssue={focusReadinessIssue} />}
      {pdfSnapshot && <ResumePdfPreviewDialog onClose={() => setPdfSnapshot(null)} snapshot={pdfSnapshot} />}
    </div>
  );
}

function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button aria-selected={active} className={cx("h-10 px-4 text-sm font-bold", active ? "bg-foreground text-background" : "text-muted-foreground")} onClick={onClick} role="tab">{children}</button>; }
// 색으로 상태를 말한다: 미기입 필수 = 오커 + "작성 필요", 다 채우면 색이 빠지고 무채색으로 물러난다.
function FieldLabel({ label, required, needsInput }: { label: string; required?: boolean; needsInput?: boolean }) {
  return <span className="flex items-baseline gap-1.5">
    <span className={cx("text-xs font-bold", needsInput ? "text-wg-todo" : required ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    {needsInput && <span className="text-[10px] font-extrabold text-wg-todo">작성 필요</span>}
  </span>;
}

// 여백 대신 경계선과 굵기로 구획을 나누는 작은 래퍼.
function EditorBlock({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="border border-border bg-muted/20">
    <p className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2"><span className="text-[11px] font-extrabold tracking-wide">{title}</span>{note && <span className="text-[10px] font-bold text-muted-foreground">{note}</span>}</p>
    <div className="p-4">{children}</div>
  </section>;
}
function Field({ label, value, onChange, placeholder, type = "text", required, hint, large }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: "text" | "tel" | "date"; required?: boolean; hint?: string; large?: boolean }) { const needsInput = Boolean(required) && !value.trim(); return <label className="grid gap-1.5"><FieldLabel label={label} needsInput={needsInput} required={required} /><input className={cx("wg-field px-3 font-normal", large ? "h-12 text-lg font-extrabold" : "h-10 text-sm")} data-todo={needsInput || undefined} placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />{hint && <span className="text-[11px] leading-4 text-muted-foreground">{hint}</span>}</label>; }
function SelectField({ label, value, options, onChange, required, hint }: { label: string; value?: string; options: string[]; onChange: (value: string) => void; required?: boolean; hint?: string }) { return <label className="grid gap-1.5"><FieldLabel label={label} needsInput={Boolean(required) && !(value ?? "").trim()} required={required} /><select className="wg-field h-10 px-3 text-sm font-normal" data-todo={(Boolean(required) && !(value ?? "").trim()) || undefined} value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">선택 안 함</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>{hint && <span className="text-[11px] leading-4 text-muted-foreground">{hint}</span>}</label>; }
function TextArea({ label, value, onChange, placeholder, required, hint, minRows = 4, showCount, ruled }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; hint?: string; minRows?: number; showCount?: boolean; ruled?: boolean }) {
  const needsInput = Boolean(required) && !value.trim();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const grow = (node: HTMLTextAreaElement | null) => { if (!node) return; node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; };
  useEffect(() => { grow(areaRef.current); }, [value]);
  return <label className="grid gap-1.5"><FieldLabel label={label} needsInput={needsInput} required={required} /><textarea className={cx("wg-field resize-y p-3 text-sm font-normal", ruled ? "wg-ruled" : "leading-6")} data-todo={needsInput || undefined} placeholder={placeholder} ref={areaRef} rows={minRows} value={value} onChange={(event) => { grow(event.target); onChange(event.target.value); }} />{(hint || showCount) && <span className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] leading-4 text-muted-foreground">{hint ? <span>{hint}</span> : <span />}{showCount && <strong className="font-bold text-foreground">공백 포함 {value.length.toLocaleString()}자</strong>}</span>}</label>;
}

function NewRoleResume({ onAdd }: { onAdd: (name: string, roleTitle: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  if (!open) return <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 border border-primary text-xs font-bold text-primary" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> 직군 이력서 추가</button>;
  return <div className="mt-4 grid gap-3 border-t border-border pt-4"><Field label="새 이력서 이름" placeholder="예: 백엔드" value={name} onChange={setName} /><Field label="표시 직무" placeholder="예: 백엔드 엔지니어" value={roleTitle} onChange={setRoleTitle} /><div className="flex gap-2"><button className="h-9 flex-1 border border-border text-xs font-bold" onClick={() => setOpen(false)}>취소</button><button className="h-9 flex-1 bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40" disabled={!name.trim()} onClick={() => { onAdd(name, roleTitle); setName(""); setRoleTitle(""); setOpen(false); }}>추가</button></div></div>;
}

function NewSupportVersion({ compact = false, onAdd }: { compact?: boolean; onAdd: (name: string, company: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  if (!open) return <button aria-label="회사별 지원 버전 만들기" className={cx("inline-flex h-10 w-full items-center justify-center gap-2 text-xs font-bold text-primary", compact ? "border border-border bg-background" : "mt-3 border border-dashed border-primary")} onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> 지원처별 버전 추가</button>;
  return <div className={cx("grid gap-3", !compact && "mt-3")}><p className="text-xs leading-5 text-muted-foreground">같은 직군의 이력서를 지원처에 맞춰 한 장 더 만들 수 있습니다.</p><Field label="버전 이름" placeholder="예: A사 지원" value={name} onChange={setName} /><Field label="지원 회사" placeholder="예: A사" value={company} onChange={setCompany} /><div className="flex gap-2"><button className="h-9 flex-1 border border-border text-xs font-bold" onClick={() => setOpen(false)}>취소</button><button className="h-9 flex-1 bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40" disabled={!name.trim()} onClick={() => { onAdd(name, company); setName(""); setCompany(""); setOpen(false); }}>만들기</button></div></div>;
}

function contentSummary(section: ResumeSection) {
  if (section.kind === "identity") { const value = section.content as IdentityContent; return [value.name, value.email, value.phone, value.location, ...value.links].filter(Boolean).join(" · "); }
  if (section.kind === "eligibility") { const value = section.content as EligibilityContent; return [value.militaryStatus, value.veteranStatus, value.disabilityStatus, value.employmentProtectionStatus].filter(Boolean).join(" · "); }
  if (section.kind === "narrative") return narrativePlainText(section.content as NarrativeContent);
  if (section.kind === "tags") return (section.content as TagsContent).items.join(" · ");
  return (section.content as ItemsContent).items.map((item) => [formatItemPeriod(item), item.title, item.subtitle].filter(Boolean).join(" · ")).join("\n");
}
function SharedManager({ sections, profiles, onAdd, onDelete, onEdit, onLinkExperience, onOrder }: { sections: ResumeSection[]; profiles: ResumeRoleProfile[]; onAdd: () => void; onDelete: (section: ResumeSection) => void; onEdit: (section: ResumeSection) => void; onLinkExperience: () => void; onOrder: (sectionOrder: string[]) => void }) {
  return <section className="mt-7"><div className="border border-primary/25 bg-primary/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-extrabold">공통 정보 · PDF 기본 순서</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">회사, 기간, 성과처럼 직군이 달라도 변하지 않는 사실을 관리합니다. 이 순서는 별도로 조정하지 않은 모든 직군 이력서의 PDF에 그대로 적용됩니다.</p></div><button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onAdd}><Plus className="h-4 w-4" /> 공통 섹션 추가</button></div><p className="mt-4 inline-flex items-center gap-2 border border-primary/30 bg-background px-3 py-2 text-xs font-extrabold text-primary"><GripVertical className="h-4 w-4" /> 각 항목의 핸들을 위아래로 끌어 PDF 순서를 변경하세요.</p></div><Reorder.Group axis="y" className="mt-5 grid gap-3" onReorder={onOrder} values={sections.map((section) => section.id)}>{sections.map((section, index) => { const overridingProfiles = profiles.filter((profile) => { const setting = profile.settings[section.id]; return setting?.mode === "override" || setting?.mode === "hidden"; }); return <SharedSortableCard index={index} key={section.id} onDelete={() => onDelete(section)} onEdit={() => onEdit(section)} onLinkExperience={acceptsExperienceBricks(section.id) ? onLinkExperience : undefined} overridingProfiles={overridingProfiles} section={section} />; })}</Reorder.Group></section>;
}

function SharedSortableCard({ section, index, overridingProfiles, onDelete, onEdit, onLinkExperience }: { section: ResumeSection; index: number; overridingProfiles: ResumeRoleProfile[]; onDelete: () => void; onEdit: () => void; onLinkExperience?: () => void }) {
  const dragControls = useDragControls();
  return <Reorder.Item className="border border-border bg-card" dragControls={dragControls} dragListener={false} value={section.id} whileDrag={{ scale: 1.01, zIndex: 20 }}><article className="grid items-center gap-4 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]"><button aria-label={`${section.title} 공통 정보 순서 이동`} className="grid h-12 w-12 touch-none cursor-grab place-items-center border border-primary/40 bg-primary/5 text-primary active:cursor-grabbing" onPointerDown={(event) => dragControls.start(event)} type="button"><GripVertical className="h-5 w-5" /></button><span className="grid h-12 w-12 place-items-center bg-foreground text-sm font-black text-background"><span><small className="block text-[8px] font-bold tracking-widest">PDF</small>{String(index + 1).padStart(2, "0")}</span></span><div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary"><LayoutTemplate className="h-3.5 w-3.5" /> 공통 정보</p><h3 className="mt-1 text-lg font-extrabold" data-common-section-title>{section.title}</h3><p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{contentSummary(section) || "아직 작성된 내용이 없습니다."}</p></div><div className="flex flex-wrap gap-2 sm:justify-end"><button className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-background px-3 text-xs font-bold hover:text-primary" onClick={onEdit}><Edit3 className="h-4 w-4" /> 내용 편집</button>{onLinkExperience && <button className="inline-flex h-10 items-center justify-center gap-2 border border-primary/40 bg-primary/5 px-3 text-xs font-bold text-primary" onClick={onLinkExperience}><Plus className="h-4 w-4" /> 확정 경험 일괄 가져오기·동기화</button>}<button aria-label={`${section.title} 공통 섹션 삭제`} className="grid h-10 w-10 place-items-center border border-red-200 bg-background text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /></button></div></article>{overridingProfiles.length > 0 && <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"><p className="text-xs font-extrabold">{overridingProfiles.map((profile) => profile.name).join(", ")}에서는 직군 맞춤 상태라 공통 정보 변경이 반영되지 않습니다. 되돌리기는 해당 이력서 섹션의 더보기에서 할 수 있습니다.</p></div>}</Reorder.Item>;
}

export function RoleProfileManager({ profile, profiles, sections, onActive, onAdd, onDelete, onProfile, onSetting, onEdit, onItems }: { profile: ResumeRoleProfile; profiles: ResumeRoleProfile[]; sections: ResumeSection[]; onActive: (profileId: string) => void; onAdd: (name: string, roleTitle: string) => void; onDelete: () => void; onProfile: (patch: Partial<Pick<ResumeRoleProfile, "name" | "roleTitle">>) => void; onSetting: (sectionId: string, patch: Parameters<typeof updateRoleProfileSectionSetting>[3]) => void; onEdit: (section: ResumeSection) => void; onItems: (section: ResumeSection) => void }) {
  const [newName, setNewName] = useState("");
  const [newRoleTitle, setNewRoleTitle] = useState("");
  const add = () => { onAdd(newName, newRoleTitle); setNewName(""); setNewRoleTitle(""); };
  return <section className="mt-7 grid gap-5"><div className="border border-primary/25 bg-primary/5 p-5"><h2 className="text-lg font-extrabold">직군 프로필</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">백엔드, 기획, AI 엔지니어처럼 반복해서 사용할 강조점과 항목 구성을 만듭니다. 지원 이력서는 이 프로필을 다시 상속합니다.</p></div><div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="border border-border bg-card p-5"><label className="grid gap-1.5 text-xs font-bold text-muted-foreground">관리할 직군<select className="wg-field h-10 px-3 text-sm" value={profile.id} onChange={(event) => onActive(event.target.value)}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mt-5 grid gap-4"><Field label="프로필 이름" value={profile.name} onChange={(name) => onProfile({ name })} /><Field label="표시 직무" value={profile.roleTitle} onChange={(roleTitle) => onProfile({ roleTitle })} /></div>{profiles.length > 1 && <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 border border-red-200 text-sm font-bold text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /> 이 직군 프로필 삭제</button>}<div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-extrabold">새 직군 프로필</h3><div className="mt-3 grid gap-3"><Field label="프로필 이름" placeholder="예: 백엔드" value={newName} onChange={setNewName} /><Field label="표시 직무" placeholder="예: 백엔드 엔지니어" value={newRoleTitle} onChange={setNewRoleTitle} /><button className="inline-flex h-10 items-center justify-center gap-2 bg-primary text-sm font-bold text-primary-foreground" disabled={!newName.trim()} onClick={add}><Plus className="h-4 w-4" /> 프로필 추가</button></div></div></aside><div className="grid gap-4 md:grid-cols-2">{sections.map((section) => { const setting = profile.settings[section.id]; const resolved = resolveSection(section, profile); return <article className="flex min-h-56 flex-col border border-border bg-card p-5" key={section.id}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">{resolved.source === "role" ? "직군 맞춤" : "커리어 원본"}</p><h3 className="mt-2 text-lg font-extrabold">{section.title}</h3></div><select aria-label={`${section.title} 직군 내용 방식`} className="h-9 border border-border bg-background px-2 text-xs font-bold" value={setting?.mode ?? "inherit"} onChange={(event) => onSetting(section.id, { mode: event.target.value as SectionMode })}>{Object.entries(roleModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{contentSummary({ ...section, content: resolved.content }) || "작성된 내용이 없습니다."}</p><div className="mt-auto grid grid-cols-2 gap-2 pt-4"><button className="inline-flex h-10 items-center justify-center gap-2 border border-border text-xs font-bold" onClick={() => onEdit(section)}><Edit3 className="h-3.5 w-3.5" /> 직군용 재작성</button>{section.kind === "items" ? <button className="inline-flex h-10 items-center justify-center gap-2 border border-primary/40 text-xs font-bold text-primary" onClick={() => onItems(section)}><Settings2 className="h-3.5 w-3.5" /> 항목 조정</button> : <button className="h-10 border border-border text-xs font-bold" onClick={() => onSetting(section.id, { mode: "inherit", content: undefined })}><RotateCcw className="mr-1 inline h-3.5 w-3.5" /> 원본으로</button>}</div></article>; })}</div></div></section>;
}

function SortableSection({ children, onReorderEnd, onSelect, sectionId, selected }: { children: (dragControls: DragControls) => React.ReactNode; onReorderEnd: () => void; onSelect: () => void; sectionId: string; selected: boolean }) { const dragControls = useDragControls(); return <Reorder.Item aria-label="이력서 섹션" className={cx("resume-print-section resume-editable-section relative", selected && "is-selected")} data-resume-editor-section-id={sectionId} dragControls={dragControls} dragListener={false} layout="position" onClick={onSelect} onDragEnd={onReorderEnd} onFocusCapture={onSelect} role="group" tabIndex={0} transition={{ layout: { duration: .18, ease: "easeOut" } }} value={sectionId} whileDrag={{ opacity: .82, scale: 1.005, zIndex: 20 }}>{children(dragControls)}</Reorder.Item>; }
function DragHandle({ dragControls, title }: { dragControls: DragControls; title: string }) { return <button aria-label={`${title} 섹션 순서 이동`} className="resume-drag-handle grid h-10 w-10 shrink-0 touch-none cursor-grab place-items-center border border-slate-300 bg-white text-slate-500 active:cursor-grabbing sm:h-8 sm:w-8" onPointerDown={(event) => dragControls.start(event)} type="button"><GripVertical className="h-4 w-4" /></button>; }
function HiddenSection({ dragControls, onShow, section }: { dragControls: DragControls; onShow: () => void; section: ResumeSection }) { return <div className="resume-hidden flex items-center justify-between gap-2 border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500"><span className="flex items-center gap-2 font-bold"><DragHandle dragControls={dragControls} title={section.title} /><EyeOff className="h-4 w-4" /> {section.title} · 숨김</span><button aria-label={`${section.title} 섹션 표시`} className="grid h-9 w-9 place-items-center border border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary" onClick={onShow} title="섹션 표시"><Eye className="h-4 w-4" /></button></div>; }

function DocumentSection({ section, content, issueCount, relatedWorkItems, source, onHide, onReset, resetLabel, onEdit, onItems, onPromote, onDelete, deletePending, dragControls }: { section: ResumeSection; content: SectionContent; issueCount: number; relatedWorkItems: ItemContent[]; source: "shared" | "role" | "document"; onHide?: () => void; onReset?: () => void; resetLabel: string; onEdit: () => void; onItems?: () => void; onPromote?: () => void; onDelete?: () => void; deletePending?: boolean; dragControls: DragControls }) {
  const sourceLabel = source === "shared" ? "공통 정보" : source === "role" ? "직군 이력서" : "지원 버전 맞춤";
  const hasMoreActions = Boolean(onReset || onItems || onPromote || onDelete);
  return <div><div className="resume-section-controls resume-section-toolbar flex items-center justify-between gap-2 border border-dashed border-slate-300 bg-slate-50 p-2"><span className="flex min-w-0 items-center gap-2"><DragHandle dragControls={dragControls} title={section.title} /><span className="min-w-0 truncate text-xs font-extrabold text-slate-700">{section.title}</span><span className={cx("hidden shrink-0 border px-2 py-1 text-[10px] font-extrabold sm:inline-flex", source === "document" ? "border-orange-300 bg-orange-50 text-orange-700" : source === "role" ? "border-primary/30 bg-primary/5 text-primary" : "border-slate-300 bg-white text-slate-600")}>{section.custom ? "현재 단계 전용" : sourceLabel}</span>{issueCount > 0 && <span className="resume-section-issue-badge shrink-0">확인 {issueCount}</span>}</span><div className="flex shrink-0 items-center gap-1">{onHide && <button aria-label={`${section.title} 섹션 숨기기`} className="grid h-10 w-10 place-items-center border border-slate-300 bg-white text-slate-500 hover:border-primary hover:text-primary sm:h-8 sm:w-8" onClick={onHide} title="섹션 숨기기"><EyeOff className="h-4 w-4" /></button>}<button className="inline-flex h-10 items-center gap-2 border border-slate-400 bg-white px-3 text-xs font-bold hover:border-primary hover:text-primary sm:h-8" onClick={onEdit}><Edit3 className="h-3.5 w-3.5" /> 편집</button>{hasMoreActions && <details className="relative"><summary aria-label={`${section.title} 섹션 더보기`} className="grid h-10 w-10 cursor-pointer list-none place-items-center border border-slate-300 bg-white sm:h-8 sm:w-8"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-40 mt-1 grid w-60 gap-3 border border-slate-300 bg-white p-3 text-slate-700 shadow-xl">{onReset && <button className="h-9 border border-primary/40 bg-primary/5 px-2 text-xs font-bold text-primary" onClick={onReset}><RotateCcw className="mr-1 inline h-3.5 w-3.5" /> {resetLabel}</button>}{onItems && <button className="h-9 border border-orange-300 bg-white px-2 text-xs font-bold text-orange-700" onClick={onItems}>{section.id === "experience" ? "경험 선택·편집" : "포함 항목 선택"}</button>}{onPromote && <button className="h-9 border border-primary/40 bg-primary/5 px-2 text-xs font-bold text-primary" onClick={onPromote}><LayoutTemplate className="mr-1 inline h-3.5 w-3.5" /> 공통 섹션으로 전환</button>}{onDelete && <button aria-label={deletePending ? `${section.title} 섹션 삭제 확인` : `${section.title} 섹션 삭제`} className="h-9 border border-red-200 bg-white px-2 text-xs font-bold text-red-600" onClick={onDelete}>{deletePending ? "정말 삭제" : "섹션 삭제"}</button>}</div></details>}</div></div><ResumeEditorSection currentMonth={currentLocalMonth()} relatedWorkItems={relatedWorkItems} section={{ ...section, content, layout: section.layout ?? "standard" }} /></div>;
}


function createNarrativeBlockElement(block: NarrativeBlock) {
  const element = document.createElement(block.type);
  element.dataset.blockId = block.id;
  for (const run of block.runs) {
    const text = document.createTextNode(run.text);
    if (run.bold) { const strong = document.createElement("strong"); strong.append(text); element.append(strong); }
    else element.append(text);
  }
  if (!element.childNodes.length) element.append(document.createElement("br"));
  return element;
}

function parseNarrativeClipboard(clipboardData: DataTransfer): NarrativeBlock[] {
  const html = clipboardData.getData("text/html");
  const plainText = clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
  const newBlock = (type: NarrativeBlockType, runs: NarrativeRun[], index: number): NarrativeBlock => ({ id: `paste-${Date.now()}-${index}`, type, runs: runs.length ? runs : [{ text: "" }] });
  if (!html) return plainText.split("\n").map((text, index) => newBlock("p", [{ text }], index));
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const blocks: NarrativeBlock[] = [];
  const blockTags = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);
  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const readRuns = (node: Node, bold = false): NarrativeRun[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ text: node.textContent, bold }] : [];
    if (!(node instanceof HTMLElement) || ignoredTags.has(node.tagName)) return [];
    if (node.tagName === "BR") return [{ text: "\n", bold }];
    const weight = node.style.fontWeight.toLowerCase();
    const nextBold = bold || node.tagName === "B" || node.tagName === "STRONG" || weight === "bold" || Number.parseInt(weight || "0", 10) >= 600;
    return Array.from(node.childNodes).flatMap((child) => readRuns(child, nextBold));
  };
  const addRuns = (type: NarrativeBlockType, runs: NarrativeRun[]) => {
    let current: NarrativeRun[] = [];
    let firstBlock = true;
    const flush = (blockType: NarrativeBlockType) => { blocks.push(newBlock(blockType, current, blocks.length)); current = []; };
    runs.forEach((run) => {
      const parts = run.text.split("\n");
      parts.forEach((part, index) => {
        if (part) current.push({ text: part, bold: run.bold });
        if (index < parts.length - 1) {
          flush(firstBlock ? type : "p");
          firstBlock = false;
        }
      });
    });
    if (current.length || firstBlock) flush(firstBlock ? type : "p");
  };
  const walk = (parent: ParentNode) => {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent?.trim()) addRuns("p", [{ text: node.textContent }]);
        return;
      }
      if (!(node instanceof HTMLElement) || ignoredTags.has(node.tagName)) return;
      const nestedBlocks = Array.from(node.children).some((child) => blockTags.has(child.tagName));
      if (!blockTags.has(node.tagName) || (node.tagName === "DIV" && nestedBlocks)) { walk(node); return; }
      const semanticType = /^H[1-6]$/.test(node.tagName) ? node.tagName.toLowerCase() as NarrativeBlockType : "p";
      addRuns(semanticType, readRuns(node));
    });
  };
  walk(documentNode.body);
  return blocks.length ? blocks : plainText.split("\n").map((text, index) => newBlock("p", [{ text }], index));
}

function replaceNarrativeEditorDom(root: HTMLElement, content: NarrativeContent, caretOffset?: number) {
  const blocks: NarrativeBlock[] = content.blocks?.length ? content.blocks : content.body.split(/\r?\n/).map((text, index) => ({ id: `legacy-${index}`, type: "p", runs: [{ text, bold: false }] }));
  root.replaceChildren(...blocks.map(createNarrativeBlockElement));
  if (caretOffset === undefined) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = caretOffset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  root.focus();
}

function serializeNarrativeEditor(root: HTMLElement): NarrativeContent {
  const readRuns = (node: Node, bold = false): NarrativeRun[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ text: node.textContent, bold }] : [];
    if (!(node instanceof HTMLElement)) return [];
    if (node.tagName === "BR") return [{ text: "\n", bold }];
    const nextBold = bold || node.tagName === "B" || node.tagName === "STRONG" || Number.parseInt(node.style.fontWeight || "0", 10) >= 600;
    return Array.from(node.childNodes).flatMap((child) => readRuns(child, nextBold));
  };
  const allowed = new Set<NarrativeBlockType>(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
  const blocks: NarrativeBlock[] = Array.from(root.childNodes).flatMap((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      return text ? [{ id: `block-${index}`, type: "p" as const, runs: [{ text }] }] : [];
    }
    if (!(node instanceof HTMLElement)) return [];
    const tag = node.tagName.toLowerCase() as NarrativeBlockType;
    const runs = readRuns(node).reduce<NarrativeRun[]>((merged, run) => {
      const previous = merged.at(-1);
      if (previous && Boolean(previous.bold) === Boolean(run.bold)) previous.text += run.text;
      else merged.push(run);
      return merged;
    }, []);
    return [{ id: node.dataset.blockId || `block-${index}`, type: allowed.has(tag) ? tag : "p", runs: runs.length ? runs : [{ text: "" }] }];
  });
  const safeBlocks = blocks.length ? blocks : [{ id: "block-0", type: "p" as const, runs: [{ text: "" }] }];
  return { body: safeBlocks.map((block) => block.runs.map((run) => run.text).join("")).join("\n"), blocks: safeBlocks };
}

function RichNarrativeEditor({ content, onChange }: { content: NarrativeContent; onChange: (content: SectionContent) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initialContent = useRef(content);
  const [characterCount, setCharacterCount] = useState(() => narrativeCharacterCount(content));
  const [paragraphCount, setParagraphCount] = useState(() => content.blocks?.length || Math.max(1, content.body.split(/\r?\n/).length));
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    replaceNarrativeEditorDom(root, initialContent.current);
  }, []);
  const emit = () => {
    if (!editorRef.current) return;
    const next = serializeNarrativeEditor(editorRef.current);
    setCharacterCount(narrativeCharacterCount(next));
    setParagraphCount(next.blocks?.length ?? 1);
    onChange(next);
  };
  const command = (name: "bold" | "formatBlock", value?: string) => {
    const root = editorRef.current;
    const selection = window.getSelection();
    if (root && (!selection?.anchorNode || !root.contains(selection.anchorNode))) root.focus();
    document.execCommand(name, false, value);
    emit();
  };
  const paste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = editorRef.current;
    if (!root) return;
    const container = document.createElement("div");
    container.append(...parseNarrativeClipboard(event.clipboardData).map(createNarrativeBlockElement));
    root.focus();
    document.execCommand("insertHTML", false, container.innerHTML);
    const selection = window.getSelection();
    let caretOffset: number | undefined;
    if (selection?.focusNode && root.contains(selection.focusNode)) {
      const range = document.createRange();
      range.setStart(root, 0);
      range.setEnd(selection.focusNode, selection.focusOffset);
      caretOffset = range.toString().length;
    }
    const next = serializeNarrativeEditor(root);
    replaceNarrativeEditorDom(root, next, caretOffset);
    setCharacterCount(narrativeCharacterCount(next));
    setParagraphCount(next.blocks?.length ?? 1);
    onChange(next);
  };
  const blockTypes: Array<{ type: NarrativeBlockType; label: string }> = [{ type: "p", label: "본문" }, ...([1, 2, 3, 4, 5, 6].map((level) => ({ type: `h${level}` as NarrativeBlockType, label: `H${level}` })) )];
  return <div className="border border-border"><div aria-label="서술형 서식 도구" className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2">{blockTypes.map((item) => <button className="h-9 min-w-10 border border-border bg-background px-2 text-xs font-bold hover:border-primary hover:text-primary" key={item.type} onMouseDown={(event) => { event.preventDefault(); command("formatBlock", item.type); }} type="button">{item.label}</button>)}<span className="mx-1 h-6 w-px bg-border" /><button aria-label="굵게" className="h-9 min-w-10 border border-border bg-background px-3 text-sm font-black hover:border-primary hover:text-primary" onMouseDown={(event) => { event.preventDefault(); command("bold"); }} type="button">B</button></div><div aria-label="소개글 내용" className="wg-ruled min-h-[22rem] bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-primary/30 [&_h1]:text-3xl [&_h2]:text-2xl [&_h3]:text-xl [&_h4]:text-lg [&_h5]:text-base [&_h6]:text-sm [&_h1]:font-black [&_h2]:font-black [&_h3]:font-extrabold [&_h4]:font-extrabold [&_h5]:font-bold [&_h6]:font-bold" contentEditable data-narrative-placeholder="예: 결제 도메인에서 6년간 일하며, 장애가 잦던 정산 파이프라인을 다시 세웠습니다." onInput={emit} onPaste={paste} ref={editorRef} role="textbox" suppressContentEditableWarning /><div className="flex flex-wrap justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground"><span>붙여넣기는 H1~H6·문단·굵게만 유지하며, 색상과 배경 등은 제거합니다.</span><strong aria-live="polite" className="text-foreground">공백 포함 {characterCount.toLocaleString()}자 · {paragraphCount}단락</strong></div></div>;
}

async function optimizeIdentityPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("JPG, PNG, WEBP 같은 이미지 파일을 선택해 주세요.");
  if (file.size > 10 * 1024 * 1024) throw new Error("원본 사진은 10MB 이하만 업로드할 수 있습니다.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = document.createElement("img");
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("사진을 읽지 못했습니다. 다른 이미지로 시도해 주세요."));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 600 / image.naturalWidth, 800 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서는 사진을 처리할 수 없습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let photo = canvas.toDataURL("image/jpeg", 0.82);
    if (photo.length > 1_500_000) photo = canvas.toDataURL("image/jpeg", 0.65);
    if (photo.length > 2_000_000) throw new Error("사진 용량을 충분히 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.");
    return photo;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function IdentityPhotoField({ value, onChange }: { value: IdentityContent; onChange: (patch: Pick<IdentityContent, "photo" | "photoName">) => void }) {
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const selectPhoto = async (file?: File) => {
    if (!file) return;
    setProcessing(true);
    setError("");
    try { onChange({ photo: await optimizeIdentityPhoto(file), photoName: file.name }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "사진을 처리하지 못했습니다."); }
    finally { setProcessing(false); }
  };
  return <section className="border border-border bg-muted/20 p-4"><p className="text-xs font-extrabold">증명사진 <span className="font-normal text-muted-foreground">(선택)</span></p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">인적사항에만 표시됩니다. 업로드한 사진은 크기를 줄여 문서에 저장합니다.</p><div className="mt-3 flex flex-wrap items-center gap-4">{value.photo ? <Image alt="증명사진 미리보기" className="h-32 w-24 border border-border object-cover" height={640} src={value.photo} unoptimized width={480} /> : <div className="grid h-32 w-24 place-items-center border border-dashed border-border bg-background text-center text-[10px] text-muted-foreground">사진<br />미리보기</div>}<div className="grid gap-2"><label className="inline-flex h-10 cursor-pointer items-center justify-center border border-primary px-4 text-xs font-bold text-primary"><input accept="image/jpeg,image/png,image/webp" aria-label="증명사진 파일 선택" className="sr-only" disabled={processing} type="file" onChange={(event) => { void selectPhoto(event.target.files?.[0]); event.target.value = ""; }} />{processing ? "사진 처리 중…" : value.photo ? "사진 교체" : "증명사진 업로드"}</label>{value.photo && <button className="h-9 border border-red-200 px-3 text-xs font-bold text-red-600" onClick={() => { onChange({ photo: undefined, photoName: undefined }); setError(""); }} type="button">사진 삭제</button>}{value.photoName && <p className="max-w-52 truncate text-[10px] text-muted-foreground">{value.photoName}</p>}</div></div>{error && <p aria-live="polite" className="mt-3 text-xs font-bold text-red-600">{error}</p>}</section>;
}

// 각 섹션 종류의 폼을 PDF 출력 배치와 같은 모양으로 만든다.
// 항목: 왼쪽 좁은 기간 칸 + 오른쪽 넓은 내용 칸 (.resume-item의 26mm / 1fr 미러)
// 인적사항: 왼쪽 텍스트 + 오른쪽 증명사진 (.resume-identity 미러)
// 키워드: 칩 나열 (.resume-tags 미러)
const itemPlaceholders: Record<string, { title: string; subtitle: string; body: string }> = {
  experience: { title: "예: 결제 API 재설계", subtitle: "예: 카모 · 플랫폼팀", body: "예: 일평균 12초였던 결제 응답을 캐시 계층과 쿼리 재작성으로 1.4초까지 줄였습니다." },
  projects: { title: "예: 정산 배치 이관", subtitle: "예: 사내 정산팀 협업", body: "예: 매일 새벽 실패하던 정산 배치를 멱등 처리로 바꿔 재실행 없이 마감되도록 했습니다." },
  education: { title: "예: 컴퓨터공학 학사", subtitle: "예: OO대학교", body: "예: 졸업 논문 주제나 관련 과목을 한 줄로 적습니다." },
};
const defaultItemPlaceholder = { title: "예: 정보처리기사", subtitle: "예: 한국산업인력공단", body: "예: 이 항목을 이력서에서 어떻게 설명할지 적습니다." };
const itemPlaceholder = (sectionId: string) => itemPlaceholders[sectionId] ?? defaultItemPlaceholder;
// inspectResumeReadiness와 같은 기준: 제목은 항상 필수, 설명은 experience에서만 필수.
const countItemTodos = (item: ItemContent, sectionId: string) =>
  (item.title.trim() ? 0 : 1) + (sectionId === "experience" && !item.body.trim() ? 1 : 0);
// 섹션 전체의 미기입 개수 — 모달 헤더에 "작성 필요 N"으로 보여준다.
function countSectionTodos(section: ResumeSection, content: SectionContent) {
  if (section.kind === "identity") {
    const value = content as IdentityContent;
    return (value.name.trim() ? 0 : 1) + (value.email.trim() ? 0 : 1);
  }
  if (section.kind === "eligibility") return 0;
  if (section.kind === "narrative") return narrativePlainText(content as NarrativeContent).trim() ? 0 : 1;
  if (section.kind === "tags") return (content as TagsContent).items.some((item) => item.trim()) ? 0 : 1;
  const items = (content as ItemsContent).items;
  if (!items.length) return 1;
  return items.reduce((total, item) => total + countItemTodos(item, section.id), 0);
}
// 완료 표시 — 앱 다른 화면과 같은 괘선녹 체크
function DoneMark() {
  return <Check aria-label="작성 완료" className="ml-1 h-4 w-4 shrink-0 text-primary" role="img" />;
}
function TodoChip({ count }: { count: number }) {
  return <span className="shrink-0 border border-wg-todo/40 bg-wg-todo/10 px-1.5 py-0.5 text-[10px] font-extrabold text-wg-todo">작성 필요 {count}</span>;
}

function ItemEditorCard({ index, item, sectionId, workItems, bodyLabel, bodyRequired, showBody = true, collapsible = false, tone = "default", headerExtra, headerNote, canMoveUp, canMoveDown, onChange, onDelete, onMoveUp, onMoveDown }: {
  index: number;
  item: ItemContent;
  sectionId: string;
  workItems: ItemContent[];
  bodyLabel: string;
  bodyRequired?: boolean;
  showBody?: boolean;
  collapsible?: boolean;
  tone?: "default" | "override" | "hidden";
  headerExtra?: React.ReactNode;
  headerNote?: React.ReactNode;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onChange: (patch: Partial<ItemContent>) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const label = item.title.trim() || `항목 ${index + 1}`;
  const placeholder = itemPlaceholder(sectionId);
  const todoCount = tone === "hidden" ? 0 : countItemTodos(item, sectionId);
  const summary = [formatItemPeriod(item), item.subtitle].filter(Boolean).join(" · ");
  const body = <div className="grid sm:grid-cols-[168px_minmax(0,1fr)]">
    <div className="border-b border-border bg-muted/20 p-3 sm:border-b-0 sm:border-r">
      <p className="mb-2 text-[10px] font-extrabold tracking-wide text-muted-foreground">기간</p>
      <ResumeItemDateFields layout="stack" sectionId={sectionId} value={item} onChange={onChange} />
      <p className="mt-3 hidden text-[10px] leading-4 text-muted-foreground sm:block">PDF에서도 이 자리에 좁게 찍힙니다.</p>
    </div>
    <div className="grid gap-4 p-4">
      <Field label="제목" placeholder={placeholder.title} required value={item.title} onChange={(title) => onChange({ title })} />
      <Field label="조직·부제" placeholder={placeholder.subtitle} value={item.subtitle} onChange={(subtitle) => onChange({ subtitle })} />
      {sectionId === "projects" && <div className="grid gap-4 sm:grid-cols-2"><CareerDetailControls item={item} workItems={workItems} onChange={onChange} /></div>}
      <TextArea hint="괘선이 그어진 넓은 칸입니다. 한 항목당 2~4줄이 읽기 좋습니다." label={bodyLabel} minRows={4} placeholder={placeholder.body} required={bodyRequired} ruled showCount value={item.body} onChange={(text) => onChange({ body: text })} />
    </div>
  </div>;
  const header = <>
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center bg-foreground text-[10px] font-black text-background">{String(index + 1).padStart(2, "0")}</span>
      <span className="min-w-0">
        <span className={cx("block truncate text-xs font-extrabold", tone === "hidden" && "line-through", !item.title.trim() && tone !== "hidden" && "text-wg-todo")}>{item.title.trim() || "제목 없음"}</span>
        {(headerNote || summary) && <span className="block truncate text-[10px] font-bold text-muted-foreground">{headerNote ?? summary}</span>}
      </span>
      {showBody && (todoCount > 0 ? <TodoChip count={todoCount} /> : <DoneMark />)}
    </span>
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {headerExtra}
      {collapsible && <span aria-hidden="true" className="grid h-8 w-8 place-items-center border border-border bg-background" data-item-chevron><ChevronDown className="h-4 w-4" /></span>}
      {onMoveUp && <button aria-label={`${label} 위로`} className="grid h-8 w-8 place-items-center border border-border bg-background disabled:opacity-40" disabled={!canMoveUp} onClick={onMoveUp} type="button"><ArrowUp className="h-3.5 w-3.5" /></button>}
      {onMoveDown && <button aria-label={`${label} 아래로`} className="grid h-8 w-8 place-items-center border border-border bg-background disabled:opacity-40" disabled={!canMoveDown} onClick={onMoveDown} type="button"><ArrowDown className="h-3.5 w-3.5" /></button>}
      {onDelete && <button aria-label={`${label} 삭제`} className="grid h-8 w-8 place-items-center border border-red-200 bg-background text-red-600" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete(); }}><Trash2 className="h-3.5 w-3.5" /></button>}
    </span>
  </>;
  const frame = cx("border bg-background", tone === "override" ? "border-primary/40" : tone === "hidden" ? "border-dashed border-border opacity-60" : "border-border", todoCount > 0 && showBody && "border-l-[3px] border-l-wg-todo");
  // collapsible일 때 details를 쓰면 저장 검증이 접힌 항목을 open 처리한 뒤 포커스할 수 있다.
  if (collapsible) return <fieldset className={frame} data-resume-edit-item-id={item.id}>
    <details open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">{header}</summary>
      {body}
    </details>
  </fieldset>;
  return <fieldset className={frame} data-resume-edit-item-id={item.id}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">{header}</div>
    {showBody && body}
  </fieldset>;
}

function ItemsEditor({ section, content, workItems, onChange }: { section: ResumeSection; content: ItemsContent; workItems: ItemContent[]; onChange: (content: SectionContent) => void }) {
  const updateItem = (id: string, patch: Partial<ItemContent>) => onChange({ ...content, items: content.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const hasManualDuration = content.careerDurationOverrideMonths !== undefined
    && Number.isFinite(content.careerDurationOverrideMonths)
    && content.careerDurationOverrideMonths >= 0;
  const durationMonths = hasManualDuration ? Math.trunc(content.careerDurationOverrideMonths!) : 0;
  const durationControls = isCareerTimelineSectionId(section.id) && <EditorBlock note="PDF 제목 옆에 표시됩니다" title={section.id === "experience" ? "경력 표시 설정" : "경력 상세 표시 설정"}>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">시작 연월 정렬<select className="wg-field h-10 px-3 text-sm font-normal" value={content.sortDirection ?? ""} onChange={(event) => onChange({ ...content, sortDirection: (event.target.value || undefined) as ItemsContent["sortDirection"] })}><option value="">수동 순서</option><option value="latest-first">최신순</option><option value="oldest-first">오래된순</option></select></label>
      {section.id === "experience" && <fieldset><legend className="mb-2 text-xs font-bold text-muted-foreground">총 경력</legend><div className="flex flex-wrap gap-3"><label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={!hasManualDuration} name="career-duration-mode" type="radio" onChange={() => onChange({ ...content, careerDurationOverrideMonths: undefined })} /> 자동 계산</label><label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={hasManualDuration} name="career-duration-mode" type="radio" onChange={() => onChange({ ...content, careerDurationOverrideMonths: calculateAutomaticCareerDurationMonths(content.items, currentLocalMonth()) })} /> 직접 입력</label></div>{hasManualDuration && <div className="mt-3 grid grid-cols-2 gap-2"><label className="grid gap-1 text-[11px] font-bold text-muted-foreground">경력 연<input aria-label="경력 연" className="wg-field h-10 px-3 text-sm" min={0} type="number" value={Math.floor(durationMonths / 12)} onChange={(event) => onChange({ ...content, careerDurationOverrideMonths: normalizeCareerDurationOverride(Number(event.target.value), durationMonths % 12) })} /></label><label className="grid gap-1 text-[11px] font-bold text-muted-foreground">경력 개월<input aria-label="경력 개월" className="wg-field h-10 px-3 text-sm" max={11} min={0} type="number" value={durationMonths % 12} onChange={(event) => onChange({ ...content, careerDurationOverrideMonths: normalizeCareerDurationOverride(Math.floor(durationMonths / 12), Number(event.target.value)) })} /></label></div>}</fieldset>}
    </div>
  </EditorBlock>;
  return <div className="grid gap-4">
    {durationControls}
    <div className="grid gap-3">{content.items.map((item, index) => <ItemEditorCard
      bodyLabel="설명"
      bodyRequired={section.id === "experience"}
      collapsible
      index={index}
      item={item}
      key={item.id}
      sectionId={section.id}
      workItems={workItems}
      onChange={(patch) => updateItem(item.id, patch)}
      onDelete={() => onChange({ ...content, items: content.items.filter((entry) => entry.id !== item.id) })}
    />)}</div>
    <button className="inline-flex h-11 items-center justify-center gap-2 border border-dashed border-primary px-4 text-sm font-bold text-primary" onClick={() => onChange({ ...content, items: [...content.items, { id: `item-${Date.now()}`, itemKind: defaultItemKind(section.id), detailType: section.id === "projects" ? "project" : undefined, meta: "", startMonth: "", endMonth: "", endMonthEnabled: false, isCurrent: false, title: "", subtitle: "", body: "" }] })} type="button"><Plus className="h-4 w-4" /> 항목 추가</button>
  </div>;
}

function StructuredEditor({ section, content, workItems = [], onChange }: { section: ResumeSection; content: SectionContent; workItems?: ItemContent[]; onChange: (content: SectionContent) => void }) {
  if (section.kind === "identity") {
    const value = content as IdentityContent;
    const localToday = formatDateOnly(new Date());
    return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid content-start gap-4">
        <EditorBlock note="PDF 왼쪽 위" title="기본 연락 정보 · 공통">
          <div className="grid gap-4">
            <Field label="이름" large placeholder="예: 김하늘" required value={value.name} onChange={(name) => onChange({ ...value, name })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="이메일" placeholder="예: haneul@example.com" required value={value.email} onChange={(email) => onChange({ ...value, email })} />
              <Field label="전화번호" placeholder="예: 010-1234-5678" type="tel" value={value.phone ?? ""} onChange={(phone) => onChange({ ...value, phone })} />
              <Field label="거주 지역" placeholder="예: 서울 양천구" value={value.location ?? ""} onChange={(location) => onChange({ ...value, location })} />
            </div>
          </div>
        </EditorBlock>
        <EditorBlock note="PDF 이름 아래 한 줄" title="신상 정보 · 공통">
          <div className="grid gap-4 sm:grid-cols-2 pt-overflow-visible"><DateInput
      label="생년월일"
      value={value.birthDate ?? ""}
      onChange={(birthDate) => onChange({ ...value, birthDate })}
      min="1900-01-01"
      max={localToday}
      startMonth="1900-01-01"
      endMonth={localToday}
      reverseYears
      quickActions={[]}
    /><SelectField label="성별" options={["남성", "여성", "기타"]} value={value.gender} onChange={(gender) => onChange({ ...value, gender })} /></div>
        </EditorBlock>
        <EditorBlock note="연락처 아래 세로로 나열됩니다" title="링크">
          <ListEditor addLabel="링크 추가" hint="http:// 또는 https:// 로 시작해야 합니다." items={value.links} label="링크" labelHidden placeholder="https://github.com/..." onChange={(links) => onChange({ ...value, links })} />
        </EditorBlock>
      </div>
      <div className="lg:w-56"><IdentityPhotoField value={value} onChange={(photo) => onChange({ ...value, ...photo })} /></div>
    </div>;
  }
  if (section.kind === "eligibility") {
    const value = content as EligibilityContent;
    const facts = [value.militaryStatus && `병역 ${value.militaryStatus}`, value.veteranStatus && `보훈 ${value.veteranStatus}`, value.disabilityStatus && `장애 ${value.disabilityStatus}`, value.employmentProtectionStatus && `취업보호 ${value.employmentProtectionStatus}`].filter(Boolean) as string[];
    return <EditorBlock note="모두 선택 항목" title="병역 · 보훈 · 장애 · 취업보호">
      <p className="mb-4 text-[11px] leading-5 text-muted-foreground">중요도가 낮은 공통 사실로 관리하며 기본 PDF의 마지막 섹션에 표시합니다.</p>
      <div className="grid gap-4 sm:grid-cols-2"><SelectField label="병역 여부" options={["군필", "미필", "복무 중", "면제", "해당 없음"]} value={value.militaryStatus} onChange={(militaryStatus) => onChange({ ...value, militaryStatus })} /><SelectField label="보훈 대상" options={["대상", "비대상"]} value={value.veteranStatus} onChange={(veteranStatus) => onChange({ ...value, veteranStatus })} /><SelectField label="장애 여부" options={["해당", "해당 없음"]} value={value.disabilityStatus} onChange={(disabilityStatus) => onChange({ ...value, disabilityStatus })} /><SelectField label="취업보호 대상" options={["대상", "비대상"]} value={value.employmentProtectionStatus} onChange={(employmentProtectionStatus) => onChange({ ...value, employmentProtectionStatus })} /></div>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[10px] font-extrabold tracking-wide text-muted-foreground">PDF에는 이렇게 한 줄로 찍힙니다</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{facts.length ? facts.join(" · ") : "선택한 정보가 없습니다."}</p>
      </div>
    </EditorBlock>;
  }
  if (section.kind === "narrative") return <RichNarrativeEditor content={content as NarrativeContent} onChange={onChange} />;
  if (section.kind === "tags") { const value = content as TagsContent; return <EditorBlock note="PDF에도 같은 칩 모양으로 나열됩니다" title="역량 · 키워드"><ListEditor addLabel="항목 추가" hint="짧은 낱말이 좋습니다. 문장을 넣으면 칩이 줄을 넘깁니다." items={value.items} label="항목" placeholder="예: 문제 해결" required variant="chips" onChange={(items) => onChange({ items })} /></EditorBlock>; }
  if (section.layout === "highlight-grid") return <HighlightGridEditor content={content as ItemsContent} onChange={onChange} />;
  return <ItemsEditor content={content as ItemsContent} section={section} workItems={workItems} onChange={onChange} />;
}

function HighlightGridEditor({ content, onChange }: { content: ItemsContent; onChange: (content: ItemsContent) => void }) {
  const updateItem = (id: string, patch: Partial<ItemContent>) => onChange({ ...content, items: content.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const moveItem = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= content.items.length) return;
    const items = [...content.items];
    [items[index], items[target]] = [items[target], items[index]];
    onChange({ ...content, items });
  };
  return <EditorBlock note="PDF에서는 한 줄에 두 카드씩 배치됩니다" title="2열 강조 카드">
    <p className="mb-4 text-[11px] leading-5 text-muted-foreground">핵심 역량처럼 먼저 보여주고 싶은 내용을 제목과 짧은 근거로 작성하세요. 카드가 늘어나면 두 개씩 다음 줄에 배치됩니다.</p>
    <div className="grid gap-4 sm:grid-cols-2">{content.items.map((item, index) => <fieldset className="border border-border bg-background" key={item.id}>
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2"><span className="flex items-center gap-2 text-xs font-extrabold"><span className="text-orange-600">{String(index + 1).padStart(2, "0")}</span>{item.title || "강점 제목"}</span><span className="flex gap-1"><button aria-label={`${item.title || `카드 ${index + 1}`} 위로`} className="grid h-8 w-8 place-items-center border border-border bg-background disabled:opacity-30" disabled={index === 0} onClick={() => moveItem(index, -1)} type="button"><ArrowUp className="h-3.5 w-3.5" /></button><button aria-label={`${item.title || `카드 ${index + 1}`} 아래로`} className="grid h-8 w-8 place-items-center border border-border bg-background disabled:opacity-30" disabled={index === content.items.length - 1} onClick={() => moveItem(index, 1)} type="button"><ArrowDown className="h-3.5 w-3.5" /></button><button aria-label={`${item.title || `카드 ${index + 1}`} 삭제`} className="grid h-8 w-8 place-items-center border border-red-200 bg-background text-red-600" onClick={() => onChange({ ...content, items: content.items.filter((entry) => entry.id !== item.id) })} type="button"><Trash2 className="h-3.5 w-3.5" /></button></span></div>
      <div className="grid gap-4 p-4"><Field label="강점 제목" placeholder="예: 문제를 구조화하는 힘" required value={item.title} onChange={(title) => updateItem(item.id, { title })} /><Field label="짧은 보조 문구" placeholder="예: 복잡한 요구사항을 실행 단위로 전환" value={item.subtitle} onChange={(subtitle) => updateItem(item.id, { subtitle })} /><TextArea label="근거 설명" minRows={4} placeholder="강점을 보여주는 경험과 결과를 2~3문장으로 적어주세요." ruled showCount value={item.body} onChange={(body) => updateItem(item.id, { body })} /></div>
    </fieldset>)}</div>
    <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 border border-dashed border-primary px-4 text-sm font-bold text-primary" onClick={() => onChange({ ...content, items: [...content.items, { id: `highlight-${Date.now()}`, meta: "", title: "", subtitle: "", body: "" }] })} type="button"><Plus className="h-4 w-4" /> 강조 카드 추가</button>
  </EditorBlock>;
}

function CareerDetailControls({ item, workItems, onChange }: { item: ItemContent; workItems: ItemContent[]; onChange: (patch: Partial<ItemContent>) => void }) {
  const hasValidParent = Boolean(item.relatedWorkItemId && workItems.some((work) => work.id === item.relatedWorkItemId));
  const unresolved = Boolean((item.relatedWorkItemId || item.relatedWorkTitle?.trim()) && !hasValidParent);
  return <>
    <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">상세 유형<select className="wg-field h-10 px-3 text-sm font-normal" value={item.detailType ?? "project"} onChange={(event) => onChange({ detailType: event.target.value as ItemContent["detailType"], itemKind: "career-detail" })}>{Object.entries(detailTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">연결 경력<select className="wg-field h-10 px-3 text-sm font-normal" value={hasValidParent ? item.relatedWorkItemId : unresolved ? "__unresolved" : ""} onChange={(event) => {
      const work = workItems.find((candidate) => candidate.id === event.target.value);
      onChange(work ? { relatedWorkItemId: work.id, relatedWorkTitle: work.title } : { relatedWorkItemId: undefined, relatedWorkTitle: undefined });
    }}><option value="">독립 프로젝트</option>{unresolved && <option value="__unresolved" disabled>연결 확인 필요 · {item.relatedWorkTitle}</option>}{workItems.map((work) => <option key={work.id} value={work.id}>{work.title} · {work.subtitle} · {formatItemPeriod(work)}</option>)}</select>{unresolved && <span className="text-[11px] font-bold text-amber-700">연결 확인 필요</span>}</label>
  </>;
}

// rows = 세로 나열(링크: PDF의 .resume-contact와 같은 모양), chips = 칩 나열(키워드: .resume-tags와 같은 모양)
function ListEditor({ label, addLabel, items, placeholder, onChange, variant = "rows", required, hint, labelHidden }: { label: string; addLabel: string; items: string[]; placeholder: string; onChange: (items: string[]) => void; variant?: "rows" | "chips"; required?: boolean; hint?: string; labelHidden?: boolean }) {
  const update = (index: number, next: string) => onChange(items.map((value, itemIndex) => itemIndex === index ? next : value));
  const remove = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index));
  const needsInput = Boolean(required) && !items.some((item) => item.trim());
  if (variant === "chips") return <div>
    {labelHidden ? <span className="sr-only">{label}</span> : <FieldLabel label={label} needsInput={needsInput} required={required} />}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {items.map((item, index) => <span className="wg-field inline-flex items-center" key={index}>
        <input aria-label={`${label} ${index + 1}`} className="h-9 min-w-24 border-0 bg-transparent px-2 text-sm font-bold field-sizing-content focus:outline-none" placeholder={placeholder} value={item} onChange={(event) => update(index, event.target.value)} />
        <button aria-label={`${label} ${index + 1} 삭제`} className="grid h-9 w-8 shrink-0 place-items-center border-l border-border text-red-600" onClick={() => remove(index)} type="button"><X className="h-3.5 w-3.5" /></button>
      </span>)}
      <button className={cx("inline-flex h-9 items-center gap-2 border border-dashed px-3 text-xs font-bold", needsInput ? "border-wg-todo bg-wg-todo/[.06] text-wg-todo" : "border-primary text-primary")} onClick={() => onChange([...items, ""])} type="button"><Plus className="h-3.5 w-3.5" /> {addLabel}</button>
    </div>
    {hint && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
  </div>;
  return <div>
    {labelHidden ? <span className="sr-only">{label}</span> : <FieldLabel label={label} needsInput={needsInput} required={required} />}
    <div className={labelHidden ? "grid gap-2" : "mt-2 grid gap-2"}>{items.map((item, index) => <div className="flex gap-2" key={index}><input aria-label={`${label} ${index + 1}`} className="wg-field h-10 min-w-0 flex-1 px-3 text-sm" placeholder={placeholder} value={item} onChange={(event) => update(index, event.target.value)} /><button aria-label={`${label} ${index + 1} 삭제`} className="grid h-10 w-10 place-items-center border border-red-200 text-red-600" onClick={() => remove(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
    <button className="mt-2 inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-bold" onClick={() => onChange([...items, ""])} type="button"><Plus className="h-3.5 w-3.5" /> {addLabel}</button>
    {hint && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
  </div>;
}

function ItemTailoringDialog({ state, profileId, variantId, scope, section, workItems, onSave, onClose, onEditParent, onEditCurrent }: { state: ResumeDocumentState; profileId: string; variantId?: string; scope: "role" | "document"; section: ResumeSection; workItems: ItemContent[]; onSave: (state: ResumeDocumentState) => void; onClose: () => void; onEditParent: () => void; onEditCurrent: () => void }) {
  const [draftState, setDraftState] = useState(() => clone(state));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const profile = draftState.roleProfiles.find((item) => item.id === profileId)!;
  const variant = variantId ? draftState.variants.find((item) => item.id === variantId) : undefined;
  const baseItems = (section.content as ItemsContent).items;
  const setting = scope === "role" ? profile.settings[section.id] : variant?.settings[section.id];
  const order = setting?.itemOrder?.length ? setting.itemOrder : baseItems.map((item) => item.id);
  const ordered = [...order.flatMap((id) => baseItems.find((item) => item.id === id) ?? []), ...baseItems.filter((item) => !order.includes(item.id))];
  const parentContent = resolveSection(section, profile).content as ItemsContent;
  const parentById = new Map(parentContent.items.map((item) => [item.id, item]));
  const changeDraft = (updater: (current: ResumeDocumentState) => ResumeDocumentState) => {
    setDraftState(updater);
    setDirty(true);
    setError("");
  };
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("저장하지 않은 변경 사항을 버릴까요?")) return;
    onClose();
  }, [dirty, onClose]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") requestClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [requestClose]);

  const updateMode = (item: ItemContent, mode: ItemMode) => changeDraft((current) => {
    if (scope === "role") {
      if (mode === "inherit") return clearRoleProfileItemSetting(current, profileId, section.id, item.id);
      return updateRoleProfileItemSetting(current, profileId, section.id, item.id, { mode, content: mode === "override" ? clone(item) : undefined });
    }
    if (!variantId) return current;
    if (mode === "inherit") return clearDocumentItemSetting(current, variantId, section.id, item.id);
    return updateDocumentItemSetting(current, variantId, section.id, item.id, { mode, content: mode === "override" ? clone(parentById.get(item.id) ?? item) : undefined });
  });
  const updateContent = (itemId: string, patch: Partial<ItemContent>) => changeDraft((current) => {
    const currentProfile = current.roleProfiles.find((item) => item.id === profileId)!;
    const currentVariant = variantId ? current.variants.find((item) => item.id === variantId) : undefined;
    const currentSetting = scope === "role" ? currentProfile.settings[section.id]?.itemSettings?.[itemId] : currentVariant?.settings[section.id]?.itemSettings?.[itemId];
    const base = currentSetting?.content ?? (scope === "document" ? parentById.get(itemId) : baseItems.find((item) => item.id === itemId))!;
    return scope === "role"
      ? updateRoleProfileItemSetting(current, profileId, section.id, itemId, { mode: "override", content: { ...base, ...patch } })
      : variantId ? updateDocumentItemSetting(current, variantId, section.id, itemId, { mode: "override", content: { ...base, ...patch } }) : current;
  });
  const move = (itemId: string, offset: number) => changeDraft((current) => {
    const nextOrder = [...order];
    const index = nextOrder.indexOf(itemId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= nextOrder.length) return current;
    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
    return scope === "role" ? updateRoleProfileSectionSetting(current, profileId, section.id, { itemOrder: nextOrder }) : variantId ? updateSectionSetting(current, variantId, section.id, { itemOrder: nextOrder }) : current;
  });
  const save = () => {
    const invalid = ordered.flatMap((item) => {
      const itemSetting = setting?.itemSettings?.[item.id];
      const editable = itemSetting?.content ?? (scope === "document" ? parentById.get(item.id) : item) ?? item;
      const issue = itemSetting?.mode === "override" ? findResumeItemDateIssue(editable, section.id) : null;
      return issue ? [{ item, issue }] : [];
    })[0];
    if (invalid) {
      setError(invalid.issue.message);
      window.setTimeout(() => focusItemDateField(invalid.item.id, invalid.issue.field), 0);
      return;
    }
    const normalized = clone(draftState);
    const targetSetting = scope === "role"
      ? normalized.roleProfiles.find((item) => item.id === profileId)?.settings[section.id]
      : normalized.variants.find((item) => item.id === variantId)?.settings[section.id];
    if (targetSetting?.itemSettings) {
      targetSetting.itemSettings = Object.fromEntries(Object.entries(targetSetting.itemSettings).map(([id, itemSetting]) => [id, itemSetting.content ? { ...itemSetting, content: normalizeResumeItemDates(itemSetting.content, section.id) } : itemSetting]));
    }
    onSave(normalized);
    onClose();
  };
  const scopeLabel = scope === "role" ? `${profile.name} 직군 이력서` : `${profile.name} → ${variant?.name ?? "지원 이력서"}`;
  // 상속 / 재작성 / 제외를 셀렉트 대신 3분할 버튼으로. 카드 테두리로도 같은 상태를 보여준다.
  const modeOptions: Array<{ value: ItemMode; short: string; full: string }> = [
    { value: "inherit", short: "상속", full: scope === "role" ? "공통 정보 사용" : "직군 이력서 사용" },
    { value: "override", short: "재작성", full: "이 단계에서 재작성" },
    { value: "hidden", short: "제외", full: scope === "role" ? "현재 직군 이력서에서 제외" : "현재 지원 이력서에서 제외" },
  ];
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-modal="true" className="resume-dialog-panel my-auto flex max-h-[92vh] w-full max-w-5xl flex-col border border-border bg-background shadow-2xl" role="dialog">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">편집 범위 · {scopeLabel} · 이 이력서에만 저장</p><h2 className="mt-1 text-xl font-extrabold">{section.title} {section.id === "experience" ? "경험 선택·편집" : "포함 항목 선택"}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">항목마다 상위 단계 사용, 재작성, 현재 이력서에서 제외를 선택하고 순서를 바꿀 수 있습니다.</p></div><button aria-label="항목 편집 닫기" className="grid h-10 w-10 shrink-0 place-items-center border border-border" onClick={requestClose}><X className="h-4 w-4" /></button></header>
    <div className="resume-dialog-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-5">{ordered.length === 0 ? <div className="border border-dashed border-border bg-muted/20 p-8 text-center"><p className="font-extrabold">상위 단계에도 작성된 항목이 없습니다.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">공통·직군 정보를 먼저 작성하거나, 현재 이력서에 바로 항목을 만들 수 있습니다.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button className="h-10 border border-border bg-background px-4 text-sm font-bold" onClick={onEditParent}>상위 정보 작성하기</button><button className="h-10 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onEditCurrent}>이 이력서에 직접 작성</button></div></div> : ordered.map((item, index) => {
      const itemSetting = setting?.itemSettings?.[item.id];
      const mode = itemSetting?.mode ?? "inherit";
      const editable = itemSetting?.content ?? (scope === "document" ? parentById.get(item.id) : item) ?? item;
      const modeLabel = modeOptions.find((option) => option.value === mode)?.full ?? "";
      return <ItemEditorCard
        bodyLabel="강조 설명"
        bodyRequired={section.id === "experience"}
        canMoveDown={index < ordered.length - 1}
        canMoveUp={index > 0}
        headerExtra={<span aria-label={`${item.title || `항목 ${index + 1}`} 항목 방식`} className="inline-flex border border-border bg-background" role="group">{modeOptions.map((option) => <button aria-pressed={mode === option.value} className={cx("h-8 px-2 text-[11px] font-bold", mode === option.value ? option.value === "hidden" ? "bg-foreground text-background" : "bg-primary text-primary-foreground" : "text-muted-foreground")} key={option.value} title={option.full} type="button" onClick={() => updateMode(item, option.value)}>{option.short}</button>)}</span>}
        headerNote={<>{modeLabel}{item.source && ` · 경력기술서 연동 ${item.source.id}`}</>}
        index={index}
        item={editable}
        key={item.id}
        sectionId={section.id}
        showBody={mode === "override"}
        tone={mode === "override" ? "override" : mode === "hidden" ? "hidden" : "default"}
        workItems={workItems}
        onChange={(patch) => updateContent(item.id, patch)}
        onMoveDown={() => move(item.id, 1)}
        onMoveUp={() => move(item.id, -1)}
      />;
    })}{error && <p aria-live="assertive" className="sticky bottom-0 border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}</div>
    <footer className="resume-dialog-footer flex shrink-0 justify-end gap-2 border-t border-border bg-muted/30 p-4"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={requestClose}>취소</button><button className="h-10 bg-primary px-5 text-sm font-bold text-primary-foreground" onClick={save}>저장</button></footer>
  </section></div>;
}

function ExperienceBrickSyncDialog({ onClose, onSync }: { onClose: () => void; onSync: (bricks: ExperienceBrickReference[]) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "success" | "empty" | "error">("loading");
  const [syncedCount, setSyncedCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    const load = async () => {
      try {
        const response = await fetch("/api/resume/bricks/all", { cache: "no-store", signal: controller.signal });
        const payload: unknown = await response.json().catch(() => null);
        const items = typeof payload === "object" && payload !== null && "items" in payload && Array.isArray(payload.items)
          ? payload.items as ExperienceBrickReference[]
          : null;
        if (!response.ok || !items) throw new Error("invalid-response");
        if (items.length === 0) {
          setSyncedCount(0);
          setStatus("empty");
          return;
        }
        onSync(items);
        setSyncedCount(items.length);
        setStatus("success");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt, onSync]);

  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="experience-sync-title" aria-modal="true" className="resume-dialog-panel my-auto w-full max-w-2xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex items-start justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">경력기술서 프로젝트 동기화</p><h2 className="mt-1 text-xl font-extrabold" id="experience-sync-title">확정 경험 일괄 가져오기</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">확정된 경력·프로젝트를 공통 섹션에 한 번에 동기화합니다. 수동 항목과 서버에서 사라진 기존 스냅샷은 삭제하지 않습니다.</p></div><button aria-label="경력 프로젝트 동기화 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onClose}><X className="h-4 w-4" /></button></header><div aria-live="polite" className="min-h-36 p-5">{status === "loading" && <p className="border border-primary/30 bg-primary/5 p-4 text-sm font-bold text-primary">확정 경험을 불러오는 중입니다…</p>}{status === "success" && <div className="border border-primary/30 bg-primary/5 p-4"><p className="font-extrabold">확정 경험 {syncedCount}개를 동기화했습니다.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">각 직군·지원 이력서의 경험 선택·편집에서 순서, 재작성, 제외 여부를 따로 관리할 수 있습니다.</p></div>}{status === "empty" && <p className="border border-border bg-muted/30 p-4 text-sm font-bold">동기화할 확정 경험이 없습니다.</p>}{status === "error" && <div className="border border-red-200 bg-red-50 p-4 text-red-700"><p className="text-sm font-extrabold">경력 프로젝트를 불러오지 못했습니다.</p><p className="mt-1 text-xs">로그인 상태와 네트워크를 확인한 뒤 다시 시도해 주세요.</p><button className="mt-4 h-9 border border-red-300 bg-white px-3 text-xs font-bold" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button></div>}</div><footer className="resume-dialog-footer flex justify-end border-t border-border bg-muted/30 p-4"><button className="h-10 bg-primary px-5 text-sm font-bold text-primary-foreground" onClick={onClose}>닫기</button></footer></section></div>;
}

function ReadinessDialog({ issues, onClose, onIssue }: { issues: ResumeReadinessIssue[]; onClose: () => void; onIssue: (issue: ResumeReadinessIssue) => void }) {
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="resume-readiness-title" aria-modal="true" className="my-auto w-full max-w-2xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex items-start justify-between gap-4 border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">PDF 저장 전 확인</p><h2 className="mt-1 text-xl font-extrabold" id="resume-readiness-title">작성 점검</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">수정을 권하는 항목만 안내합니다. 문제가 있어도 PDF 저장은 막지 않습니다.</p></div><button aria-label="작성 점검 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onClose}><X className="h-4 w-4" /></button></header><div className="max-h-[65vh] overflow-y-auto p-5">{issues.length ? <><p className="mb-3 text-sm font-extrabold">확인할 항목 {issues.length}개</p><ol className="grid gap-2">{issues.map((issue, index) => <li className="flex items-center gap-3 border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950" key={`${issue.code}-${issue.sectionId ?? "document"}-${issue.itemId ?? index}`}><span className="grid h-6 w-6 shrink-0 place-items-center bg-amber-500 text-xs font-black text-white">{index + 1}</span><span className="min-w-0 flex-1">{issue.message}</span><button className="shrink-0 border border-amber-400 bg-white px-3 py-1 text-xs font-extrabold text-amber-900" onClick={() => onIssue(issue)} type="button">{issue.sectionId ? "섹션으로 이동" : "설정으로 이동"}</button></li>)}</ol></> : <div className="border border-primary/30 bg-primary/5 p-6 text-center"><Check className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-extrabold">기본 점검을 모두 통과했습니다.</p><p className="mt-1 text-xs text-muted-foreground">페이지 경계와 최종 문구를 확인한 뒤 PDF로 저장하세요.</p></div>}</div><footer className="flex justify-end border-t border-border bg-muted/30 p-4"><button className="h-10 bg-primary px-5 text-sm font-bold text-primary-foreground" onClick={onClose}>확인</button></footer></section></div>;
}

function AddSectionDialog({ afterTitle, templateId, title, onTemplate, onTitle, onCancel, onAdd }: { afterTitle: string; templateId: string; title: string; onTemplate: (templateId: string) => void; onTitle: (title: string) => void; onCancel: () => void; onAdd: () => void }) {
  const [category, setCategory] = useState<"all" | SectionTemplateCategory>("all");
  const [page, setPage] = useState(0);
  const pageSize = 4;
  const filteredTemplates = category === "all" ? sectionTemplates : sectionTemplates.filter((template) => template.category === category);
  const pageCount = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));
  const visibleTemplates = filteredTemplates.slice(page * pageSize, (page + 1) * pageSize);
  const previews: Record<string, React.ReactNode> = {
    "highlight-grid": <div className="grid grid-cols-2 gap-2"><span className="grid gap-1 border border-slate-300 bg-slate-50 p-2"><i className="h-1 w-5 bg-orange-500" /><i className="h-2 w-4/5 bg-slate-700" /><i className="h-1 w-full bg-slate-300" /></span><span className="grid gap-1 border border-slate-300 bg-slate-50 p-2"><i className="h-1 w-5 bg-orange-500" /><i className="h-2 w-3/4 bg-slate-700" /><i className="h-1 w-full bg-slate-300" /></span></div>,
    introduction: <div className="grid gap-1"><i className="h-1 w-full bg-slate-400" /><i className="h-1 w-5/6 bg-slate-300" /><i className="h-1 w-2/3 bg-slate-300" /></div>,
    "career-list": <div className="grid gap-2"><span className="grid grid-cols-[35px_1fr] gap-2"><i className="h-2 bg-slate-300" /><i className="h-2 bg-slate-700" /></span><span className="grid grid-cols-[35px_1fr] gap-2"><i className="h-2 bg-slate-300" /><i className="h-2 bg-slate-500" /></span></div>,
    "project-list": <div className="grid gap-2 border-l-2 border-slate-300 pl-2"><i className="h-2 w-2/3 bg-slate-700" /><i className="h-1 w-full bg-slate-300" /><i className="h-1 w-5/6 bg-slate-300" /></div>,
    keywords: <div className="flex gap-2"><i className="h-5 w-12 bg-slate-200" /><i className="h-5 w-16 bg-slate-200" /><i className="h-5 w-10 bg-slate-200" /></div>,
    education: <div className="grid grid-cols-[35px_1fr] gap-2"><i className="h-2 bg-slate-300" /><span className="grid gap-1"><i className="h-2 w-2/3 bg-slate-700" /><i className="h-1 w-1/2 bg-slate-300" /></span></div>,
    credentials: <div className="grid grid-cols-2 gap-2"><i className="h-6 border border-slate-300 bg-slate-50" /><i className="h-6 border border-slate-300 bg-slate-50" /></div>,
    identity: <div className="flex items-end justify-between"><span className="h-4 w-20 bg-slate-800" /><span className="grid gap-1"><i className="h-1 w-14 bg-slate-300" /><i className="h-1 w-10 bg-slate-300" /></span></div>,
    eligibility: <div className="flex flex-wrap gap-2"><i className="h-4 w-12 bg-slate-200" /><i className="h-4 w-12 bg-slate-200" /><i className="h-4 w-12 bg-slate-200" /></div>,
  };
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="add-resume-section-title" aria-modal="true" className="resume-dialog-panel my-auto w-full max-w-3xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex shrink-0 items-center justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">{afterTitle} 다음 위치</p><h2 className="mt-1 text-xl font-extrabold" id="add-resume-section-title">새 섹션 추가</h2><p className="mt-1 text-xs text-muted-foreground">용도에 맞는 템플릿을 고른 뒤 내용을 작성하세요.</p></div><button aria-label="추가 창 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onCancel}><X className="h-4 w-4" /></button></header><div className="resume-dialog-scroll grid gap-5 p-5"><fieldset><legend className="mb-2 text-xs font-bold text-muted-foreground">섹션 템플릿</legend><div aria-label="섹션 템플릿 카테고리" className="mb-4 flex flex-wrap gap-1">{sectionTemplateCategories.map((item) => <button aria-pressed={category === item.id} className={cx("h-9 border px-3 text-xs font-extrabold", category === item.id ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary")} key={item.id} onClick={() => { setCategory(item.id); setPage(0); }} type="button">{item.label}</button>)}</div><div className="grid gap-3 sm:grid-cols-2">{visibleTemplates.map((template) => <button aria-pressed={templateId === template.id} className={cx("relative border p-4 text-left transition-colors", templateId === template.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50")} key={template.id} onClick={() => onTemplate(template.id)} type="button">{templateId === template.id && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></span>}<span className="block pr-7 font-extrabold">{template.title}</span><span className="mt-1 block min-h-8 text-[11px] leading-4 text-muted-foreground">{template.description}</span><span aria-hidden="true" className="mt-3 block border border-slate-200 bg-white p-3">{previews[template.id]}</span></button>)}</div>{pageCount > 1 && <div className="mt-4 flex items-center justify-center gap-3"><button aria-label="이전 템플릿 페이지" className="h-8 border border-border px-3 text-xs font-bold disabled:opacity-30" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} type="button">이전</button><span className="text-[11px] font-bold text-muted-foreground">{page + 1} / {pageCount}</span><button aria-label="다음 템플릿 페이지" className="h-8 border border-border px-3 text-xs font-bold disabled:opacity-30" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} type="button">다음</button></div>}</fieldset><Field label="섹션 제목" value={title} placeholder="예: 오픈소스 활동" onChange={onTitle} /></div><footer className="resume-dialog-footer flex shrink-0 justify-end gap-2 border-t border-border bg-muted/30 p-4"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onCancel}>취소</button><button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40" disabled={!title.trim()} onClick={onAdd}><Plus className="h-4 w-4" /> 추가하고 내용 작성</button></footer></section></div>;
}

function Editor({ draft, profileCount, profileName, roleVariantCount, variantName, workItems, onChange, onCancel, onSave }: { draft: EditDraft; profileCount: number; profileName: string; roleVariantCount: number; variantName?: string; workItems: ItemContent[]; onChange: (draft: EditDraft) => void; onCancel: () => void; onSave: (draft: EditDraft) => void }) {
  const [targetOpen, setTargetOpen] = useState(false);
  const [error, setError] = useState("");
  const choosesTarget = !draft.section.custom && (draft.scope === "role" || draft.scope === "variant");
  const parentLabel = draft.scope === "variant" ? "직군 이력서로 저장하고 전파" : "공통 정보로 저장하고 전파";
  const currentLabel = draft.scope === "variant" ? "이 지원 버전 전용 섹션으로 저장" : "이 직군 전용 섹션으로 저장";
  const currentCompactLabel = draft.scope === "variant" ? "지원 버전 전용" : "직군 전용";
  const parentCompactLabel = draft.scope === "variant" ? "직군에 전파" : "공통에 전파";
  const scopeLabel = draft.scope === "shared" ? "공통 정보" : draft.scope === "role" || draft.scope === "role-custom" ? `${profileName} 직군 이력서` : `${profileName} → ${variantName ?? "지원 이력서"}`;
  const saveLabel = !choosesTarget ? "현재 편집 위치" : draft.saveTarget === "current" ? currentCompactLabel : parentCompactLabel;
  const sectionTodos = countSectionTodos(draft.section, draft.content);
  const savesToCommon = draft.scope === "shared" || (draft.scope === "role" && draft.saveTarget === "parent");
  const savesToRole = draft.scope === "variant" && draft.saveTarget === "parent";
  const saveButtonLabel = savesToCommon
    ? "공통 정보에 저장·전파"
    : savesToRole
      ? `${profileName} 직군에 저장·전파`
      : draft.scope === "variant" || draft.scope === "variant-custom"
        ? `${variantName ?? "지원 이력서"}에 저장`
        : `${profileName} 직군에 저장`;
  const propagationMessage = savesToCommon
    ? `${profileCount}개 직군 이력서에 반영될 수 있습니다. 직군별 재작성 내용은 유지됩니다.`
    : savesToRole
      ? `${roleVariantCount}개 지원 버전에 반영될 수 있습니다. 지원 버전별 재작성 내용은 유지됩니다.`
      : "";
  const save = () => {
    let nextDraft = draft;
    if (draft.section.kind === "items") {
      const content = draft.content as ItemsContent;
      const invalid = content.items.flatMap((item) => {
        const issue = findResumeItemDateIssue(item, draft.section.id);
        return issue ? [{ item, issue }] : [];
      })[0];
      if (invalid) {
        setError(invalid.issue.message);
        window.setTimeout(() => focusItemDateField(invalid.item.id, invalid.issue.field), 0);
        return;
      }
      nextDraft = { ...draft, content: { ...content, items: content.items.map((item) => normalizeResumeItemDates(item, draft.section.id)) } };
    }
    onSave(nextDraft);
  };
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="resume-section-editor-title" className="resume-dialog-panel my-auto flex max-h-[92vh] w-full max-w-5xl flex-col border border-border bg-background shadow-2xl" role="dialog" aria-modal="true"><header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5"><div className="min-w-0"><p className="text-[10px] font-bold tracking-widest text-primary">편집 범위 · {scopeLabel}</p><h2 className="mt-1 text-xl font-extrabold" id="resume-section-editor-title">{draft.title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{sectionKindGuidance[draft.section.kind]}</p><p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>저장 대상: <strong className="text-foreground">{saveLabel}</strong></span>{sectionTodos > 0 && <TodoChip count={sectionTodos} />}</p></div><button aria-label="편집 창 닫기" className="grid h-10 w-10 shrink-0 place-items-center border border-border" onClick={onCancel}><X className="h-4 w-4" /></button></header><div className="resume-dialog-scroll min-h-0 flex-1 overflow-y-auto p-5"><div className="mb-5 max-w-md"><Field hint="PDF에 이 섹션의 제목으로 찍힙니다." label="섹션 이름" placeholder="예: 경력" value={draft.title} onChange={(title) => onChange({ ...draft, title })} /></div><StructuredEditor section={draft.section} content={draft.content} workItems={workItems} onChange={(content) => { setError(""); onChange({ ...draft, content }); }} />{error && <p aria-live="assertive" className="mt-4 border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}</div><footer className="resume-dialog-footer flex shrink-0 flex-wrap items-end justify-between gap-3 border-t border-border bg-muted/30 p-4"><div className="min-w-0 flex-1">{choosesTarget && <button aria-expanded={targetOpen} className="text-xs font-extrabold text-primary underline underline-offset-2" onClick={() => setTargetOpen((open) => !open)} type="button">저장 범위 변경</button>}{choosesTarget && targetOpen && <fieldset aria-label="저장 위치" className="mt-2 flex flex-wrap items-center gap-1"><legend className="sr-only">저장 위치</legend><label aria-label={currentLabel} className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-[11px] font-bold", draft.saveTarget === "current" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground")} title={currentLabel}><input checked={draft.saveTarget === "current"} className="h-3 w-3" name="resume-save-target" type="radio" onChange={() => { onChange({ ...draft, saveTarget: "current" }); setTargetOpen(false); }} /> {currentCompactLabel}</label><label aria-label={parentLabel} className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-[11px] font-bold", draft.saveTarget === "parent" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground")} title={parentLabel}><input checked={draft.saveTarget === "parent"} className="h-3 w-3" name="resume-save-target" type="radio" onChange={() => { onChange({ ...draft, saveTarget: "parent" }); setTargetOpen(false); }} /> {parentCompactLabel}</label></fieldset>}{propagationMessage && <p aria-live="polite" className="mt-2 text-[11px] leading-5 text-amber-700">{propagationMessage}</p>}</div><div className="flex shrink-0 gap-2"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onCancel}>취소</button><button className="h-10 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={save}>{saveButtonLabel}</button></div></footer></section></div>;
}
