import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  event?: Array<{ listen?: string; script?: { exec?: string[] } }>;
  request?: { url?: { raw?: string } };
};

function flatten(items: PostmanItem[]): PostmanItem[] {
  return items.flatMap((item) => [item, ...flatten(item.item ?? [])]);
}

test("press/new Postman collection covers the authenticated end-to-end API flow", async () => {
  const collectionPath = resolve(
    process.cwd(),
    "docs",
    "api",
    "press-new.postman_collection.json",
  );
  const environmentPath = resolve(
    process.cwd(),
    "docs",
    "api",
    "press-new.local.postman_environment.json",
  );
  const collection = JSON.parse(await readFile(collectionPath, "utf8")) as {
    info?: { schema?: string };
    item?: PostmanItem[];
  };
  const environment = JSON.parse(await readFile(environmentPath, "utf8")) as {
    values?: Array<{ key?: string; value?: string; type?: string }>;
  };

  assert.match(collection.info?.schema ?? "", /collection\/v2\.1\.0/);
  const items = flatten(collection.item ?? []);
  const names = new Set(items.map((item) => item.name));
  for (const required of [
    "1. QA 로그인 티켓 발급",
    "2. QA 로그인 세션 생성",
    "3. 보도자료 문서 초기화",
    "4. 브리프 정규화",
    "5. 초안 생성",
    "6. AI 첨삭",
    "7. 선택 첨삭 재작성",
    "8. 재작성 원고 저장",
    "9. 최신 원고 검증",
    "10. 최종 완료",
    "11. 완성 원고 조회",
    "12. FREE 사용량 조회",
  ]) {
    assert.ok(names.has(required), `missing Postman request: ${required}`);
  }

  const allScripts = items
    .flatMap((item) => item.event ?? [])
    .flatMap((event) => event.script?.exec ?? [])
    .join("\n");
  assert.match(allScripts, /pm\.collectionVariables\.set\(['"]articleId['"]/);
  assert.match(
    allScripts,
    /pm\.collectionVariables\.set\(['"]selectedNoteIds['"]/,
  );
  assert.match(allScripts, /pm\.test\(/);

  const env = new Map(
    (environment.values ?? []).map((entry) => [entry.key, entry]),
  );
  assert.equal(env.get("baseUrl")?.value, "http://localhost:3003");
  assert.equal(env.get("qaSecret")?.value, "");
  assert.equal(env.get("qaSecret")?.type, "secret");

  const serialized = JSON.stringify({ collection, environment });
  assert.doesNotMatch(serialized, /AI_QA_AUTH_SECRET\s*=/);
});
