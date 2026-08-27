"use client";

import { Download, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createResumePdfPreviewState, resumePdfPreviewReducer } from "@/components/resume/resumePdfPreviewState";
import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import { requestResumePdf, type ResumePdfResource } from "@/lib/resume/resumePdfPreview.client";

export function ResumePdfPreviewDialog({ snapshot, onClose }: { snapshot: ResumePdfSnapshot; onClose: () => void }) {
  const snapshotKey = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  return <ResumePdfPreviewDialogContent key={snapshotKey} onClose={onClose} snapshot={snapshot} />;
}

function ResumePdfPreviewDialogContent({ snapshot, onClose }: { snapshot: ResumePdfSnapshot; onClose: () => void }) {
  const [state, dispatch] = useReducer(resumePdfPreviewReducer, undefined, () => createResumePdfPreviewState());
  const [resource, setResource] = useState<ResumePdfResource | null>(null);
  const resourceRef = useRef<ResumePdfResource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const disposeCurrent = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    resourceRef.current?.dispose();
    resourceRef.current = null;
    setResource(null);
  }, []);
  const close = useCallback(() => {
    disposeCurrent();
    onClose();
  }, [disposeCurrent, onClose]);
  const retry = useCallback(() => {
    disposeCurrent();
    dispatch({ type: "retry" });
  }, [disposeCurrent]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    abortRef.current?.abort();
    abortRef.current = controller;
    resourceRef.current?.dispose();
    resourceRef.current = null;
    const attemptId = state.attemptId;

    void requestResumePdf(snapshot, { signal: controller.signal }).then((nextResource) => {
      if (!active) {
        nextResource.dispose();
        return;
      }
      resourceRef.current?.dispose();
      resourceRef.current = nextResource;
      setResource(nextResource);
      dispatch({ type: "ready", attemptId, pageCount: nextResource.pageCount });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
      dispatch({
        type: "error",
        attemptId,
        error: error instanceof Error ? error.message : "PDF 파일을 생성하지 못했습니다.",
      });
    });

    return () => {
      active = false;
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
      resourceRef.current?.dispose();
      resourceRef.current = null;
    };
  }, [state.attemptId, snapshot]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);

  return createPortal(
    <div className="resume-pdf-dialog-root" role="presentation">
      <section aria-labelledby="resume-pdf-preview-title" aria-modal="true" className="resume-pdf-dialog-panel" role="dialog">
        <header className="resume-pdf-dialog-chrome">
          <div>
            <p className="resume-pdf-eyebrow">PDF 저장 미리보기</p>
            <h2 id="resume-pdf-preview-title">생성된 이력서 확인</h2>
            <p aria-live="polite" className="resume-pdf-status">
              {state.status === "generating" && "PDF 미리보기를 만드는 중입니다."}
              {state.status === "ready" && `PDF 생성 완료 · 정확히 ${state.pageCount}페이지`}
              {state.status === "error" && `미리보기를 만들지 못했습니다. ${state.error}`}
            </p>
          </div>
          <button aria-label="PDF 미리보기 닫기" onClick={close} type="button"><X aria-hidden="true" /></button>
        </header>

        <div aria-busy={state.status === "generating"} aria-label="생성된 PDF 파일" className="resume-pdf-output">
          {state.status === "generating" && <div className="resume-pdf-placeholder">PDF 파일을 안전하게 생성하고 있습니다…</div>}
          {state.status === "error" && <div className="resume-pdf-placeholder resume-pdf-error">잠시 후 다시 시도해 주세요.</div>}
          {state.status === "ready" && resource && <iframe src={resource.url} title="생성된 이력서 PDF 미리보기">
            PDF 미리보기를 표시할 수 없습니다. <a download={resource.filename} href={resource.url}>PDF 다운로드</a>
          </iframe>}
        </div>

        <footer className="resume-pdf-dialog-chrome">
          {state.status === "error" && <button onClick={retry} type="button"><RotateCcw aria-hidden="true" /> 다시 시도</button>}
          <button onClick={close} type="button">닫기</button>
          {state.status === "ready" && resource && <a download={resource.filename} href={resource.url}><Download aria-hidden="true" /> PDF 다운로드</a>}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
