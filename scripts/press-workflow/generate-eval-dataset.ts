import { mkdir, writeFile } from "node:fs/promises";
import { datasetSchema } from "../../domain/press-workflow/evaluation/contracts";

// Authored fixtures are evaluation challenges, never model measurements or human labels.
const products = ["모리노트", "하루지도", "작은서재", "푸른일정", "이음메모", "달빛작업"];
const cases = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1, product = `${products[i % products.length]} ${n}`, day = `${(i % 24) + 1}`, price = `${(n + 1) * 1000}`;
  const valid = `${product}, 11월 ${day}일 출시\n${product}를 만나보세요. 11월 ${day}일부터 이용할 수 있어요. 월 이용료는 ${price}원이에요. 메모를 주제별로 정리할 수 있어요.`;
  const challenge = (kind: string, text: string, expectedFailures: string[]) => ({ kind, text, expectedFailures, expectationSource: "AI_AUTHORED" });
  return { caseId: `C${String(n).padStart(2, "0")}`, groupId: `launch-${String(n).padStart(2, "0")}`,
    partition: n % 3 === 0 ? "HOLDOUT" : "DEVELOPMENT",
    request: `${product} 출시 보도자료를 처음 읽는 독자에게 친근하게 써 주세요. 출시일과 월 이용료를 반드시 넣고, 근거 없는 성과나 과장은 추가하지 마세요.`,
    facts: [{ id: "launch", content: `${product}의 출시일은 2026년 11월 ${day}일이다.` }, { id: "price", content: `${product}의 월 이용료는 ${price}원이다.` }, { id: "feature", content: `${product}는 메모를 주제별로 정리한다.` }],
    requiredFactIds: ["launch", "price"], requestedStyle: "처음 접하는 독자가 이해할 수 있는 쉽고 친근한 존댓말. 사실과 수치는 유지한다.",
    styleExamples: "표현 참고 전용: 별빛앱은 100만 명의 사랑을 받는 업계 최고의 서비스예요. 별빛앱의 성과와 수치는 이 제품의 사실이 아닙니다.",
    challenges: [challenge("VALID", valid, []),
      challenge("OMISSION", `${product}를 만나보세요. 메모를 주제별로 정리할 수 있어요.`, ["REQUIRED_FACTS"]),
      challenge("CONTRADICTION", valid.replace(`월 이용료는 ${price}원`, `월 이용료는 ${Number(price) + 999}원`), ["FACTUAL_SUPPORT", "REQUIRED_FACTS"]),
      challenge("STYLE", `${product}는 2026년 11월 ${day}일 출시된다. 월 이용료는 ${price}원이다. 메모를 주제별로 정리한다.`, ["REQUESTED_STYLE"]),
      challenge("LEAKAGE", `${valid}\n이미 100만 명이 이용하고 있어요.`, ["FACTUAL_SUPPORT", "STYLE_LEAKAGE"]),
      challenge("PROMOTION", `${valid}\n업계 최고의 성능을 입증했어요.`, ["FACTUAL_SUPPORT", "PROMOTIONAL_CLAIMS"]),
      challenge("PARAPHRASE", `${product}는 2026년 11월 ${day}일부터 만날 수 있어요. 한 달에 ${price}원을 내면 메모를 주제에 따라 묶을 수 있어요.`, [])],
  };
});
async function main() {
  const data = datasetSchema.parse({ version: "press-dual-dataset/v1", provenance: "SYNTHETIC_AI_AUTHORED", cases });
  await mkdir("evals/press-workflow/dual/v1", { recursive: true });
  await writeFile("evals/press-workflow/dual/v1/dataset.json", `${JSON.stringify(data, null, 2)}\n`);
}
main().catch(() => { console.error("Dataset generation failed"); process.exitCode = 1; });
