"use client";

import { ArrowDown, ArrowUp, Check, ClipboardCheck, Copy, Edit3, Eye, EyeOff, FileText, GripVertical, LayoutTemplate, MoreHorizontal, Plus, Printer, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { Reorder, useDragControls, type DragControls } from "framer-motion";
import Image from "next/image";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  RESUME_DOCUMENT_STORAGE_KEY,
  addCustomSection,
  addRoleCustomSection,
  addSharedSection,
  clearDocumentItemSetting,
  clearRoleProfileItemSetting,
  createResumeDocumentSeed,
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
  parseResumeDocumentState,
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

const roleModes: Record<SectionMode, string> = { inherit: "공통 정보 사용", override: "이 직군용 재작성", hidden: "이 직군에서 숨김" };
const kinds: Record<SectionKind, string> = { identity: "인적사항", narrative: "소개글", items: "경력·학력 등 목록", tags: "역량·키워드" };
const sectionKindGuidance: Record<SectionKind, string> = {
  identity: "연락처와 기본 정보를 한눈에 보여주는 프로필 형식",
  narrative: "문단 중심으로 소개와 핵심역량을 설명하는 글 형식",
  items: "기간과 항목을 나란히 정리하는 경력·학력 형식",
  tags: "짧은 키워드를 모아 빠르게 훑어보는 역량 형식",
};
type EditDraft = { scope: "shared" | "role" | "variant" | "role-custom" | "variant-custom"; section: ResumeSection; content: SectionContent; title: string; saveTarget: "current" | "parent" };
type ItemEditorState = { scope: "role" | "document"; section: ResumeSection };
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");
const clone = <T,>(value: T): T => structuredClone(value);

function measurePrintedPageCount(paper: HTMLElement) {
  const printClone = paper.cloneNode(true) as HTMLElement;
  printClone.classList.add("resume-print-measure");
  document.body.append(printClone);
  const a4PageHeight = printClone.clientWidth * (297 / 210);
  const pageCount = Math.max(1, Math.ceil(printClone.scrollHeight / Math.max(1, a4PageHeight)));
  printClone.remove();
  return pageCount;
}

export function ResumeDocumentBuilder() {
  const [state, setState] = useState<ResumeDocumentState>(() => createResumeDocumentSeed());
  const [view, setView] = useState<"resume" | "shared">("resume");
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [sharedSectionDialogOpen, setSharedSectionDialogOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionKind, setNewSectionKind] = useState<SectionKind>("items");
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState<"loading" | "saved" | "error">("loading");
  const paperRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setState(parseResumeDocumentState(localStorage.getItem(RESUME_DOCUMENT_STORAGE_KEY)) ?? createResumeDocumentSeed()); }
      catch { setState(createResumeDocumentSeed()); setStorageStatus("error"); }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const frame = window.requestAnimationFrame(() => {
      try { localStorage.setItem(RESUME_DOCUMENT_STORAGE_KEY, JSON.stringify(state)); setStorageStatus("saved"); }
      catch { setStorageStatus("error"); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, state]);
  useEffect(() => {
    if (!draft && !insertAfterId && !itemEditor && !experienceDialogOpen && !readinessOpen && !sharedSectionDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setDraft(null); setInsertAfterId(null); setItemEditor(null); setExperienceDialogOpen(false); setReadinessOpen(false); setSharedSectionDialogOpen(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [draft, experienceDialogOpen, insertAfterId, itemEditor, readinessOpen, sharedSectionDialogOpen]);

  const active = useMemo(() => state.variants.find((item) => item.id === state.activeVariantId), [state]);
  const activeProfile = useMemo(() => state.roleProfiles.find((item) => item.id === (active?.roleProfileId ?? state.activeRoleProfileId)) ?? state.roleProfiles[0], [active?.roleProfileId, state.activeRoleProfileId, state.roleProfiles]);
  const roleVariants = useMemo(() => state.variants.filter((item) => item.roleProfileId === activeProfile?.id), [activeProfile?.id, state.variants]);
  const orderedSections = useMemo(() => activeProfile ? orderResumeSections(state.sharedSections, activeProfile, active) : state.sharedSections, [active, activeProfile, state.sharedSections]);
  const readinessIssues = useMemo(() => inspectResumeReadiness(state, activeProfile?.id ?? "", active?.id), [active?.id, activeProfile?.id, state]);
  useEffect(() => {
    if (view !== "resume" || !paperRef.current) return;
    const paper = paperRef.current;
    const update = () => setPageCount(measurePrintedPageCount(paper));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [state, view]);
  if (!activeProfile) return null;
  const updateActive = (patch: Partial<NonNullable<typeof active>>) => active && setState((current) => ({ ...current, variants: current.variants.map((item) => item.id === active.id ? { ...item, ...patch } : item) }));
  const setting = (sectionId: string, patch: Parameters<typeof updateSectionSetting>[3]) => setState((current) => active ? updateSectionSetting(current, active.id, sectionId, patch) : updateRoleProfileSectionSetting(current, activeProfile.id, sectionId, patch));
  const openEditor = (scope: EditDraft["scope"], section: ResumeSection, content: SectionContent) => {
    setDraft({ scope, section, content: clone(content), title: resolveSectionTitle(section, activeProfile, active), saveTarget: "current" });
  };
  const saveDraft = () => {
    if (!draft) return;
    setState((current) => {
      if (draft.scope === "shared") return updateSharedSectionTitle(updateSharedSection(current, draft.section.id, draft.content), draft.section.id, draft.title);
      if (draft.scope === "role" && draft.saveTarget === "parent") return resetRoleProfileSectionToShared(updateSharedSectionTitle(updateSharedSection(current, draft.section.id, draft.content), draft.section.id, draft.title), activeProfile.id, draft.section.id);
      if (draft.scope === "variant" && draft.saveTarget === "parent" && active) return resetSupportVariantSectionToRole(updateRoleProfileSectionSetting(current, activeProfile.id, draft.section.id, { mode: "override", title: draft.title, content: draft.content }), active.id, draft.section.id);
      if (draft.scope === "role") return updateRoleProfileSectionSetting(current, activeProfile.id, draft.section.id, { mode: "override", title: draft.title, content: draft.content });
      if (draft.scope === "role-custom") return updateRoleCustomSection(current, activeProfile.id, draft.section.id, { title: draft.title.trim() || "새 섹션", content: draft.content });
      if (draft.scope === "variant-custom" && active) return updateCustomSection(current, active.id, draft.section.id, { title: draft.title.trim() || "새 섹션", content: draft.content });
      return active ? updateSectionSetting(current, active.id, draft.section.id, { mode: "override", title: draft.title, content: draft.content }) : current;
    });
    setDraft(null);
  };
  const createCustom = () => {
    if (!insertAfterId) return;
    const result = active
      ? addCustomSection(state, active.id, { title: newSectionTitle, kind: newSectionKind, afterSectionId: insertAfterId })
      : addRoleCustomSection(state, activeProfile.id, { title: newSectionTitle, kind: newSectionKind, afterSectionId: insertAfterId });
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
    const result = addSharedSection(state, { title: newSectionTitle, kind: newSectionKind, afterSectionId: state.sharedSections.at(-1)?.id });
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
          {view === "resume" && <div className="flex flex-wrap gap-2"><button className="inline-flex h-11 items-center gap-2 border border-primary bg-background px-4 text-sm font-bold text-primary" onClick={() => setReadinessOpen(true)}><ClipboardCheck className="h-4 w-4" /> 작성 상태 점검{readinessIssues.length > 0 && <span className="bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{readinessIssues.length}</span>}</button><button className="inline-flex h-11 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={() => void document.fonts.ready.then(() => window.print())}><Printer className="h-4 w-4" /> PDF로 저장</button></div>}
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div aria-label="이력서 문서 화면" className="flex flex-wrap border border-border bg-background p-1" role="tablist"><Tab active={view === "resume"} onClick={() => setView("resume")}>직군 이력서</Tab><Tab active={view === "shared"} onClick={() => setView("shared")}>공통 정보</Tab></div>
        </div>
      </header>

      {view === "shared" ? <SharedManager profiles={state.roleProfiles} sections={state.sharedSections} onAdd={() => { setNewSectionTitle(""); setNewSectionKind("items"); setSharedSectionDialogOpen(true); }} onDelete={(section) => window.confirm(`‘${section.title}’ 공통 섹션을 모든 직군과 지원 버전에서 삭제할까요?`) && setState((current) => deleteSharedSection(current, section.id))} onEdit={(section) => openEditor("shared", section, section.content)} onLinkExperience={() => setExperienceDialogOpen(true)} onOrder={(sectionOrder) => setState((current) => updateSharedSectionOrder(current, sectionOrder))} /> : (
        <div className="resume-builder-layout mt-6 grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <button aria-controls="resume-role-settings" aria-expanded={mobileSettingsOpen} className="resume-builder-chrome resume-mobile-settings-toggle flex h-12 w-full items-center justify-between border border-primary/30 bg-primary/5 px-4 text-sm font-extrabold text-primary xl:hidden" onClick={() => setMobileSettingsOpen((open) => !open)} type="button"><span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4" /> 직군·지원 버전 설정</span><span className="text-xs">{mobileSettingsOpen ? "접기" : "열기"}</span></button>
          <aside className={cx("resume-builder-chrome border border-border bg-card p-5 xl:sticky xl:top-24 xl:block", mobileSettingsOpen ? "block" : "hidden")} id="resume-role-settings">
            <h2 className="flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4 text-primary" /> 직군 이력서 설정</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">직군 이력서<select className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground" value={activeProfile.id} onChange={(event) => setState((current) => ({ ...current, activeRoleProfileId: event.target.value, activeVariantId: null }))}>{state.roleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
              <Field label="이력서 이름" value={activeProfile.name} onChange={(name) => setState((current) => updateRoleProfile(current, activeProfile.id, { name }))} />
              <Field label="표시 직무" value={activeProfile.roleTitle} onChange={(roleTitle) => setState((current) => updateRoleProfile(current, activeProfile.id, { roleTitle }))} />
              {state.roleProfiles.length > 1 && <button className="inline-flex h-10 items-center justify-center gap-2 border border-red-200 text-xs font-bold text-red-600" onClick={() => window.confirm(`‘${activeProfile.name}’ 직군 이력서를 삭제할까요?`) && setState((current) => deleteRoleProfile(current, activeProfile.id))}><Trash2 className="h-3.5 w-3.5" /> 직군 이력서 삭제</button>}
            </div>
            <NewRoleResume onAdd={(name, roleTitle) => setState((current) => createRoleProfile(current, { name, roleTitle }))} />
              <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-extrabold">회사별 지원 버전 <span className="font-normal text-muted-foreground">(선택)</span></h3><p className="mt-1 text-xs leading-5 text-muted-foreground">같은 직군에 여러 장이 필요할 때만 추가하세요.</p><select aria-label="지원 버전 선택" className="mt-3 h-10 w-full border border-border bg-background px-3 text-sm" value={active?.id ?? ""} onChange={(event) => setState((current) => ({ ...current, activeVariantId: event.target.value || null }))}><option value="">직군 기본</option>{roleVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select>{active ? <div className="mt-3 grid gap-3"><Field label="버전 이름" value={active.name} onChange={(name) => updateActive({ name })} /><Field label="지원 회사" value={active.company} onChange={(company) => updateActive({ company })} /><Field label="표시 직무(선택)" placeholder={activeProfile.roleTitle} value={active.role} onChange={(role) => updateActive({ role })} /><div className="grid grid-cols-2 gap-2"><button className="inline-flex h-10 items-center justify-center gap-2 border border-primary/40 text-xs font-bold text-primary" onClick={() => setState((current) => duplicateVariant(current, active.id))}><Copy className="h-3.5 w-3.5" /> 지원 버전 복제</button><button className="inline-flex h-10 items-center justify-center gap-2 border border-red-200 text-xs font-bold text-red-600" onClick={deleteActive}><Trash2 className="h-3.5 w-3.5" /> 삭제</button></div></div> : <NewSupportVersion onAdd={(name, company) => setState((current) => createSupportVariant(current, activeProfile.id, { name, company }))} />}</div>
            <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-extrabold">{active ? "지원 버전" : "직군 이력서"} 전용 섹션</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">원하는 섹션 아래의 추가 버튼을 누르세요.</p></div>
            <p aria-live="polite" className={cx("mt-6 flex items-center gap-1.5 border-t border-border pt-4 text-[11px]", storageStatus === "error" ? "text-red-600" : "text-muted-foreground")}><Check className={cx("h-3.5 w-3.5", storageStatus === "error" ? "text-red-600" : "text-primary")} /> {storageStatus === "error" ? "자동 저장에 실패했습니다. 내용을 별도로 보관해 주세요." : storageStatus === "saved" ? "이 브라우저에 자동 저장됐습니다." : "저장 내용을 불러오는 중입니다."}</p>
          </aside>
          <div className="resume-preview-shell min-w-0"><div className="resume-builder-chrome mb-3 flex flex-wrap items-center justify-between gap-2 border border-primary/25 bg-primary/5 px-4 py-3 text-xs"><span className="font-bold text-primary"><span className="hidden md:inline">A4 페이지 경계가 점선으로 표시됩니다.</span><span className="md:hidden">모바일 편집 보기 · PDF는 A4로 저장됩니다.</span></span><span className="font-extrabold">예상 {pageCount}페이지</span></div><article className="resume-paper resume-page-guides mx-auto w-full max-w-[210mm] bg-white text-slate-950 shadow-xl" ref={paperRef}><div className="resume-paper-inner min-h-[297mm] px-[14mm] py-[16mm]"><div className="resume-print-header resume-print-target mb-8 flex items-end justify-between border-b-2 border-slate-950 pb-3"><div><p className="text-[9px] font-bold tracking-widest text-slate-500">{active?.company || activeProfile.name}</p><p className="mt-1 text-sm font-black">{resolveDocumentRole(activeProfile, active)}</p></div><p className="text-xs font-bold text-slate-500">{active?.name || `${activeProfile.name} 이력서`}</p></div><p className="resume-reorder-help mb-4 flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><GripVertical className="h-3.5 w-3.5" /> 핸들을 끌어 현재 단계의 섹션 순서를 바꿀 수 있습니다.</p><Reorder.Group axis="y" className="resume-print-sections grid gap-7" onReorder={(sectionOrder) => setState((current) => active ? updateSectionOrder(current, active.id, sectionOrder) : updateRoleProfileSectionOrder(current, activeProfile.id, sectionOrder))} values={orderedSections.map((section) => section.id)}>{orderedSections.map((section) => {
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
            return <SortableSection key={section.id} sectionId={section.id}>{(dragControls) => <>{resolved.mode === "hidden" ? <HiddenSection section={{ ...section, title }} dragControls={dragControls} onShow={restoreVisibility} /> : <DocumentSection dragControls={dragControls} section={{ ...section, title }} content={resolved.content} source={resolved.source} onHide={!section.custom ? () => setting(section.id, { mode: "hidden" }) : undefined} onReset={canReset ? () => window.confirm(`${active ? "이 지원 버전의 맞춤 내용" : "이 직군 이력서의 맞춤 내용"}을 버리고 ${active ? "직군 이력서" : "공통 정보"}로 되돌릴까요?`) && resetToParent() : undefined} resetLabel={active ? "직군 이력서로 되돌리기" : "공통 정보로 되돌리기"} onEdit={() => openEditor(roleCustom ? active ? "variant" : "role-custom" : variantCustom ? "variant-custom" : active ? "variant" : "role", section, resolved.content)} onItems={section.kind === "items" && !section.custom ? () => setItemEditor({ scope: active ? "document" : "role", section }) : undefined} onPromote={section.custom ? () => promoteCustom(section, variantCustom ? "variant" : "role") : undefined} deletePending={pendingDeleteId === section.id} onDelete={section.custom && (!roleCustom || !active) ? () => pendingDeleteId === section.id ? removeCustom(section) : setPendingDeleteId(section.id) : undefined} />}<button className="resume-section-controls mt-3 inline-flex h-9 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-[10px] font-bold text-slate-500 hover:border-orange-400 hover:text-orange-600" onClick={() => { setInsertAfterId(section.id); setNewSectionTitle(""); }}><Plus className="h-3.5 w-3.5" /> {title} 뒤에 새 섹션 추가</button></>}</SortableSection>;
          })}</Reorder.Group></div></article></div>
        </div>
      )}
      {draft && <Editor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft} />}
      {insertAfterId && <AddSectionDialog afterTitle={orderedSections.find((section) => section.id === insertAfterId)?.title ?? "선택한 섹션"} kind={newSectionKind} title={newSectionTitle} onKind={setNewSectionKind} onTitle={setNewSectionTitle} onCancel={() => setInsertAfterId(null)} onAdd={createCustom} />}
      {sharedSectionDialogOpen && <AddSectionDialog afterTitle="공통 정보 마지막" kind={newSectionKind} title={newSectionTitle} onKind={setNewSectionKind} onTitle={setNewSectionTitle} onCancel={() => setSharedSectionDialogOpen(false)} onAdd={createShared} />}
      {itemEditor && <ItemTailoringDialog profile={activeProfile} variant={itemEditor.scope === "document" ? active : undefined} scope={itemEditor.scope} section={itemEditor.section} onState={setState} onClose={() => setItemEditor(null)} />}
      {experienceDialogOpen && <LocalExperienceDialog onClose={() => setExperienceDialogOpen(false)} onLink={(brick) => { setState((current) => linkExperienceBricks(current, [brick])); setExperienceDialogOpen(false); }} />}
      {readinessOpen && <ReadinessDialog issues={readinessIssues} onClose={() => setReadinessOpen(false)} />}
    </div>
  );
}

function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button aria-selected={active} className={cx("h-10 px-4 text-sm font-bold", active ? "bg-foreground text-background" : "text-muted-foreground")} onClick={onClick} role="tab">{children}</button>; }
function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: "text" | "tel" | "date" }) { return <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">{label}<input className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (value: string) => void }) { return <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">{label}<select className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground" value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">선택 안 함</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">{label}<textarea className="min-h-28 resize-y border border-border bg-background p-3 text-sm font-normal leading-6 text-foreground" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }

function NewRoleResume({ onAdd }: { onAdd: (name: string, roleTitle: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  if (!open) return <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 border border-primary text-xs font-bold text-primary" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> 직군 이력서 추가</button>;
  return <div className="mt-4 grid gap-3 border-t border-border pt-4"><Field label="새 이력서 이름" placeholder="예: 백엔드" value={name} onChange={setName} /><Field label="표시 직무" placeholder="예: 백엔드 엔지니어" value={roleTitle} onChange={setRoleTitle} /><div className="flex gap-2"><button className="h-9 flex-1 border border-border text-xs font-bold" onClick={() => setOpen(false)}>취소</button><button className="h-9 flex-1 bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40" disabled={!name.trim()} onClick={() => { onAdd(name, roleTitle); setName(""); setRoleTitle(""); setOpen(false); }}>추가</button></div></div>;
}

function NewSupportVersion({ onAdd }: { onAdd: (name: string, company: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  if (!open) return <button className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 border border-dashed border-primary text-xs font-bold text-primary" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> 회사별 지원 버전 만들기</button>;
  return <div className="mt-3 grid gap-3"><Field label="버전 이름" placeholder="예: A사 지원" value={name} onChange={setName} /><Field label="지원 회사" placeholder="예: A사" value={company} onChange={setCompany} /><div className="flex gap-2"><button className="h-9 flex-1 border border-border text-xs font-bold" onClick={() => setOpen(false)}>취소</button><button className="h-9 flex-1 bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40" disabled={!name.trim()} onClick={() => { onAdd(name, company); setName(""); setCompany(""); setOpen(false); }}>만들기</button></div></div>;
}

function contentSummary(section: ResumeSection) {
  if (section.kind === "identity") { const value = section.content as IdentityContent; return [value.name, value.email, value.phone, value.location, ...value.links].filter(Boolean).join(" · "); }
  if (section.kind === "narrative") return narrativePlainText(section.content as NarrativeContent);
  if (section.kind === "tags") return (section.content as TagsContent).items.join(" · ");
  return (section.content as ItemsContent).items.map((item) => [formatItemPeriod(item), item.title, item.subtitle].filter(Boolean).join(" · ")).join("\n");
}
function SharedManager({ sections, profiles, onAdd, onDelete, onEdit, onLinkExperience, onOrder }: { sections: ResumeSection[]; profiles: ResumeRoleProfile[]; onAdd: () => void; onDelete: (section: ResumeSection) => void; onEdit: (section: ResumeSection) => void; onLinkExperience: () => void; onOrder: (sectionOrder: string[]) => void }) {
  return <section className="mt-7"><div className="border border-primary/25 bg-primary/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-extrabold">공통 정보 · PDF 기본 순서</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">회사, 기간, 성과처럼 직군이 달라도 변하지 않는 사실을 관리합니다. 이 순서는 별도로 조정하지 않은 모든 직군 이력서의 PDF에 그대로 적용됩니다.</p></div><button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onAdd}><Plus className="h-4 w-4" /> 공통 섹션 추가</button></div><p className="mt-4 inline-flex items-center gap-2 border border-primary/30 bg-background px-3 py-2 text-xs font-extrabold text-primary"><GripVertical className="h-4 w-4" /> 각 항목의 핸들을 위아래로 끌어 PDF 순서를 변경하세요.</p></div><Reorder.Group axis="y" className="mt-5 grid gap-3" onReorder={onOrder} values={sections.map((section) => section.id)}>{sections.map((section, index) => { const overridingProfiles = profiles.filter((profile) => { const setting = profile.settings[section.id]; return setting?.mode === "override" || setting?.mode === "hidden"; }); return <SharedSortableCard index={index} key={section.id} onDelete={() => onDelete(section)} onEdit={() => onEdit(section)} onLinkExperience={section.id === "experience" ? onLinkExperience : undefined} overridingProfiles={overridingProfiles} section={section} />; })}</Reorder.Group></section>;
}

function SharedSortableCard({ section, index, overridingProfiles, onDelete, onEdit, onLinkExperience }: { section: ResumeSection; index: number; overridingProfiles: ResumeRoleProfile[]; onDelete: () => void; onEdit: () => void; onLinkExperience?: () => void }) {
  const dragControls = useDragControls();
  return <Reorder.Item className="border border-border bg-card" dragControls={dragControls} dragListener={false} value={section.id} whileDrag={{ scale: 1.01, zIndex: 20 }}><article className="grid items-center gap-4 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]"><button aria-label={`${section.title} 공통 정보 순서 이동`} className="grid h-12 w-12 touch-none cursor-grab place-items-center border border-primary/40 bg-primary/5 text-primary active:cursor-grabbing" onPointerDown={(event) => dragControls.start(event)} type="button"><GripVertical className="h-5 w-5" /></button><span className="grid h-12 w-12 place-items-center bg-foreground text-sm font-black text-background"><span><small className="block text-[8px] font-bold tracking-widest">PDF</small>{String(index + 1).padStart(2, "0")}</span></span><div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary"><LayoutTemplate className="h-3.5 w-3.5" /> 공통 정보</p><h3 className="mt-1 text-lg font-extrabold" data-common-section-title>{section.title}</h3><p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{contentSummary(section) || "아직 작성된 내용이 없습니다."}</p></div><div className="flex flex-wrap gap-2 sm:justify-end"><button className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-background px-3 text-xs font-bold hover:text-primary" onClick={onEdit}><Edit3 className="h-4 w-4" /> 내용 편집</button>{onLinkExperience && <button className="inline-flex h-10 items-center justify-center gap-2 border border-primary/40 bg-primary/5 px-3 text-xs font-bold text-primary" onClick={onLinkExperience}><Plus className="h-4 w-4" /> 경험 추가</button>}<button aria-label={`${section.title} 공통 섹션 삭제`} className="grid h-10 w-10 place-items-center border border-red-200 bg-background text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /></button></div></article>{overridingProfiles.length > 0 && <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"><p className="text-xs font-extrabold">{overridingProfiles.map((profile) => profile.name).join(", ")}에서는 직군 맞춤 상태라 공통 정보 변경이 반영되지 않습니다. 되돌리기는 해당 이력서 섹션의 더보기에서 할 수 있습니다.</p></div>}</Reorder.Item>;
}

export function RoleProfileManager({ profile, profiles, sections, onActive, onAdd, onDelete, onProfile, onSetting, onEdit, onItems }: { profile: ResumeRoleProfile; profiles: ResumeRoleProfile[]; sections: ResumeSection[]; onActive: (profileId: string) => void; onAdd: (name: string, roleTitle: string) => void; onDelete: () => void; onProfile: (patch: Partial<Pick<ResumeRoleProfile, "name" | "roleTitle">>) => void; onSetting: (sectionId: string, patch: Parameters<typeof updateRoleProfileSectionSetting>[3]) => void; onEdit: (section: ResumeSection) => void; onItems: (section: ResumeSection) => void }) {
  const [newName, setNewName] = useState("");
  const [newRoleTitle, setNewRoleTitle] = useState("");
  const add = () => { onAdd(newName, newRoleTitle); setNewName(""); setNewRoleTitle(""); };
  return <section className="mt-7 grid gap-5"><div className="border border-primary/25 bg-primary/5 p-5"><h2 className="text-lg font-extrabold">직군 프로필</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">백엔드, 기획, AI 엔지니어처럼 반복해서 사용할 강조점과 항목 구성을 만듭니다. 지원 이력서는 이 프로필을 다시 상속합니다.</p></div><div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="border border-border bg-card p-5"><label className="grid gap-1.5 text-xs font-bold text-muted-foreground">관리할 직군<select className="h-10 border border-border bg-background px-3 text-sm text-foreground" value={profile.id} onChange={(event) => onActive(event.target.value)}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mt-5 grid gap-4"><Field label="프로필 이름" value={profile.name} onChange={(name) => onProfile({ name })} /><Field label="표시 직무" value={profile.roleTitle} onChange={(roleTitle) => onProfile({ roleTitle })} /></div>{profiles.length > 1 && <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 border border-red-200 text-sm font-bold text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /> 이 직군 프로필 삭제</button>}<div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-extrabold">새 직군 프로필</h3><div className="mt-3 grid gap-3"><Field label="프로필 이름" placeholder="예: 백엔드" value={newName} onChange={setNewName} /><Field label="표시 직무" placeholder="예: 백엔드 엔지니어" value={newRoleTitle} onChange={setNewRoleTitle} /><button className="inline-flex h-10 items-center justify-center gap-2 bg-primary text-sm font-bold text-primary-foreground" disabled={!newName.trim()} onClick={add}><Plus className="h-4 w-4" /> 프로필 추가</button></div></div></aside><div className="grid gap-4 md:grid-cols-2">{sections.map((section) => { const setting = profile.settings[section.id]; const resolved = resolveSection(section, profile); return <article className="flex min-h-56 flex-col border border-border bg-card p-5" key={section.id}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">{resolved.source === "role" ? "직군 맞춤" : "커리어 원본"}</p><h3 className="mt-2 text-lg font-extrabold">{section.title}</h3></div><select aria-label={`${section.title} 직군 내용 방식`} className="h-9 border border-border bg-background px-2 text-xs font-bold" value={setting?.mode ?? "inherit"} onChange={(event) => onSetting(section.id, { mode: event.target.value as SectionMode })}>{Object.entries(roleModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{contentSummary({ ...section, content: resolved.content }) || "작성된 내용이 없습니다."}</p><div className="mt-auto grid grid-cols-2 gap-2 pt-4"><button className="inline-flex h-10 items-center justify-center gap-2 border border-border text-xs font-bold" onClick={() => onEdit(section)}><Edit3 className="h-3.5 w-3.5" /> 직군용 재작성</button>{section.kind === "items" ? <button className="inline-flex h-10 items-center justify-center gap-2 border border-primary/40 text-xs font-bold text-primary" onClick={() => onItems(section)}><Settings2 className="h-3.5 w-3.5" /> 항목 조정</button> : <button className="h-10 border border-border text-xs font-bold" onClick={() => onSetting(section.id, { mode: "inherit", content: undefined })}><RotateCcw className="mr-1 inline h-3.5 w-3.5" /> 원본으로</button>}</div></article>; })}</div></div></section>;
}

function SortableSection({ children, sectionId }: { children: (dragControls: DragControls) => React.ReactNode; sectionId: string }) { const dragControls = useDragControls(); return <Reorder.Item className="resume-print-section relative" dragControls={dragControls} dragListener={false} value={sectionId} whileDrag={{ opacity: .8, scale: 1.01, zIndex: 20 }}>{children(dragControls)}</Reorder.Item>; }
function DragHandle({ dragControls, title }: { dragControls: DragControls; title: string }) { return <button aria-label={`${title} 섹션 순서 이동`} className="resume-drag-handle grid h-10 w-10 shrink-0 touch-none cursor-grab place-items-center border border-slate-300 bg-white text-slate-500 active:cursor-grabbing sm:h-8 sm:w-8" onPointerDown={(event) => dragControls.start(event)} type="button"><GripVertical className="h-4 w-4" /></button>; }
function HiddenSection({ dragControls, onShow, section }: { dragControls: DragControls; onShow: () => void; section: ResumeSection }) { return <div className="resume-hidden flex items-center justify-between gap-2 border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500"><span className="flex items-center gap-2 font-bold"><DragHandle dragControls={dragControls} title={section.title} /><EyeOff className="h-4 w-4" /> {section.title} · 숨김</span><button aria-label={`${section.title} 섹션 표시`} className="grid h-9 w-9 place-items-center border border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary" onClick={onShow} title="섹션 표시"><Eye className="h-4 w-4" /></button></div>; }

function DocumentSection({ section, content, source, onHide, onReset, resetLabel, onEdit, onItems, onPromote, onDelete, deletePending, dragControls }: { section: ResumeSection; content: SectionContent; source: "shared" | "role" | "document"; onHide?: () => void; onReset?: () => void; resetLabel: string; onEdit: () => void; onItems?: () => void; onPromote?: () => void; onDelete?: () => void; deletePending?: boolean; dragControls: DragControls }) {
  const sourceLabel = source === "shared" ? "공통 정보" : source === "role" ? "직군 이력서" : "지원 버전 맞춤";
  const hasMoreActions = Boolean(onReset || onItems || onPromote || onDelete);
  return <section className="resume-document-section" data-section-kind={section.kind}><div className="resume-section-controls mb-2 flex items-center justify-between gap-2 border border-dashed border-slate-300 bg-slate-50 p-2"><span className="flex min-w-0 items-center gap-2"><DragHandle dragControls={dragControls} title={section.title} /><span className={cx("truncate border px-2 py-1 text-[10px] font-extrabold", source === "document" ? "border-orange-300 bg-orange-50 text-orange-700" : source === "role" ? "border-primary/30 bg-primary/5 text-primary" : "border-slate-300 bg-white text-slate-600")}>{section.custom ? "현재 단계 전용" : sourceLabel}</span></span><div className="flex shrink-0 items-center gap-1">{onHide && <button aria-label={`${section.title} 섹션 숨기기`} className="grid h-10 w-10 place-items-center border border-slate-300 bg-white text-slate-500 hover:border-primary hover:text-primary sm:h-8 sm:w-8" onClick={onHide} title="섹션 숨기기"><EyeOff className="h-4 w-4" /></button>}<button className="inline-flex h-10 items-center gap-2 border border-slate-400 bg-white px-3 text-xs font-bold hover:border-primary hover:text-primary sm:h-8" onClick={onEdit}><Edit3 className="h-3.5 w-3.5" /> 편집</button>{hasMoreActions && <details className="relative"><summary aria-label={`${section.title} 섹션 더보기`} className="grid h-10 w-10 cursor-pointer list-none place-items-center border border-slate-300 bg-white sm:h-8 sm:w-8"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-40 mt-1 grid w-60 gap-3 border border-slate-300 bg-white p-3 text-slate-700 shadow-xl">{onReset && <button className="h-9 border border-primary/40 bg-primary/5 px-2 text-xs font-bold text-primary" onClick={onReset}><RotateCcw className="mr-1 inline h-3.5 w-3.5" /> {resetLabel}</button>}{onItems && <button className="h-9 border border-orange-300 bg-white px-2 text-xs font-bold text-orange-700" onClick={onItems}>{section.id === "experience" ? "경험 선택·편집" : "포함 항목 선택"}</button>}{onPromote && <button className="h-9 border border-primary/40 bg-primary/5 px-2 text-xs font-bold text-primary" onClick={onPromote}><LayoutTemplate className="mr-1 inline h-3.5 w-3.5" /> 공통 섹션으로 전환</button>}{onDelete && <button aria-label={deletePending ? `${section.title} 섹션 삭제 확인` : `${section.title} 섹션 삭제`} className="h-9 border border-red-200 bg-white px-2 text-xs font-bold text-red-600" onClick={onDelete}>{deletePending ? "정말 삭제" : "섹션 삭제"}</button>}</div></details>}</div></div>{section.kind !== "identity" && <h2 className="resume-section-heading mb-3 border-b border-slate-900 pb-1.5 text-[13px] font-black">{section.title}</h2>}<SectionBody section={section} content={content} layout="standard" /></section>;
}

function SectionBody({ section, content, layout }: { section: ResumeSection; content: SectionContent; layout: SectionLayout }) {
  if (section.kind === "identity") {
    const value = content as IdentityContent;
    const contactItems = [value.email, value.phone, value.location, ...value.links].filter(Boolean) as string[];
    const factItems = [value.birthDate && `생년월일 ${value.birthDate}`, value.gender && `성별 ${value.gender}`, value.militaryStatus && `병역 ${value.militaryStatus}`, value.veteranStatus && `보훈 ${value.veteranStatus}`, value.disabilityStatus && `장애 ${value.disabilityStatus}`, value.employmentProtectionStatus && `취업보호 ${value.employmentProtectionStatus}`].filter(Boolean) as string[];
    return <div className={cx("resume-identity grid items-end gap-6", value.photo ? "grid-cols-[minmax(0,1fr)_24mm]" : "grid-cols-1", layout === "cards" && "border border-slate-200 p-4")} data-photo-position="right"><div className="min-w-0"><div className={cx("resume-identity-heading grid items-end gap-4", layout === "compact" ? "grid-cols-1" : "grid-cols-[1fr_auto]")}><h2 className="text-3xl font-black tracking-[-.05em]">{value.name}</h2>{contactItems.length > 0 && <div className={cx("resume-contact text-[9px] leading-5 text-slate-500", layout !== "compact" && "text-right")}>{contactItems.map((item) => <p key={item}>{item}</p>)}</div>}</div>{factItems.length > 0 && <div className="resume-facts mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-2 text-[8px] text-slate-500">{factItems.map((item) => <span key={item}>{item}</span>)}</div>}</div>{value.photo && <Image alt={`${value.name || "지원자"} 증명사진`} className="h-[32mm] w-[24mm] justify-self-end border border-slate-200 object-cover" height={640} src={value.photo} unoptimized width={480} />}</div>;
  }
  if (section.kind === "narrative") return <NarrativeBody content={content as NarrativeContent} layout={layout} />;
  if (section.kind === "tags") return <div className="flex flex-wrap gap-2">{(content as TagsContent).items.map((item, index) => <span className={cx("text-[10px] font-bold", layout === "cards" ? "border border-slate-300 px-3 py-2" : layout === "compact" ? "border-b border-slate-300" : "bg-slate-100 px-3 py-1.5")} key={`${item}-${index}`}>{item}</span>)}</div>;
  return <div className={cx("resume-items grid", layout === "cards" ? "grid-cols-2 gap-3" : layout === "compact" ? "gap-2" : "gap-4")}>{(content as ItemsContent).items.map((item) => <article className={cx("resume-item", layout === "cards" && "border border-slate-200 p-3", layout === "standard" && "grid grid-cols-[26mm_1fr] gap-4")} key={item.id}><p className="resume-item-period text-[9px] font-bold text-slate-500">{formatItemPeriod(item)}</p><div><h3 className="resume-item-title text-[11px] font-black">{item.title}</h3><p className="resume-item-subtitle text-[9px] font-bold text-orange-600">{item.subtitle}</p><p className="resume-item-body mt-1 whitespace-pre-line text-[9px] leading-5 text-slate-600">{item.body}</p></div></article>)}</div>;
}

function NarrativeBody({ content, layout }: { content: NarrativeContent; layout: SectionLayout }) {
  if (!content.blocks?.length) return <p className={cx("resume-narrative whitespace-pre-line text-[10px] text-slate-700", layout === "compact" ? "leading-5" : "leading-6", layout === "cards" && "border border-slate-200 bg-slate-50 p-4")}>{content.body}</p>;
  const textStyles: Record<NarrativeBlockType, string> = { p: "text-[10px] leading-6", h1: "text-[20px] font-black leading-tight", h2: "text-[17px] font-black leading-tight", h3: "text-[15px] font-extrabold leading-tight", h4: "text-[13px] font-extrabold leading-tight", h5: "text-[12px] font-bold leading-tight", h6: "text-[11px] font-bold uppercase tracking-wide" };
  return <div className={cx("resume-narrative grid gap-2 text-slate-700", layout === "compact" && "gap-1", layout === "cards" && "border border-slate-200 bg-slate-50 p-4")}>{content.blocks.map((block) => createElement(block.type, { className: textStyles[block.type], key: block.id }, block.runs.map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : run.text)))}</div>;
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
  return <div className="border border-border"><div aria-label="서술형 서식 도구" className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2">{blockTypes.map((item) => <button className="h-9 min-w-10 border border-border bg-background px-2 text-xs font-bold hover:border-primary hover:text-primary" key={item.type} onMouseDown={(event) => { event.preventDefault(); command("formatBlock", item.type); }} type="button">{item.label}</button>)}<span className="mx-1 h-6 w-px bg-border" /><button aria-label="굵게" className="h-9 min-w-10 border border-border bg-background px-3 text-sm font-black hover:border-primary hover:text-primary" onMouseDown={(event) => { event.preventDefault(); command("bold"); }} type="button">B</button></div><div aria-label="소개글 내용" className="min-h-52 bg-background p-4 text-sm leading-7 outline-none focus:ring-2 focus:ring-primary/30 [&_h1]:text-3xl [&_h2]:text-2xl [&_h3]:text-xl [&_h4]:text-lg [&_h5]:text-base [&_h6]:text-sm [&_h1]:font-black [&_h2]:font-black [&_h3]:font-extrabold [&_h4]:font-extrabold [&_h5]:font-bold [&_h6]:font-bold" contentEditable onInput={emit} onPaste={paste} ref={editorRef} role="textbox" suppressContentEditableWarning /><div className="flex flex-wrap justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground"><span>붙여넣기는 H1~H6·문단·굵게만 유지하며, 색상과 배경 등은 제거합니다.</span><strong aria-live="polite" className="text-foreground">공백 포함 {characterCount.toLocaleString()}자 · {paragraphCount}단락</strong></div></div>;
}

function MonthField({ label, value, onChange, disabled }: { label: string; value?: string; onChange: (value: string) => void; disabled?: boolean }) { return <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">{label}<input className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground disabled:bg-muted" disabled={disabled} type="month" value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>; }

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
  return <section className="border border-border bg-muted/20 p-4"><p className="text-xs font-extrabold">증명사진 <span className="font-normal text-muted-foreground">(선택)</span></p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">인적사항에만 표시됩니다. 업로드한 사진은 크기를 줄여 이 브라우저에 저장합니다.</p><div className="mt-3 flex flex-wrap items-center gap-4">{value.photo ? <Image alt="증명사진 미리보기" className="h-32 w-24 border border-border object-cover" height={640} src={value.photo} unoptimized width={480} /> : <div className="grid h-32 w-24 place-items-center border border-dashed border-border bg-background text-center text-[10px] text-muted-foreground">사진<br />미리보기</div>}<div className="grid gap-2"><label className="inline-flex h-10 cursor-pointer items-center justify-center border border-primary px-4 text-xs font-bold text-primary"><input accept="image/jpeg,image/png,image/webp" aria-label="증명사진 파일 선택" className="sr-only" disabled={processing} type="file" onChange={(event) => { void selectPhoto(event.target.files?.[0]); event.target.value = ""; }} />{processing ? "사진 처리 중…" : value.photo ? "사진 교체" : "증명사진 업로드"}</label>{value.photo && <button className="h-9 border border-red-200 px-3 text-xs font-bold text-red-600" onClick={() => { onChange({ photo: undefined, photoName: undefined }); setError(""); }} type="button">사진 삭제</button>}{value.photoName && <p className="max-w-52 truncate text-[10px] text-muted-foreground">{value.photoName}</p>}</div></div>{error && <p aria-live="polite" className="mt-3 text-xs font-bold text-red-600">{error}</p>}</section>;
}

function StructuredEditor({ section, content, onChange }: { section: ResumeSection; content: SectionContent; onChange: (content: SectionContent) => void }) {
  if (section.kind === "identity") {
    const value = content as IdentityContent;
    return <div className="grid gap-4"><IdentityPhotoField value={value} onChange={(photo) => onChange({ ...value, ...photo })} /><fieldset className="border border-border bg-muted/20 p-4"><legend className="px-2 text-xs font-extrabold">기본 연락 정보 · 공통</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="이름" value={value.name} onChange={(name) => onChange({ ...value, name })} /><Field label="이메일" value={value.email} onChange={(email) => onChange({ ...value, email })} /><Field label="전화번호" type="tel" value={value.phone ?? ""} onChange={(phone) => onChange({ ...value, phone })} /><Field label="거주 지역" placeholder="예: 서울 양천구" value={value.location ?? ""} onChange={(location) => onChange({ ...value, location })} /></div></fieldset><fieldset className="border border-border bg-muted/20 p-4"><legend className="px-2 text-xs font-extrabold">신상·자격 정보 · 공통</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="생년월일" type="date" value={value.birthDate ?? ""} onChange={(birthDate) => onChange({ ...value, birthDate })} /><SelectField label="성별" options={["남성", "여성", "기타"]} value={value.gender} onChange={(gender) => onChange({ ...value, gender })} /><SelectField label="병역 여부" options={["군필", "미필", "복무 중", "면제", "해당 없음"]} value={value.militaryStatus} onChange={(militaryStatus) => onChange({ ...value, militaryStatus })} /><SelectField label="보훈 대상" options={["대상", "비대상"]} value={value.veteranStatus} onChange={(veteranStatus) => onChange({ ...value, veteranStatus })} /><SelectField label="장애 여부" options={["해당", "해당 없음"]} value={value.disabilityStatus} onChange={(disabilityStatus) => onChange({ ...value, disabilityStatus })} /><SelectField label="취업보호 대상" options={["대상", "비대상"]} value={value.employmentProtectionStatus} onChange={(employmentProtectionStatus) => onChange({ ...value, employmentProtectionStatus })} /></div></fieldset><ListEditor label="링크" addLabel="링크 추가" items={value.links} placeholder="https://..." onChange={(links) => onChange({ ...value, links })} /></div>;
  }
  if (section.kind === "narrative") return <RichNarrativeEditor content={content as NarrativeContent} onChange={onChange} />;
  if (section.kind === "tags") { const value = content as TagsContent; return <ListEditor label="항목" addLabel="항목 추가" items={value.items} placeholder="예: 문제 해결" onChange={(items) => onChange({ items })} />; }
  const value = content as ItemsContent;
  const updateItem = (id: string, patch: Partial<ItemContent>) => onChange({ items: value.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  return <div><div className="grid gap-3">{value.items.map((item, index) => <fieldset className="border border-border bg-muted/20 p-4" key={item.id}><legend className="px-2 text-xs font-extrabold">항목 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2"><MonthField label="시작 연월" value={item.startMonth} onChange={(startMonth) => updateItem(item.id, { startMonth })} /><MonthField label="종료 연월" value={item.endMonth} disabled={section.id === "experience" && item.isCurrent} onChange={(endMonth) => updateItem(item.id, { endMonth })} />{section.id === "experience" && <label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={Boolean(item.isCurrent)} type="checkbox" onChange={(event) => updateItem(item.id, { isCurrent: event.target.checked, endMonth: event.target.checked ? "" : item.endMonth })} /> 재직 중</label>}<Field label="제목" value={item.title} onChange={(title) => updateItem(item.id, { title })} /><Field label="조직·부제" value={item.subtitle} onChange={(subtitle) => updateItem(item.id, { subtitle })} /><div className="sm:col-span-2"><TextArea label="설명" value={item.body} onChange={(body) => updateItem(item.id, { body })} /></div></div><button className="mt-3 inline-flex h-9 items-center gap-2 border border-red-200 px-3 text-xs font-bold text-red-600" onClick={() => onChange({ items: value.items.filter((entry) => entry.id !== item.id) })} type="button"><Trash2 className="h-3.5 w-3.5" /> 이 항목 삭제</button></fieldset>)}</div><button className="mt-3 inline-flex h-10 items-center gap-2 border border-primary px-4 text-sm font-bold text-primary" onClick={() => onChange({ items: [...value.items, { id: `item-${Date.now()}`, meta: "", startMonth: "", endMonth: "", isCurrent: false, title: "", subtitle: "", body: "" }] })} type="button"><Plus className="h-4 w-4" /> 항목 추가</button></div>;
}

function ListEditor({ label, addLabel, items, placeholder, onChange }: { label: string; addLabel: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) { return <div><p className="text-xs font-bold text-muted-foreground">{label}</p><div className="mt-2 grid gap-2">{items.map((item, index) => <div className="flex gap-2" key={index}><input aria-label={`${label} ${index + 1}`} className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-sm" placeholder={placeholder} value={item} onChange={(event) => onChange(items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><button aria-label={`${label} ${index + 1} 삭제`} className="grid h-10 w-10 place-items-center border border-red-200 text-red-600" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div><button className="mt-2 inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-bold" onClick={() => onChange([...items, ""])} type="button"><Plus className="h-3.5 w-3.5" /> {addLabel}</button></div>; }

function ItemTailoringDialog({ profile, variant, scope, section, onState, onClose }: { profile: ResumeRoleProfile; variant?: ResumeDocumentState["variants"][number]; scope: "role" | "document"; section: ResumeSection; onState: React.Dispatch<React.SetStateAction<ResumeDocumentState>>; onClose: () => void }) {
  const baseItems = (section.content as ItemsContent).items;
  const roleSetting = profile.settings[section.id];
  const documentSetting = variant?.settings[section.id];
  const setting = scope === "role" ? roleSetting : documentSetting;
  const order = setting?.itemOrder?.length ? setting.itemOrder : baseItems.map((item) => item.id);
  const ordered = [...order.flatMap((id) => baseItems.find((item) => item.id === id) ?? []), ...baseItems.filter((item) => !order.includes(item.id))];
  const parentContent = resolveSection(section, profile).content as ItemsContent;
  const parentById = new Map(parentContent.items.map((item) => [item.id, item]));
  const updateMode = (item: ItemContent, mode: ItemMode) => onState((current) => {
    if (scope === "role") {
      if (mode === "inherit") return clearRoleProfileItemSetting(current, profile.id, section.id, item.id);
      return updateRoleProfileItemSetting(current, profile.id, section.id, item.id, { mode, content: mode === "override" ? clone(item) : undefined });
    }
    if (!variant) return current;
    if (mode === "inherit") return clearDocumentItemSetting(current, variant.id, section.id, item.id);
    const inherited = parentById.get(item.id) ?? item;
    return updateDocumentItemSetting(current, variant.id, section.id, item.id, { mode, content: mode === "override" ? clone(inherited) : undefined });
  });
  const updateContent = (itemId: string, patch: Partial<ItemContent>) => onState((current) => {
    const currentSetting = scope === "role" ? profile.settings[section.id]?.itemSettings?.[itemId] : variant?.settings[section.id]?.itemSettings?.[itemId];
    const base = currentSetting?.content ?? baseItems.find((item) => item.id === itemId)!;
    return scope === "role"
      ? updateRoleProfileItemSetting(current, profile.id, section.id, itemId, { mode: "override", content: { ...base, ...patch } })
      : variant ? updateDocumentItemSetting(current, variant.id, section.id, itemId, { mode: "override", content: { ...base, ...patch } }) : current;
  });
  const move = (itemId: string, offset: number) => onState((current) => {
    const nextOrder = [...order];
    const index = nextOrder.indexOf(itemId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= nextOrder.length) return current;
    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
    return scope === "role" ? updateRoleProfileSectionSetting(current, profile.id, section.id, { itemOrder: nextOrder }) : variant ? updateSectionSetting(current, variant.id, section.id, { itemOrder: nextOrder }) : current;
  });
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-modal="true" className="my-auto w-full max-w-4xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex items-start justify-between gap-4 border-b border-border p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">{scope === "role" ? `${profile.name} 직군 이력서` : `${profile.name} → ${variant?.name}`}</p><h2 className="mt-1 text-xl font-extrabold">{section.title} {section.id === "experience" ? "경험 선택·편집" : "포함 항목 선택"}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">항목마다 상위 단계 사용, 재작성, 숨김을 선택하고 순서를 바꿀 수 있습니다.</p></div><button aria-label="항목 편집 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onClose}><X className="h-4 w-4" /></button></header><div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">{ordered.map((item, index) => { const itemSetting = setting?.itemSettings?.[item.id]; const mode = itemSetting?.mode ?? "inherit"; const editable = itemSetting?.content ?? (scope === "document" ? parentById.get(item.id) : item) ?? item; return <article className="border border-border bg-card p-4" key={item.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold">{item.title || `항목 ${index + 1}`}</p>{item.source && <p className="mt-1 text-[10px] font-bold text-primary">로컬 경험 참조 · {item.source.id}</p>}</div><div className="flex gap-1"><button aria-label={`${item.title} 위로`} className="grid h-9 w-9 place-items-center border border-border" disabled={index === 0} onClick={() => move(item.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></button><button aria-label={`${item.title} 아래로`} className="grid h-9 w-9 place-items-center border border-border" disabled={index === ordered.length - 1} onClick={() => move(item.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></button><select aria-label={`${item.title} 항목 방식`} className="h-9 border border-border bg-background px-2 text-xs font-bold" value={mode} onChange={(event) => updateMode(item, event.target.value as ItemMode)}><option value="inherit">{scope === "role" ? "공통 정보 사용" : "직군 이력서 사용"}</option><option value="override">이 단계에서 재작성</option><option value="hidden">이 단계에서 숨김</option></select></div></div>{mode === "override" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><MonthField label="시작 연월" value={editable.startMonth} onChange={(startMonth) => updateContent(item.id, { startMonth })} /><MonthField label="종료 연월" value={editable.endMonth} disabled={section.id === "experience" && editable.isCurrent} onChange={(endMonth) => updateContent(item.id, { endMonth })} />{section.id === "experience" && <label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={Boolean(editable.isCurrent)} type="checkbox" onChange={(event) => updateContent(item.id, { isCurrent: event.target.checked, endMonth: event.target.checked ? "" : editable.endMonth })} /> 재직 중</label>}<Field label="제목" value={editable.title} onChange={(title) => updateContent(item.id, { title })} /><Field label="조직·부제" value={editable.subtitle} onChange={(subtitle) => updateContent(item.id, { subtitle })} /><div className="sm:col-span-2"><TextArea label="강조 설명" value={editable.body} onChange={(body) => updateContent(item.id, { body })} /></div></div>}</article>; })}</div><footer className="flex justify-between gap-3 border-t border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">변경 사항은 이 브라우저의 로컬 저장소에 자동 저장됩니다.</p><button className="h-10 bg-primary px-5 text-sm font-bold text-primary-foreground" onClick={onClose}>완료</button></footer></section></div>;
}

function LocalExperienceDialog({ onClose, onLink }: { onClose: () => void; onLink: (brick: ExperienceBrickReference) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [period, setPeriod] = useState("");
  const [organization, setOrganization] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [tags, setTags] = useState("");
  const link = () => onLink({ id: `local-${Date.now()}`, title: title.trim(), content: content.trim(), period: period.trim(), organization: organization.trim(), roleTitle: roleTitle.trim(), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-modal="true" className="my-auto w-full max-w-2xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex items-start justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">LOCAL PROTOTYPE</p><h2 className="mt-1 text-xl font-extrabold">로컬 경험 참조 추가</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">이번 단계에서는 DB에 연결하지 않고 로컬 문서 상태에 참조 스냅샷만 저장합니다.</p></div><button aria-label="로컬 경험 추가 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onClose}><X className="h-4 w-4" /></button></header><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="경험 제목" value={title} onChange={setTitle} /><Field label="기간" placeholder="2024.01 — 현재" value={period} onChange={setPeriod} /><Field label="조직" value={organization} onChange={setOrganization} /><Field label="당시 역할" value={roleTitle} onChange={setRoleTitle} /><div className="sm:col-span-2"><TextArea label="사실과 성과" value={content} onChange={setContent} /></div><div className="sm:col-span-2"><Field label="태그(쉼표 구분)" value={tags} onChange={setTags} /></div></div><footer className="flex justify-end gap-2 border-t border-border bg-muted/30 p-4"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onClose}>취소</button><button className="h-10 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40" disabled={!title.trim() || !content.trim()} onClick={link}>원본 경력에 참조 추가</button></footer></section></div>;
}

function ReadinessDialog({ issues, onClose }: { issues: ResumeReadinessIssue[]; onClose: () => void }) {
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="resume-readiness-title" aria-modal="true" className="my-auto w-full max-w-2xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex items-start justify-between gap-4 border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">PDF 저장 전 확인</p><h2 className="mt-1 text-xl font-extrabold" id="resume-readiness-title">작성 상태 점검</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">수정을 권하는 항목만 안내합니다. 문제가 있어도 PDF 저장은 막지 않습니다.</p></div><button aria-label="작성 상태 점검 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onClose}><X className="h-4 w-4" /></button></header><div className="max-h-[65vh] overflow-y-auto p-5">{issues.length ? <><p className="mb-3 text-sm font-extrabold">확인할 항목 {issues.length}개</p><ol className="grid gap-2">{issues.map((issue, index) => <li className="flex gap-3 border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950" key={`${issue.code}-${issue.sectionId ?? "document"}-${issue.itemId ?? index}`}><span className="grid h-6 w-6 shrink-0 place-items-center bg-amber-500 text-xs font-black text-white">{index + 1}</span><span>{issue.message}</span></li>)}</ol></> : <div className="border border-primary/30 bg-primary/5 p-6 text-center"><Check className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-extrabold">기본 점검을 모두 통과했습니다.</p><p className="mt-1 text-xs text-muted-foreground">페이지 경계와 최종 문구를 확인한 뒤 PDF로 저장하세요.</p></div>}</div><footer className="flex justify-end border-t border-border bg-muted/30 p-4"><button className="h-10 bg-primary px-5 text-sm font-bold text-primary-foreground" onClick={onClose}>확인</button></footer></section></div>;
}

function AddSectionDialog({ afterTitle, kind, title, onKind, onTitle, onCancel, onAdd }: { afterTitle: string; kind: SectionKind; title: string; onKind: (kind: SectionKind) => void; onTitle: (title: string) => void; onCancel: () => void; onAdd: () => void }) {
  const previews: Record<SectionKind, React.ReactNode> = {
    identity: <div className="flex items-end justify-between"><span className="h-4 w-20 bg-slate-800" /><span className="grid gap-1"><i className="h-1 w-14 bg-slate-300" /><i className="h-1 w-10 bg-slate-300" /></span></div>,
    narrative: <div className="grid gap-1"><i className="h-1 w-full bg-slate-400" /><i className="h-1 w-5/6 bg-slate-300" /><i className="h-1 w-2/3 bg-slate-300" /></div>,
    items: <div className="grid gap-2"><span className="grid grid-cols-[35px_1fr] gap-2"><i className="h-2 bg-slate-300" /><i className="h-2 bg-slate-700" /></span><span className="grid grid-cols-[35px_1fr] gap-2"><i className="h-2 bg-slate-300" /><i className="h-2 bg-slate-500" /></span></div>,
    tags: <div className="flex gap-2"><i className="h-5 w-12 bg-slate-200" /><i className="h-5 w-16 bg-slate-200" /><i className="h-5 w-10 bg-slate-200" /></div>,
  };
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="add-resume-section-title" aria-modal="true" className="resume-dialog-panel my-auto w-full max-w-2xl border border-border bg-background shadow-2xl" role="dialog"><header className="flex shrink-0 items-center justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">{afterTitle} 다음 위치</p><h2 className="mt-1 text-xl font-extrabold" id="add-resume-section-title">새 섹션 추가</h2></div><button aria-label="추가 창 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onCancel}><X className="h-4 w-4" /></button></header><div className="resume-dialog-scroll grid gap-5 p-5"><Field label="섹션 제목" value={title} placeholder="예: 오픈소스 활동" onChange={onTitle} /><fieldset><legend className="mb-2 text-xs font-bold text-muted-foreground">내용 형식</legend><div className="grid gap-3 sm:grid-cols-2">{(Object.entries(kinds) as Array<[SectionKind, string]>).map(([value, label]) => <button aria-pressed={kind === value} className={cx("relative border p-4 text-left transition-colors", kind === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50")} key={value} onClick={() => onKind(value)} type="button">{kind === value && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></span>}<span className="block pr-7 font-extrabold">{label}</span><span className="mt-1 block min-h-8 text-[11px] leading-4 text-muted-foreground">{sectionKindGuidance[value]}</span><span aria-hidden="true" className="mt-3 block border border-slate-200 bg-white p-3">{previews[value]}</span></button>)}</div></fieldset></div><footer className="resume-dialog-footer flex shrink-0 justify-end gap-2 border-t border-border bg-muted/30 p-4"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onCancel}>취소</button><button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onAdd}><Plus className="h-4 w-4" /> 추가하고 내용 작성</button></footer></section></div>;
}

function Editor({ draft, onChange, onCancel, onSave }: { draft: EditDraft; onChange: (draft: EditDraft) => void; onCancel: () => void; onSave: () => void }) {
  const choosesTarget = !draft.section.custom && (draft.scope === "role" || draft.scope === "variant");
  const parentLabel = draft.scope === "variant" ? "직군 이력서로 저장하고 전파" : "공통 정보로 저장하고 전파";
  const currentLabel = draft.scope === "variant" ? "이 지원 버전 전용 섹션으로 저장" : "이 직군 전용 섹션으로 저장";
  const currentCompactLabel = draft.scope === "variant" ? "지원 버전 전용" : "직군 전용";
  const parentCompactLabel = draft.scope === "variant" ? "직군에 전파" : "공통에 전파";
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="resume-section-editor-title" className="my-auto w-full max-w-3xl border border-border bg-background shadow-2xl" role="dialog" aria-modal="true"><header className="flex items-center justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">{draft.scope === "shared" ? "공통 정보 편집" : draft.scope === "role" || draft.scope === "role-custom" ? "직군 이력서 편집" : "지원 버전 편집"}</p><h2 className="mt-1 text-xl font-extrabold" id="resume-section-editor-title">{draft.title}</h2></div><button aria-label="편집 창 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onCancel}><X className="h-4 w-4" /></button></header><div className="max-h-[70vh] overflow-y-auto p-5"><div className="mb-5"><Field label="섹션 이름" value={draft.title} onChange={(title) => onChange({ ...draft, title })} /></div><StructuredEditor section={draft.section} content={draft.content} onChange={(content) => onChange({ ...draft, content })} /></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 p-4">{choosesTarget ? <fieldset aria-label="저장 위치" className="flex items-center gap-1"><legend className="sr-only">저장 위치</legend><label aria-label={currentLabel} className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-[11px] font-bold", draft.saveTarget === "current" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground")} title={currentLabel}><input checked={draft.saveTarget === "current"} className="h-3 w-3" name="resume-save-target" type="radio" onChange={() => onChange({ ...draft, saveTarget: "current" })} /> {currentCompactLabel}</label><label aria-label={parentLabel} className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-[11px] font-bold", draft.saveTarget === "parent" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground")} title={parentLabel}><input checked={draft.saveTarget === "parent"} className="h-3 w-3" name="resume-save-target" type="radio" onChange={() => onChange({ ...draft, saveTarget: "parent" })} /> {parentCompactLabel}</label></fieldset> : <p className="text-xs text-muted-foreground">현재 편집 중인 위치에 저장합니다.</p>}<div className="flex gap-2"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onCancel}>취소</button><button className="h-10 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onSave}>저장</button></div></footer></section></div>;
}
