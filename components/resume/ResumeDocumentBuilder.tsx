"use client";

import { Check, CopyPlus, Edit3, EyeOff, FileText, GripVertical, LayoutTemplate, Plus, Printer, Settings2, Trash2, X } from "lucide-react";
import { Reorder, useDragControls, type DragControls } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  RESUME_DOCUMENT_STORAGE_KEY,
  addCustomSection,
  createResumeDocumentSeed,
  deleteCustomSection,
  duplicateVariant,
  orderResumeSections,
  parseResumeDocumentState,
  resolveSection,
  updateCustomSection,
  updateSectionOrder,
  updateSectionSetting,
  updateSharedSection,
  type IdentityContent,
  type ItemContent,
  type ItemsContent,
  type NarrativeContent,
  type ResumeDocumentState,
  type ResumeSection,
  type SectionContent,
  type SectionKind,
  type SectionLayout,
  type SectionMode,
  type TagsContent,
} from "@/domain/resume-documents/model";

const modes: Record<SectionMode, string> = { inherit: "공통 사용", override: "이 이력서용 재작성", hidden: "이 이력서에서 숨김" };
const layouts: Record<SectionLayout, string> = { standard: "기본", compact: "간결", cards: "카드" };
const kinds: Record<SectionKind, string> = { identity: "인적사항", narrative: "소개글", items: "경력·학력 등 목록", tags: "역량·키워드" };
type EditDraft = { scope: "shared" | "variant" | "custom"; section: ResumeSection; content: SectionContent; title: string };
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");
const clone = <T,>(value: T): T => structuredClone(value);

export function ResumeDocumentBuilder() {
  const [state, setState] = useState<ResumeDocumentState>(() => createResumeDocumentSeed());
  const [view, setView] = useState<"resume" | "shared">("resume");
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionKind, setNewSectionKind] = useState<SectionKind>("items");
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState<"loading" | "saved" | "error">("loading");

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
    if (!draft && !insertAfterId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setDraft(null); setInsertAfterId(null); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [draft, insertAfterId]);

  const active = useMemo(() => state.variants.find((item) => item.id === state.activeVariantId) ?? state.variants[0], [state]);
  const orderedSections = useMemo(() => active ? orderResumeSections(state.sharedSections, active) : state.sharedSections, [active, state.sharedSections]);
  if (!active) return null;
  const updateActive = (patch: Partial<typeof active>) => setState((current) => ({ ...current, variants: current.variants.map((item) => item.id === active.id ? { ...item, ...patch } : item) }));
  const setting = (sectionId: string, patch: Parameters<typeof updateSectionSetting>[3]) => setState((current) => updateSectionSetting(current, active.id, sectionId, patch));
  const openEditor = (scope: EditDraft["scope"], section: ResumeSection, content: SectionContent) => setDraft({ scope, section, content: clone(content), title: section.title });
  const saveDraft = () => {
    if (!draft) return;
    setState((current) => {
      if (draft.scope === "shared") return updateSharedSection(current, draft.section.id, draft.content);
      if (draft.scope === "custom") return updateCustomSection(current, active.id, draft.section.id, { title: draft.title.trim() || "새 섹션", content: draft.content });
      return updateSectionSetting(current, active.id, draft.section.id, { mode: "override", content: draft.content });
    });
    setDraft(null);
  };
  const createCustom = () => {
    if (!insertAfterId) return;
    const result = addCustomSection(state, active.id, { title: newSectionTitle, kind: newSectionKind, afterSectionId: insertAfterId });
    setState(result.state);
    setNewSectionTitle("");
    setInsertAfterId(null);
    openEditor("custom", result.section, result.section.content);
  };
  const removeCustom = (section: ResumeSection) => {
    setState((current) => deleteCustomSection(current, active.id, section.id));
    setPendingDeleteId(null);
  };
  const deleteActive = () => {
    if (state.variants.length < 2 || !window.confirm(`‘${active.name}’을 삭제할까요?`)) return;
    setState((current) => { const variants = current.variants.filter((item) => item.id !== active.id); return { ...current, variants, activeVariantId: variants[0].id }; });
  };

  return (
    <div className="resume-document-builder wongoji-sharp mx-auto w-full max-w-[1280px] pb-20">
      <header className="resume-builder-chrome border-b-2 border-foreground pb-5">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div><p className="flex items-center gap-2 text-[11px] font-bold tracking-[.18em] text-primary"><FileText className="h-4 w-4" /> RESUME DOCUMENTS</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">이력서 문서 편집</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">공통 내용은 한 번 관리하고, 지원처마다 필요한 섹션만 재작성하거나 새로 추가해 완성 문서를 만드세요.</p></div>
          <div className="flex flex-wrap gap-2"><button className="inline-flex h-11 items-center gap-2 border border-border bg-background px-4 text-sm font-bold hover:bg-muted" onClick={() => setState((current) => duplicateVariant(current, active.id))}><CopyPlus className="h-4 w-4" /> 이력서 복제</button>{state.variants.length > 1 && <button className="inline-flex h-11 items-center gap-2 border border-red-300 bg-background px-4 text-sm font-bold text-red-700 hover:bg-red-50" onClick={deleteActive}><Trash2 className="h-4 w-4" /> 삭제</button>}<button className="inline-flex h-11 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={() => void document.fonts.ready.then(() => window.print())}><Printer className="h-4 w-4" /> PDF로 저장</button></div>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div aria-label="이력서 문서 화면" className="flex border border-border bg-background p-1" role="tablist"><Tab active={view === "resume"} onClick={() => setView("resume")}>이력서 편집</Tab><Tab active={view === "shared"} onClick={() => setView("shared")}>공통 사항 관리</Tab></div>
          {view === "resume" && <label className="grid min-w-56 gap-1 text-xs font-bold text-muted-foreground">이력서 선택<select className="h-10 border border-border bg-background px-3 text-sm text-foreground" value={active.id} onChange={(event) => setState((current) => ({ ...current, activeVariantId: event.target.value }))}>{state.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </div>
      </header>

      {view === "shared" ? <SharedManager sections={state.sharedSections} onEdit={(section) => openEditor("shared", section, section.content)} /> : (
        <div className="resume-builder-layout mt-6 grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="resume-builder-chrome border border-border bg-card p-5 xl:sticky xl:top-24">
            <h2 className="flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4 text-primary" /> 문서 설정</h2><div className="mt-5 grid gap-4"><Field label="이력서 이름" value={active.name} onChange={(name) => updateActive({ name })} /><Field label="지원 회사" value={active.company} onChange={(company) => updateActive({ company })} /><Field label="지원 직무" value={active.role} onChange={(role) => updateActive({ role })} /></div>
            <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-extrabold">이력서 전용 섹션</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">문서에서 원하는 섹션 아래의 추가 버튼을 누르세요. 만든 뒤에도 드래그로 위치를 바꿀 수 있습니다.</p></div>
            <p aria-live="polite" className={cx("mt-6 flex items-center gap-1.5 border-t border-border pt-4 text-[11px]", storageStatus === "error" ? "text-red-600" : "text-muted-foreground")}><Check className={cx("h-3.5 w-3.5", storageStatus === "error" ? "text-red-600" : "text-primary")} /> {storageStatus === "error" ? "자동 저장에 실패했습니다. 내용을 별도로 보관해 주세요." : storageStatus === "saved" ? "이 브라우저에 자동 저장됐습니다." : "저장 내용을 불러오는 중입니다."}</p>
          </aside>
          <article className="resume-paper mx-auto w-full max-w-[210mm] bg-white text-slate-950 shadow-xl"><div className="min-h-[297mm] px-[14mm] py-[16mm]"><div className="resume-print-target mb-8 flex items-end justify-between border-b-2 border-slate-950 pb-3"><div><p className="text-[9px] font-bold tracking-widest text-slate-500">{active.company || "지원 회사"}</p><p className="mt-1 text-sm font-black">{active.role || "지원 직무"}</p></div><p className="text-xs font-bold text-slate-500">{active.name}</p></div><p className="resume-reorder-help mb-4 flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><GripVertical className="h-3.5 w-3.5" /> 핸들을 끌어 이 이력서의 섹션 순서를 바꿀 수 있습니다.</p><Reorder.Group axis="y" className="grid gap-7" onReorder={(sectionOrder) => setState((current) => updateSectionOrder(current, active.id, sectionOrder))} values={orderedSections.map((section) => section.id)}>{orderedSections.map((section) => {
            const resolved = resolveSection(section, active);
            return <SortableSection key={section.id} sectionId={section.id}>{(dragControls) => <>{resolved.mode === "hidden" ? <HiddenSection section={section} dragControls={dragControls} onRestore={() => setting(section.id, { mode: "inherit" })} /> : <DocumentSection dragControls={dragControls} section={section} content={resolved.content} mode={resolved.mode} layout={resolved.layout} onMode={(mode) => setting(section.id, { mode })} onLayout={(layout) => section.custom ? setState((current) => updateCustomSection(current, active.id, section.id, { layout })) : setting(section.id, { layout })} onEdit={() => openEditor(section.custom ? "custom" : "variant", section, resolved.content)} deletePending={pendingDeleteId === section.id} onDelete={section.custom ? () => pendingDeleteId === section.id ? removeCustom(section) : setPendingDeleteId(section.id) : undefined} />}<button className="resume-section-controls mt-3 inline-flex h-9 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-[10px] font-bold text-slate-500 hover:border-orange-400 hover:text-orange-600" onClick={() => { setInsertAfterId(section.id); setNewSectionTitle(""); }}><Plus className="h-3.5 w-3.5" /> {section.title} 뒤에 새 섹션 추가</button></>}</SortableSection>;
          })}</Reorder.Group></div></article>
        </div>
      )}
      {draft && <Editor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft} />}
      {insertAfterId && <AddSectionDialog afterTitle={orderedSections.find((section) => section.id === insertAfterId)?.title ?? "선택한 섹션"} kind={newSectionKind} title={newSectionTitle} onKind={setNewSectionKind} onTitle={setNewSectionTitle} onCancel={() => setInsertAfterId(null)} onAdd={createCustom} />}
    </div>
  );
}

function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button aria-selected={active} className={cx("h-10 px-4 text-sm font-bold", active ? "bg-foreground text-background" : "text-muted-foreground")} onClick={onClick} role="tab">{children}</button>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">{label}<input className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">{label}<textarea className="min-h-28 resize-y border border-border bg-background p-3 text-sm font-normal leading-6 text-foreground" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }

function contentSummary(section: ResumeSection) {
  if (section.kind === "identity") { const value = section.content as IdentityContent; return [value.name, value.role, value.email, ...value.links].filter(Boolean).join(" · "); }
  if (section.kind === "narrative") return (section.content as NarrativeContent).body;
  if (section.kind === "tags") return (section.content as TagsContent).items.join(" · ");
  return (section.content as ItemsContent).items.map((item) => [item.meta, item.title, item.subtitle].filter(Boolean).join(" · ")).join("\n");
}
function SharedManager({ sections, onEdit }: { sections: ResumeSection[]; onEdit: (section: ResumeSection) => void }) { return <section className="mt-7"><div className="border border-primary/25 bg-primary/5 p-5"><h2 className="text-lg font-extrabold">모든 이력서의 기본 내용</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">PDF에 보이는 필드와 항목 단위로 편집할 수 있습니다. 여기서 수정한 내용은 ‘공통 사용’ 상태인 이력서에 바로 반영됩니다.</p></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sections.map((section) => <article className="flex min-h-48 flex-col border border-border bg-card p-5" key={section.id}><LayoutTemplate className="h-4 w-4 text-primary" /><h3 className="mt-4 text-lg font-extrabold">{section.title}</h3><p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{contentSummary(section) || "아직 작성된 내용이 없습니다."}</p><button className="mt-auto inline-flex h-10 items-center justify-center gap-2 border border-border bg-background text-sm font-bold hover:text-primary" onClick={() => onEdit(section)}><Edit3 className="h-4 w-4" /> 공통 내용 편집</button></article>)}</div></section>; }

function SortableSection({ children, sectionId }: { children: (dragControls: DragControls) => React.ReactNode; sectionId: string }) { const dragControls = useDragControls(); return <Reorder.Item className="relative" dragControls={dragControls} dragListener={false} value={sectionId} whileDrag={{ opacity: .8, scale: 1.01, zIndex: 20 }}>{children(dragControls)}</Reorder.Item>; }
function DragHandle({ dragControls, title }: { dragControls: DragControls; title: string }) { return <button aria-label={`${title} 섹션 순서 이동`} className="resume-drag-handle grid h-10 w-10 shrink-0 touch-none cursor-grab place-items-center border border-slate-300 bg-white text-slate-500 active:cursor-grabbing sm:h-8 sm:w-8" onPointerDown={(event) => dragControls.start(event)} type="button"><GripVertical className="h-4 w-4" /></button>; }
function HiddenSection({ dragControls, onRestore, section }: { dragControls: DragControls; onRestore: () => void; section: ResumeSection }) { return <div className="resume-hidden flex items-center justify-between gap-2 border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500"><span className="flex items-center gap-2 font-bold"><DragHandle dragControls={dragControls} title={section.title} /><EyeOff className="h-4 w-4" /> {section.title} · 숨김</span><button className="border border-slate-300 bg-white px-3 py-2 font-bold" onClick={onRestore}>복원</button></div>; }

function DocumentSection({ section, content, mode, layout, onMode, onLayout, onEdit, onDelete, deletePending, dragControls }: { section: ResumeSection; content: SectionContent; mode: Exclude<SectionMode, "hidden">; layout: SectionLayout; onMode: (mode: SectionMode) => void; onLayout: (layout: SectionLayout) => void; onEdit: () => void; onDelete?: () => void; deletePending?: boolean; dragControls: DragControls }) {
  return <section className="resume-document-section" data-layout={layout}><div className="resume-section-controls mb-2 flex flex-wrap justify-between gap-2 border border-dashed border-slate-300 bg-slate-50 p-2"><span className={cx("flex items-center gap-2 text-[10px] font-bold", mode === "override" ? "text-orange-600" : "text-slate-500")}><DragHandle dragControls={dragControls} title={section.title} /> {section.title} · {section.custom ? "이 이력서 전용" : modes[mode]}</span><div className="flex flex-wrap gap-1">{!section.custom && <select aria-label={`${section.title} 내용 방식`} className="h-10 border border-slate-300 bg-white px-2 text-[10px] font-bold sm:h-8" value={mode} onChange={(event) => onMode(event.target.value as SectionMode)}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}<select aria-label={`${section.title} 스타일`} className="h-10 border border-slate-300 bg-white px-2 text-[10px] font-bold sm:h-8" value={layout} onChange={(event) => onLayout(event.target.value as SectionLayout)}>{Object.entries(layouts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="h-10 border border-slate-300 bg-white px-2 text-[10px] font-bold sm:h-8" onClick={onEdit}>{section.custom || mode === "override" ? "내용 편집" : "맞춤 편집"}</button>{onDelete && <button aria-label={deletePending ? `${section.title} 섹션 삭제 확인` : `${section.title} 섹션 삭제`} className={cx("h-10 border border-red-200 bg-white px-2 text-[10px] font-bold text-red-600 sm:h-8", !deletePending && "w-10")} onClick={onDelete}>{deletePending ? "삭제 확인" : <Trash2 className="mx-auto h-3.5 w-3.5" />}</button>}</div></div>{section.kind !== "identity" && <h2 className="mb-3 border-b border-slate-900 pb-1.5 text-[13px] font-black">{section.title}</h2>}<SectionBody section={section} content={content} layout={layout} /></section>;
}

function SectionBody({ section, content, layout }: { section: ResumeSection; content: SectionContent; layout: SectionLayout }) {
  if (section.kind === "identity") { const value = content as IdentityContent; return <div className={cx("grid items-end gap-6", layout === "compact" ? "grid-cols-1 gap-2" : "grid-cols-[1fr_auto]", layout === "cards" && "border border-slate-200 p-4")}><div><h2 className="text-3xl font-black tracking-[-.05em]">{value.name}</h2><p className="mt-1 text-sm font-bold text-orange-600">{value.role}</p></div><div className={cx("text-[9px] leading-5 text-slate-500", layout !== "compact" && "text-right")}><p>{value.email}</p>{value.links.map((link, index) => <p key={`${link}-${index}`}>{link}</p>)}</div></div>; }
  if (section.kind === "narrative") return <p className={cx("whitespace-pre-line text-[10px] text-slate-700", layout === "compact" ? "leading-5" : "leading-6", layout === "cards" && "border border-slate-200 bg-slate-50 p-4")}>{(content as NarrativeContent).body}</p>;
  if (section.kind === "tags") return <div className="flex flex-wrap gap-2">{(content as TagsContent).items.map((item, index) => <span className={cx("text-[10px] font-bold", layout === "cards" ? "border border-slate-300 px-3 py-2" : layout === "compact" ? "border-b border-slate-300" : "bg-slate-100 px-3 py-1.5")} key={`${item}-${index}`}>{item}</span>)}</div>;
  return <div className={cx("grid", layout === "cards" ? "grid-cols-2 gap-3" : layout === "compact" ? "gap-2" : "gap-4")}>{(content as ItemsContent).items.map((item) => <article className={cx(layout === "cards" && "border border-slate-200 p-3", layout === "standard" && "grid grid-cols-[26mm_1fr] gap-4")} key={item.id}><p className="text-[9px] font-bold text-slate-500">{item.meta}</p><div><h3 className="text-[11px] font-black">{item.title}</h3><p className="text-[9px] font-bold text-orange-600">{item.subtitle}</p><p className="mt-1 whitespace-pre-line text-[9px] leading-5 text-slate-600">{item.body}</p></div></article>)}</div>;
}

function StructuredEditor({ section, content, onChange }: { section: ResumeSection; content: SectionContent; onChange: (content: SectionContent) => void }) {
  if (section.kind === "identity") {
    const value = content as IdentityContent;
    return <div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="이름" value={value.name} onChange={(name) => onChange({ ...value, name })} /><Field label="직무 또는 한 줄 소개" value={value.role} onChange={(role) => onChange({ ...value, role })} /><Field label="이메일" value={value.email} onChange={(email) => onChange({ ...value, email })} /></div><ListEditor label="링크" addLabel="링크 추가" items={value.links} placeholder="https://..." onChange={(links) => onChange({ ...value, links })} /></div>;
  }
  if (section.kind === "narrative") { const value = content as NarrativeContent; return <TextArea label="내용" placeholder="PDF에 표시할 소개글을 입력하세요." value={value.body} onChange={(body) => onChange({ body })} />; }
  if (section.kind === "tags") { const value = content as TagsContent; return <ListEditor label="항목" addLabel="항목 추가" items={value.items} placeholder="예: 문제 해결" onChange={(items) => onChange({ items })} />; }
  const value = content as ItemsContent;
  const updateItem = (id: string, patch: Partial<ItemContent>) => onChange({ items: value.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  return <div><div className="grid gap-3">{value.items.map((item, index) => <fieldset className="border border-border bg-muted/20 p-4" key={item.id}><legend className="px-2 text-xs font-extrabold">항목 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2"><Field label="기간·연도" value={item.meta} onChange={(meta) => updateItem(item.id, { meta })} /><Field label="제목" value={item.title} onChange={(title) => updateItem(item.id, { title })} /><Field label="조직·부제" value={item.subtitle} onChange={(subtitle) => updateItem(item.id, { subtitle })} /><div className="sm:col-span-2"><TextArea label="설명" value={item.body} onChange={(body) => updateItem(item.id, { body })} /></div></div><button className="mt-3 inline-flex h-9 items-center gap-2 border border-red-200 px-3 text-xs font-bold text-red-600" onClick={() => onChange({ items: value.items.filter((entry) => entry.id !== item.id) })} type="button"><Trash2 className="h-3.5 w-3.5" /> 이 항목 삭제</button></fieldset>)}</div><button className="mt-3 inline-flex h-10 items-center gap-2 border border-primary px-4 text-sm font-bold text-primary" onClick={() => onChange({ items: [...value.items, { id: `item-${Date.now()}`, meta: "", title: "", subtitle: "", body: "" }] })} type="button"><Plus className="h-4 w-4" /> 항목 추가</button></div>;
}

function ListEditor({ label, addLabel, items, placeholder, onChange }: { label: string; addLabel: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) { return <div><p className="text-xs font-bold text-muted-foreground">{label}</p><div className="mt-2 grid gap-2">{items.map((item, index) => <div className="flex gap-2" key={index}><input aria-label={`${label} ${index + 1}`} className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-sm" placeholder={placeholder} value={item} onChange={(event) => onChange(items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><button aria-label={`${label} ${index + 1} 삭제`} className="grid h-10 w-10 place-items-center border border-red-200 text-red-600" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div><button className="mt-2 inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-bold" onClick={() => onChange([...items, ""])} type="button"><Plus className="h-3.5 w-3.5" /> {addLabel}</button></div>; }

function AddSectionDialog({ afterTitle, kind, title, onKind, onTitle, onCancel, onAdd }: { afterTitle: string; kind: SectionKind; title: string; onKind: (kind: SectionKind) => void; onTitle: (title: string) => void; onCancel: () => void; onAdd: () => void }) {
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"><section aria-labelledby="add-resume-section-title" aria-modal="true" className="w-full max-w-lg border border-border bg-background shadow-2xl" role="dialog"><header className="flex items-center justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">{afterTitle} 다음 위치</p><h2 className="mt-1 text-xl font-extrabold" id="add-resume-section-title">새 섹션 추가</h2></div><button aria-label="추가 창 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onCancel}><X className="h-4 w-4" /></button></header><div className="grid gap-4 p-5"><Field label="섹션 제목" value={title} placeholder="예: 오픈소스 활동" onChange={onTitle} /><label className="grid gap-1.5 text-xs font-bold text-muted-foreground">내용 형식<select className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground" value={kind} onChange={(event) => onKind(event.target.value as SectionKind)}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><footer className="flex justify-end gap-2 border-t border-border bg-muted/30 p-4"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onCancel}>취소</button><button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onAdd}><Plus className="h-4 w-4" /> 추가하고 내용 작성</button></footer></section></div>;
}

function Editor({ draft, onChange, onCancel, onSave }: { draft: EditDraft; onChange: (draft: EditDraft) => void; onCancel: () => void; onSave: () => void }) {
  return <div className="resume-editor-backdrop fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4"><section aria-labelledby="resume-section-editor-title" className="my-auto w-full max-w-3xl border border-border bg-background shadow-2xl" role="dialog" aria-modal="true"><header className="flex items-center justify-between border-b border-border p-5"><div><p className="text-[10px] font-bold tracking-widest text-primary">{draft.scope === "shared" ? "공통 사항 편집" : draft.scope === "custom" ? "이력서 전용 섹션 편집" : "이 이력서용 재작성"}</p><h2 className="mt-1 text-xl font-extrabold" id="resume-section-editor-title">{draft.title}</h2></div><button aria-label="편집 창 닫기" className="grid h-10 w-10 place-items-center border border-border" onClick={onCancel}><X className="h-4 w-4" /></button></header><div className="max-h-[70vh] overflow-y-auto p-5">{draft.scope === "custom" && <div className="mb-5"><Field label="섹션 제목" value={draft.title} onChange={(title) => onChange({ ...draft, title })} /></div>}<StructuredEditor section={draft.section} content={draft.content} onChange={(content) => onChange({ ...draft, content })} /></div><footer className="flex justify-end gap-2 border-t border-border bg-muted/30 p-4"><button className="h-10 border border-border px-4 text-sm font-bold" onClick={onCancel}>취소</button><button className="h-10 bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={onSave}>저장</button></footer></section></div>;
}
