import type { QualityRunView } from "../../../domain/press-workflow/evaluation/article-evaluation";
import { revisionInstruction, sameDraft, type Draft } from "./adapter";
import { standardDraftText } from "../../../domain/press-workflow/evaluation/standard";

type Editor = Draft & { articleId: string; notes: { id: string; type: string }[] };
export async function requestQualityRevision(articleId: string, run: QualityRunView, ports: {
  current: () => Editor; save: () => Promise<boolean>;
  review: (instruction: string) => Promise<boolean>;
  select: (ids: string[]) => void; rewrite: (instruction: string) => Promise<boolean>;
  active?: () => boolean;
}) {
  const base = { title: ports.current().title, plain: ports.current().plain };
  const unchanged = () => ports.active?.() !== false && ports.current().articleId === articleId && sameDraft(ports.current(), base);
  const ensureCurrent = () => { if (!unchanged()) throw new Error("원고가 변경됐어요. 현재 원고를 확인한 뒤 다시 요청해 주세요."); };
  ensureCurrent();
  if (run.freshness !== "CURRENT" || run.output !== standardDraftText(base.title, base.plain)) throw new Error("원고가 바뀌었어요. 현재 원고를 다시 확인한 뒤 수정안을 요청해 주세요.");
  if (!(await ports.save())) throw new Error("원고를 저장하지 못했어요. 저장 후 다시 요청해 주세요.");
  ensureCurrent();
  const instruction = revisionInstruction(run);
  if (!(await ports.review(instruction))) throw new Error("첨삭을 완료하지 못했어요. 사용량과 연결 상태를 확인해 주세요.");
  ensureCurrent();
  const ids = [...ports.current().notes].sort((a, b) => Number(b.type === "RISK") - Number(a.type === "RISK")).slice(0, 3).map(n => n.id);
  if (!ids.length) return "NO_CHANGES" as const;
  ports.select(ids);
  if (!(await ports.rewrite(instruction))) throw new Error("수정안을 만들지 못했어요. 자동으로 다시 요청하지 않았습니다.");
  ensureCurrent();
  return "READY" as const;
}
