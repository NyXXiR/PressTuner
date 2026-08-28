"use client";

import { Download, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createResumePdfPreviewState, resumePdfPreviewReducer } from "@/components/resume/resumePdfPreviewState";
import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import { requestResumePdf, type ResumePdfResource } from "@/lib/resume/resumePdfPreview.client";

export function ResumePdfPreviewDialog({ snapshot, onClose, onPageBreakBeforeChange }: { snapshot: ResumePdfSnapshot; onClose: () => void; onPageBreakBeforeChange: (sectionId: string, enabled: boolean) => void }) {
  const [state, dispatch] = useReducer(resumePdfPreviewReducer, undefined, () => createResumePdfPreviewState());
  const [resource, setResource] = useState<ResumePdfResource | null>(null);
  const resourceRef = useRef<ResumePdfResource | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const snapshotKey = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const snapshotRef = useRef(snapshot);
  const previousSnapshotKeyRef = useRef(snapshotKey);
  const visibleSections = snapshot.sections.filter((section) => !section.hidden);
  const pageBreakCount = visibleSections.filter((section) => section.pageBreakBefore).length;

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
    abortRef.current?.abort();
    dispatch({ type: "retry" });
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (previousSnapshotKeyRef.current === snapshotKey) return;
    previousSnapshotKeyRef.current = snapshotKey;
    dispatch({ type: "regenerate" });
  }, [snapshotKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    abortRef.current?.abort();
    abortRef.current = controller;
    const attemptId = state.attemptId;

    void requestResumePdf(snapshotRef.current, { signal: controller.signal }).then((nextResource) => {
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
    };
  }, [state.attemptId]);

  useEffect(() => () => {
    abortRef.current?.abort();
    resourceRef.current?.dispose();
    resourceRef.current = null;
  }, []);

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
              {state.status === "generating" && (resource ? "페이지 나누기를 반영하는 중입니다. 현재 미리보기는 그대로 유지됩니다." : "PDF 미리보기를 만드는 중입니다.")}
              {state.status === "ready" && `PDF 생성 완료 · 정확히 ${state.pageCount}페이지`}
              {state.status === "error" && `미리보기를 만들지 못했습니다. ${state.error}`}
            </p>
          </div>
          <button aria-label="PDF 미리보기 닫기" onClick={close} type="button"><X aria-hidden="true" /></button>
        </header>

        <details className="resume-pdf-page-breaks">
          <summary><span><SlidersHorizontal aria-hidden="true" /> 페이지 나누기 조정</span><small>{pageBreakCount ? `${pageBreakCount}개 적용 중` : "자동 배치"}</small></summary>
          <div className="resume-pdf-page-breaks-body">
            <div><strong>섹션 시작 위치</strong><p>미리보기를 보면서 다음 페이지로 넘길 섹션만 선택하세요. 변경 내용은 현재 이력서에 자동 저장됩니다.</p></div>
            <ol>{visibleSections.map((section, index) => <li key={section.id}><label><span><b>{String(index + 1).padStart(2, "0")}</b><strong>{section.title}</strong></span><span>{index === 0 ? "첫 섹션" : "새 페이지에서 시작"}<input checked={Boolean(section.pageBreakBefore)} disabled={index === 0} onChange={(event) => onPageBreakBeforeChange(section.id, event.target.checked)} type="checkbox" /></span></label></li>)}</ol>
            <button disabled={!pageBreakCount} onClick={() => snapshot.sections.filter((section) => section.pageBreakBefore).forEach((section) => onPageBreakBeforeChange(section.id, false))} type="button"><RotateCcw aria-hidden="true" /> 페이지 나누기 모두 해제</button>
          </div>
        </details>

        <div aria-busy={state.status === "generating"} aria-label="생성된 PDF 파일" className="resume-pdf-output">
          {!resource && state.status === "generating" && <div className="resume-pdf-placeholder">PDF 파일을 안전하게 생성하고 있습니다…</div>}
          {!resource && state.status === "error" && <div className="resume-pdf-placeholder resume-pdf-error">잠시 후 다시 시도해 주세요.</div>}
          {resource && <iframe src={resource.url} title="생성된 이력서 PDF 미리보기">
            PDF 미리보기를 표시할 수 없습니다. <a download={resource.filename} href={resource.url}>PDF 다운로드</a>
          </iframe>}
          {resource && state.status === "generating" && <div className="resume-pdf-refreshing">페이지 배치를 다시 만드는 중…</div>}
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
