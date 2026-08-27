"use client";

import { Printer, RotateCcw, X } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { createPortal } from "react-dom";

import { ResumePrintableDocument, type ResumePrintableDocumentProps } from "@/components/resume/ResumePrintableDocument";
import { createPagedResumePreview, type PagedResumePreviewRun } from "@/lib/resume/pagedPreviewer.client";
import { createResumePdfPreviewState, resumePdfPreviewReducer } from "@/components/resume/resumePdfPreviewState";
import { startResumePrintLifecycle, type ResumePrintLifecycle } from "@/components/resume/resumePrintLifecycle";

export function ResumePdfPreviewDialog({ snapshot, onClose }: { snapshot: ResumePrintableDocumentProps; onClose: () => void }) {
  const [state, dispatch] = useReducer(resumePdfPreviewReducer, undefined, () => createResumePdfPreviewState());
  const sourceRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<PagedResumePreviewRun | null>(null);
  const printLifecycleRef = useRef<ResumePrintLifecycle | null>(null);

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
    printLifecycleRef.current?.cancel();
    runRef.current?.dispose();
  }, []);

  const close = () => {
    printLifecycleRef.current?.cancel();
    printLifecycleRef.current = null;
    runRef.current?.dispose();
    runRef.current = null;
    onClose();
  };
  const print = () => {
    if (state.status !== "ready" || !state.pageCount || !runRef.current) return;
    dispatch({ type: "print" });
    printLifecycleRef.current = startResumePrintLifecycle({
      addAfterPrintListener: (listener) => window.addEventListener("afterprint", listener, { once: true }),
      removeAfterPrintListener: (listener) => window.removeEventListener("afterprint", listener),
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      print: () => window.print(),
      setPrinting: (active) => document.body.classList.toggle("resume-pdf-printing", active),
      onFinished: () => {
        printLifecycleRef.current = null;
        dispatch({ type: "print-finished" });
      },
      onError: (error) => console.error("Resume PDF print failed", error),
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
