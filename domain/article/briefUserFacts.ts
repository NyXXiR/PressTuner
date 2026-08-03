export type BriefUserFactInput = {
  serviceName?: string | null;
  announceType?: string | null;
  oneLiner?: string | null;
  points?: readonly string[] | null;
  quoteWho?: string | null;
  quoteMessage?: string | null;
  eventAt?: string | null;
  publishAt?: string | null;
};

export type BriefUserFactSpec = {
  sourceKey: string;
  content: string;
};

type ExistingBriefFact = {
  id: string;
  sourceKey: string | null;
  content: string;
  active: boolean;
};

const MANAGED_PREFIX = "brief:";

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildBriefUserFactSpecs(
  brief: BriefUserFactInput,
): BriefUserFactSpec[] {
  const specs: BriefUserFactSpec[] = [];
  const serviceName = clean(brief.serviceName);
  const announceType = clean(brief.announceType);
  if (serviceName || announceType) {
    specs.push({
      sourceKey: "brief:announcement",
      content: [serviceName, announceType].filter(Boolean).join(" · "),
    });
  }
  const oneLiner = clean(brief.oneLiner);
  if (oneLiner) {
    specs.push({ sourceKey: "brief:one-liner", content: oneLiner });
  }
  (brief.points ?? []).forEach((point, index) => {
    const content = clean(point);
    if (content) {
      specs.push({ sourceKey: `brief:point:${index}`, content });
    }
  });
  const quoteWho = clean(brief.quoteWho);
  const quoteMessage = clean(brief.quoteMessage).replace(/^["“”]|["“”]$/g, "");
  if (quoteWho && quoteMessage) {
    specs.push({
      sourceKey: "brief:quote",
      content: `${quoteWho}: "${quoteMessage}"`,
    });
  }
  const eventAt = clean(brief.eventAt);
  if (eventAt) {
    specs.push({
      sourceKey: "brief:event-at",
      content: `행사/출시 일시: ${eventAt}`,
    });
  }
  const publishAt = clean(brief.publishAt);
  if (publishAt) {
    specs.push({
      sourceKey: "brief:publish-at",
      content: `보도자료 게시 일시: ${publishAt}`,
    });
  }
  return specs;
}

export function planBriefUserFactSync(
  current: readonly ExistingBriefFact[],
  desired: readonly BriefUserFactSpec[],
) {
  const managed = new Map(
    current
      .filter((fact) => fact.sourceKey?.startsWith(MANAGED_PREFIX))
      .map((fact) => [fact.sourceKey as string, fact]),
  );
  const desiredKeys = new Set(desired.map(({ sourceKey }) => sourceKey));
  const upserts = desired.filter((fact) => {
    const existing = managed.get(fact.sourceKey);
    return (
      !existing ||
      !existing.active ||
      clean(existing.content) !== clean(fact.content)
    );
  });
  const deactivateIds = [...managed.values()]
    .filter((fact) => fact.active && !desiredKeys.has(fact.sourceKey as string))
    .map(({ id }) => id);
  return {
    upserts,
    deactivateIds,
    changed: upserts.length > 0 || deactivateIds.length > 0,
  };
}
