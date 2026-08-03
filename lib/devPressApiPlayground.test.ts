import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildGeneratedPlain,
  evaluatePressDraftQuality,
  isDevPressApiPlaygroundEnabled,
} from "./devPressApiPlayground";

test("press API playground is enabled by default only outside production", () => {
  assert.equal(
    isDevPressApiPlaygroundEnabled({ NODE_ENV: "development" }),
    true,
  );
  assert.equal(isDevPressApiPlaygroundEnabled({ NODE_ENV: "test" }), true);
  assert.equal(
    isDevPressApiPlaygroundEnabled({ NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    isDevPressApiPlaygroundEnabled({
      NODE_ENV: "production",
      ENABLE_DEV_API_PLAYGROUND: "true",
    }),
    true,
  );
});

test("draft helper serializes structural fields once and reports fact quality", () => {
  const plain = buildGeneratedPlain({
    lead: "리드",
    fact: "국내 홍보팀 20곳의 평균 작성 시간이 150분에서 50분으로 줄었다.",
    paragraphs: [
      {
        text: "참여 팀 기록의 단순 평균이며 외부 검증을 거치지 않았고 대조군이 없다.",
      },
      { text: "프레스튜너는 서울에 기반을 둔다." },
    ],
    closing: "마침",
  });

  assert.equal(
    plain,
    [
      "리드",
      "국내 홍보팀 20곳의 평균 작성 시간이 150분에서 50분으로 줄었다.",
      "참여 팀 기록의 단순 평균이며 외부 검증을 거치지 않았고 대조군이 없다.",
      "프레스튜너는 서울에 기반을 둔다.",
      "마침",
    ].join("\n\n"),
  );
  assert.equal(evaluatePressDraftQuality(plain).every((item) => item.pass), true);

  const strengthened = plain.replace("서울에 기반", "서울 본사");
  assert.equal(
    evaluatePressDraftQuality(strengthened).find(
      (item) => item.id === "no-seoul-hq",
    )?.pass,
    false,
  );
});

test("development route exposes the complete stateful flow and server guard", async () => {
  const page = await readFile(
    resolve(
      process.cwd(),
      "app",
      "(dashboard)",
      "dev",
      "api",
      "press-new",
      "page.tsx",
    ),
    "utf8",
  );
  const client = await readFile(
    resolve(
      process.cwd(),
      "app",
      "(dashboard)",
      "dev",
      "api",
      "press-new",
      "PressApiPlaygroundClient.tsx",
    ),
    "utf8",
  );
  const proxy = await readFile(resolve(process.cwd(), "proxy.ts"), "utf8");

  assert.match(page, /assertDevPressApiPlaygroundEnabled/);
  assert.match(page, /requireTeamContext/);
  assert.match(page, /PressApiPlaygroundClient/);
  assert.match(client, /runAll/);
  assert.match(client, /textarea/);
  for (const endpoint of [
    "/api/articles/init",
    "/brief/normalize",
    "/generate",
    "/polish",
    "/re-polish",
    "/save",
    "/verification",
    "/status",
    "/api/articles/usage",
  ]) {
    assert.match(client, new RegExp(endpoint.replace("/", "\\/")));
  }
  assert.match(proxy, /ENABLE_DEV_API_PLAYGROUND/);
  assert.match(proxy, /\/dev\/api\/press-new/);
});

