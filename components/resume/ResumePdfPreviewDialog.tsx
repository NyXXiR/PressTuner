"use client";

import { Printer, RotateCcw, X } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { createPortal } from "react-dom";

import { ResumePrintableDocument, type ResumePrintableDocumentProps } from "@/components/resume/ResumePrintableDocument";
import { createPagedResumePreview, type PagedResumePreviewRun } from "@/lib/resume/pagedPreviewer.client";
import { createResumePdfPreviewState, resumePdfPreviewReducer } from "@/components/resume/resumePdfPreviewState";

export function ResumePdfPreviewDialog({ snapshot, onClose }: { snapshot: ResumePrintableDocumentProps; onClose: () => void }) {
  const [state, dispatch] = useReducer(resumePdfPreviewReducer, undefined, () => createResumePdfPreviewState());
  const sourceRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<PagedResumePreviewRun | null>(null);
  const printFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const source = sourceRef.current?.querySelector<HTMLElement>(".resume-printable-document");
    const output = outputRef.current;
    if (!source || !output) return;
    let stale = false;
    const generation = state.generation;
    runRef.current?.dispose();
    runRef.current = null;
    void createPagedResumePreview(source, output).then((run) => {
      if (stale) { run.dispose(); return; }
      runRef.current = run;
      dispatch({ type: "ready", generation, pageCount: run.pageCount });
    }).catch((error: unknown) => {
      if (stale) return;
      dispatch({ type: "error", generation, error: error instanceof Error ? error.message : "PDF 페이지 생성에 실패했습니다." });
    });
    return () => { stale = true; };
  }, [state.generation]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => () => {
    if (printFrameRef.current !== null) window.cancelAnimationFrame(printFrameRef.current);
    document.body.classList.remove("resume-pdf-printing");
    runRef.current?.dispose();
  }, []);

  const close = () => {
    document.body.classList.remove("resume-pdf-printing");
    runRef.current?.dispose();
    runRef.current = null;
    onClose();
  };
  const print = () => {
    if (state.status !== "ready" || !state.pageCount || !runRef.current) return;
    dispatch({ type: "print" });
    document.body.classList.add("resume-pdf-printing");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove("resume-pdf-printing");
      window.removeEventListener("afterprint", finish);
      dispatch({ type: "print-finished" });
    };
    window.addEventListener("afterprint", finish, { once: true });
    printFrameRef.current = window.requestAnimationFrame(() => {
      printFrameRef.current = null;
      try { window.print(); }
      finally { finish(); }
    });
  };

  return createPortal(
    <div className="resume-pdf-dialog-root" role="presentation">
      <section aria-labelledby="resume-pdf-preview-title" aria-modal="true" className="resume-pdf-dialog-panel" role="dialog">
        <header className="resume-pdf-dialog-chrome"><div><p className="resume-pdf-eyebrow">PDF 저장 미리보기</p><h2 id="resume-pdf-preview-title">인쇄할 페이지 확인</h2><p aria-live="polite" className="resume-pdf-status">
          {state.status === "loading" && "PDF 미리보기를 만드는 중입니다."}
          {state.status === "ready" && `페이지 미리보기 완료 · 정확히 ${state.pageCount}페이지`}
          {state.status === "error" && `미리보기를 만들지 못했습니다. ${state.error}`}
          {state.status === "printing" && "인쇄 대화상자를 여는 중입니다."}
        </p></div><button aria-label="PDF 미리보기 닫기" onClick={close} type="button"><X aria-hidden="true" /></button></header>
        <div className="resume-pdf-source" ref={sourceRef}><ResumePrintableDocument {...snapshot} /></div>
        <div aria-busy={state.status === "loading"} aria-label="생성된 PDF 페이지" className="resume-pdf-output" ref={outputRef} />
        <footer className="resume-pdf-dialog-chrome">
          {state.status === "error" && <button onClick={() => dispatch({ type: "retry" })} type="button"><RotateCcw aria-hidden="true" /> 다시 시도</button>}
          <button onClick={close} type="button">닫기</button>
          <button disabled={state.status !== "ready"} onClick={print} type="button"><Printer aria-hidden="true" /> PDF 인쇄</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
