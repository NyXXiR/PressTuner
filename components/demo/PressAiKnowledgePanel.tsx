"use client";

import { useEffect, useRef, useState } from "react";
import {
  deletePressAiKnowledgeDocument,
  fetchPressAiKnowledgeDocuments,
  PressAiDebuggerApiError,
  sampleAssetToFile,
  uploadPressAiKnowledgePdf,
  type PressAiKnowledgeDocument,
} from "@/lib/pressAiProcessDebuggerClient";
import {
  formatIndexingElapsed,
  isKnowledgeDocumentBusy,
  knowledgeErrorMessage,
  knowledgeStatusLabel,
  summarizeKnowledgeDocuments,
} from "./pressAiKnowledgeStatus";

const SAMPLE_ASSETS = [
  { path: "/samples/press-ai-debugger/fact-style-facts.pdf", name: "사실 근거 샘플" },
  { path: "/samples/press-ai-debugger/fact-style-guide.pdf", name: "작성 규칙 샘플" },
  { path: "/samples/press-ai-debugger/conflict-old.pdf", name: "충돌 출처 샘플" },
];

/** Indexing runs on the scheduler, so the list only settles if we keep asking. */
const POLL_INTERVAL_MS = 2000;

function failureText(error: unknown, fallback: string) {
  if (error instanceof PressAiDebuggerApiError)
    return knowledgeErrorMessage(error.code);
  return error instanceof Error ? knowledgeErrorMessage(error.message) : fallback;
}

export function PressAiKnowledgePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<PressAiKnowledgeDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [collapsedByUser, setCollapsedByUser] = useState<boolean | null>(null);
  // Re-rendered on a timer so the "N초 경과" readout advances between polls.
  const [now, setNow] = useState(() => Date.now());

  const summary = summarizeKnowledgeDocuments(documents);
  // Open by default while something needs watching; an explicit choice wins.
  const open = collapsedByUser === null ? summary.needsAttention : !collapsedByUser;

  const refresh = async () => {
    try {
      const result = await fetchPressAiKnowledgeDocuments();
      setDocuments(result.documents);
      return result.documents;
    } catch {
      setMessage("근거문서를 불러오려면 로그인과 팀 선택이 필요합니다.");
      return [];
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Poll only while a document is mid-flight; stop as soon as everything settles.
  useEffect(() => {
    if (!summary.busy) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [summary.busy]);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      await uploadPressAiKnowledgePdf(file);
      const next = await refresh();
      setMessage(
        next.some((item) => isKnowledgeDocumentBusy(item.status))
          ? `${file.name} 인덱싱을 시작했습니다. 준비되면 자동으로 표시됩니다.`
          : `${file.name} 문서를 마운트했습니다.`,
      );
    } catch (error) {
      setMessage(failureText(error, "문서 마운트에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const mountSample = async (asset: (typeof SAMPLE_ASSETS)[number]) => {
    setBusy(true);
    setMessage(null);
    try {
      await upload(
        await sampleAssetToFile({
          path: asset.path,
          uploadFilename: `${asset.name}.pdf`,
        }),
      );
    } catch (error) {
      setMessage(failureText(error, "샘플 문서 마운트에 실패했습니다."));
      setBusy(false);
    }
  };

  const unmount = async (document: PressAiKnowledgeDocument) => {
    setBusy(true);
    setMessage(null);
    try {
      await deletePressAiKnowledgeDocument(document.id);
      await refresh();
      setMessage(`${document.name} 문서를 언마운트했습니다.`);
    } catch (error) {
      setMessage(failureText(error, "문서 언마운트에 실패했습니다."));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="mb-4 rounded-xl border border-border"
      aria-labelledby="press-ai-knowledge-heading"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={() => setCollapsedByUser(open)}
          aria-expanded={open}
          aria-controls="press-ai-knowledge-body"
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {open ? "▾" : "▸"}
          </span>
          <h3
            id="press-ai-knowledge-heading"
            className="whitespace-nowrap font-black"
          >
            RAG 근거문서
          </h3>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {summary.text}
          </span>
          {summary.busy ? (
            <span
              aria-hidden="true"
              className="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
          ) : null}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="min-h-10 shrink-0 rounded-lg border border-border px-3 text-sm font-bold disabled:opacity-50"
        >
          PDF 업로드
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = "";
          }}
        />
      </div>

      {open ? (
        <div
          id="press-ai-knowledge-body"
          className="border-t border-border p-3 pt-3"
        >
          <p className="text-xs text-muted-foreground">
            demo/rag-test에서만 사용할 문서를 마운트하거나 언마운트합니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLE_ASSETS.map((asset) => (
              <button
                key={asset.path}
                type="button"
                disabled={busy}
                onClick={() => void mountSample(asset)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                샘플 마운트 · {asset.name}
              </button>
            ))}
          </div>
          {message ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {documents.length ? (
              documents.map((document) => {
                const indexing = isKnowledgeDocumentBusy(document.status);
                const failed = document.status === "FAILED";
                const startedAt = document.createdAt
                  ? Date.parse(document.createdAt)
                  : Number.NaN;
                return (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="min-w-0">
                      <strong className="break-all">{document.name}</strong>
                      <span
                        title={document.status}
                        className={`ml-2 text-xs ${
                          failed
                            ? "text-rose-700 dark:text-rose-300"
                            : "text-muted-foreground"
                        }`}
                      >
                        {indexing ? (
                          <span
                            aria-hidden="true"
                            className="mr-1 inline-block size-2.5 animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
                          />
                        ) : null}
                        {knowledgeStatusLabel(document.status)}
                        {document.status === "READY"
                          ? ` · ${document.chunkCount}청크`
                          : ""}
                        {indexing && Number.isFinite(startedAt)
                          ? ` · ${formatIndexingElapsed(now - startedAt)}`
                          : ""}
                      </span>
                      {failed && document.errorMessage ? (
                        <span className="mt-0.5 block text-xs text-rose-700 dark:text-rose-300">
                          {document.errorMessage}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={busy || indexing}
                      title={
                        indexing
                          ? "인덱싱이 끝나면 제거할 수 있습니다"
                          : undefined
                      }
                      onClick={() => void unmount(document)}
                      className="shrink-0 rounded border border-border px-2 py-1 text-xs font-bold disabled:opacity-50"
                    >
                      언마운트
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="text-sm text-muted-foreground">
                마운트된 근거문서가 없습니다.
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
