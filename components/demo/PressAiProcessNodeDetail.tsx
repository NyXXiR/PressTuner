"use client";
import { useEffect, useState } from "react";
import type { PressAiProcessNode } from "@/domain/press-ai-debugger/processRegistry";
import { fetchPressAiProcessDetail } from "@/lib/pressAiProcessDebuggerClient";

export function PressAiProcessNodeDetail(props: { runId: string | null; node: PressAiProcessNode }) {
  return <section className="mt-4 rounded-xl border border-border bg-muted/20 p-4"><h4 className="font-black">{props.node.label} 저장 상세</h4><p className="mt-1 text-sm text-muted-foreground">{props.node.description}</p><p className="mt-2 text-sm"><strong>다음 확인:</strong> {props.node.troubleshooting}</p>{props.runId ? <LoadedDetail key={`${props.runId}:${props.node.id}`} runId={props.runId} nodeId={props.node.id}/> : <p className="mt-3 text-sm text-muted-foreground">실행 후 서버에 저장된 입력과 출력을 표시합니다.</p>}</section>;
}

function LoadedDetail(props: { runId: string; nodeId: string }) {
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); void fetchPressAiProcessDetail(props.runId, props.nodeId, controller.signal).then(setDetail).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "DETAIL_FAILED"); }); return () => controller.abort(); }, [props.runId, props.nodeId]);
  if (error) return <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>;
  return <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs">{detail ? JSON.stringify(detail, null, 2) : "저장된 상세를 불러오는 중입니다."}</pre>;
}
