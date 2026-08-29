import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("press owns canonical dashboard, list, and detail routes", () => {
  assert.match(
    read("app/(dashboard)/press/dashboard/page.tsx"),
    /PressDashboardPage/,
  );
  assert.match(
    read("app/(dashboard)/press/articles/page.tsx"),
    /PressArticlesPage/,
  );
  assert.match(
    read("app/(dashboard)/press/articles/[id]/page.tsx"),
    /articles\/\[id\]\/page/,
  );

  const workspace = read("components/press/PressSimplifiedWorkspace.tsx");
  assert.match(workspace, /href:\s*"\/press\/dashboard"/);
  assert.match(workspace, /href:\s*"\/press\/articles"/);
  assert.doesNotMatch(workspace, /href:\s*"\/my\/(dashboard|articles)"/);
});

test("legacy press-owned paths permanently redirect to the press namespace", () => {
  const config = read("next.config.ts");

  for (const [source, destination] of [
    ["/my/dashboard", "/press/dashboard"],
    ["/my/articles", "/press/articles"],
    ["/articles/new", "/press/new"],
    ["/articles/:id/edit", "/press/:id/edit"],
    ["/articles/:id", "/press/articles/:id"],
  ]) {
    assert.match(
      config,
      new RegExp(
        `source:\\s*"${source.replace(/[/*]/g, "\\$&")}"[\\s\\S]*?destination:\\s*"${destination.replace(/[/*]/g, "\\$&")}"[\\s\\S]*?permanent:\\s*true`,
      ),
    );
  }
});

test("product landings route authenticated users within their selected namespace", () => {
  const rootLanding = read("components/marketing/BriefFlowLandingPage.tsx");
  const pressLanding = read("components/marketing/PressLandingPage.tsx");
  const resumeLanding = read("app/resume/ResumeHomeClient.tsx");

  assert.match(rootLanding, /AuthRedirectIfAuthed usePreferredProductEntry/);
  assert.match(pressLanding, /redirectTo="\/press\/dashboard"/);
  assert.match(resumeLanding, /router\.replace\("\/resume\/dashboard"\)/);
});
