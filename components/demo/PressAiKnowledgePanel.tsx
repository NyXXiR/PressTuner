"use client";

import { useEffect, useRef, useState } from "react";
import {
  deletePressAiKnowledgeDocument,
  fetchPressAiKnowledgeDocuments,
  sampleAssetToFile,
  uploadPressAiKnowledgePdf,
  type PressAiKnowledgeDocument,
} from "@/lib/pressAiProcessDebuggerClient";

const SAMPLE_ASSETS = [
  { path: "/samples/press-ai-debugger/fact-style-facts.pdf", name: "사실 근거 샘플" },
  { path: "/samples/press-ai-debugger/fact-style-guide.pdf", name: "작성 규칙 샘플" },
  { path: "/samples/press-ai-debugger/conflict-old.pdf", name: "충돌 출처 샘플" },
];

export function PressAiKnowledgePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<PressAiKnowledgeDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const result = await fetchPressAiKnowledgeDocuments();
      setDocuments(result.documents);
    } catch {
      setMessage("근거문서를 불러오려면 로그인과 팀 선택이 필요합니다.");
    }
  };
  useEffect(() => { void refresh(); }, []);

  const upload = async (file: File) => {
    setBusy(true); setMessage(null);
    try { await uploadPressAiKnowledgePdf(file); await refresh(); setMessage(`${file.name} 문서를 마운트했습니다.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "문서 마운트에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const mountSample = async (asset: (typeof SAMPLE_ASSETS)[number]) => {
    setBusy(true); setMessage(null);
    try { await upload(await sampleAssetToFile({ path: asset.path, uploadFilename: `${asset.name}.pdf` })); }
    catch (error) { setMessage(error instanceof Error ? error.message : "샘플 문서 마운트에 실패했습니다."); setBusy(false); }
  };
  const unmount = async (document: PressAiKnowledgeDocument) => {
    setBusy(true); setMessage(null);
    try { await deletePressAiKnowledgeDocument(document.id); await refresh(); setMessage(`${document.name} 문서를 언마운트했습니다.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "문서 언마운트에 실패했습니다."); }
    finally { setBusy(false); }
  };

  return <section className="mb-4 rounded-xl border border-border p-4" aria-labelledby="press-ai-knowledge-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 id="press-ai-knowledge-heading" className="font-black">RAG 근거문서</h3><p className="mt-1 text-xs text-muted-foreground">demo/rag-test에서만 사용할 문서를 마운트하거나 언마운트합니다.</p></div>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="min-h-10 rounded-lg border px-3 text-sm font-bold disabled:opacity-50">PDF 업로드</button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
    </div>
    <div className="mt-3 flex flex-wrap gap-2">{SAMPLE_ASSETS.map((asset) => <button key={asset.path} type="button" disabled={busy} onClick={() => void mountSample(asset)} className="rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-50">샘플 마운트 · {asset.name}</button>)}</div>
    {message ? <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
    <ul className="mt-3 space-y-2">{documents.length ? documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span><strong>{document.name}</strong><span className="ml-2 text-xs text-muted-foreground">{document.status} · {document.chunkCount} chunks</span></span><button type="button" disabled={busy} onClick={() => void unmount(document)} className="rounded border px-2 py-1 text-xs font-bold disabled:opacity-50">언마운트</button></li>) : <li className="text-sm text-muted-foreground">마운트된 근거문서가 없습니다.</li>}</ul>
  </section>;
}
