export const DEV_RAG_FIXTURE_DOMAINS = ["PRESS", "RESUME"] as const;

export const PRESS_DEV_RAG_FIXTURE_CONTENT = [
  "브리프플로는 2026년 9월 15일 보도자료 작성 기능을 정식 출시한다.",
  "이 기능은 팀 지식에서 채택한 사실을 근거로 초안을 생성하고 최종 확정 전 검증 상태를 확인한다.",
  "박서윤 대표는 팀이 확인한 사실을 중심으로 안전하게 소식을 전하도록 돕겠다고 밝혔다.",
].join(" ");

export type DevRagFixtureDomain = (typeof DEV_RAG_FIXTURE_DOMAINS)[number];
export type DevRagFixtureRouteDomain = Lowercase<DevRagFixtureDomain>;

export type DevRagFixtureState = {
  domain: DevRagFixtureDomain;
  mounted: boolean;
  changed?: boolean;
  fixtureVersion: string;
  summary: string;
  scope:
    | { kind: "TEAM"; id: string }
    | { kind: "USER"; id: string };
  resourceVersion: number;
};

export type DevRagFixtureMutation = {
  mounted: boolean;
};

export type DevRagFixtureTransition = {
  changed: boolean;
  incrementResourceVersionBy: 0 | 1;
  nextMounted: boolean;
};

export function parseDevRagFixtureDomain(
  value: unknown,
): DevRagFixtureDomain | null {
  if (value === "press") return "PRESS";
  if (value === "resume") return "RESUME";
  return null;
}

export function parseDevRagFixtureMutation(
  value: unknown,
): DevRagFixtureMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== "mounted" ||
    typeof entries[0]?.[1] !== "boolean"
  ) {
    return null;
  }
  return { mounted: entries[0][1] };
}

export function decideDevRagFixtureTransition(
  currentMounted: boolean,
  requestedMounted: boolean,
): DevRagFixtureTransition {
  const changed = currentMounted !== requestedMounted;
  return {
    changed,
    incrementResourceVersionBy: changed ? 1 : 0,
    nextMounted: requestedMounted,
  };
}
