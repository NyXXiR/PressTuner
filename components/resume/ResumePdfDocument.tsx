import {
  formatCareerDuration,
  groupCareerDetails,
  resolveCareerDurationMonths,
  sortExperienceItems,
} from "@/domain/resume-documents/experiencePresentation";
import { formatItemPeriod, type ItemContent, type NarrativeBlockType } from "@/domain/resume-documents/model";
import {
  RESUME_PAGE_MARGIN_BOTTOM_MM,
  RESUME_PAGE_MARGIN_LEFT_MM,
  RESUME_PAGE_MARGIN_RIGHT_MM,
  RESUME_PAGE_MARGIN_TOP_MM,
} from "@/domain/resume-documents/pdfLayout";
import type { ResumePdfSection, ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import { RESUME_PDF_FONT_FAMILY } from "@/lib/services/resume/resumePdfFonts";

const mm = (value: number) => value * 72 / 25.4;
const EMPTY_COPY = "입력된 정보가 없습니다.";
const detailTypeLabels = { project: "프로젝트", responsibility: "상시 책임", improvement: "개선", troubleshooting: "문제 해결" } as const;
const narrativeSizes: Record<NarrativeBlockType, number> = { p: 9.5, h1: 18, h2: 15.5, h3: 13.5, h4: 12, h5: 11, h6: 10 };

type ReactPdfRenderer = typeof import("@react-pdf/renderer");

let Document: ReactPdfRenderer["Document"];
let Image: ReactPdfRenderer["Image"];
let Page: ReactPdfRenderer["Page"];
let Text: ReactPdfRenderer["Text"];
let View: ReactPdfRenderer["View"];

function createStyles(StyleSheet: ReactPdfRenderer["StyleSheet"]) {
  return StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily: RESUME_PDF_FONT_FAMILY,
    fontSize: 9.5,
    lineHeight: 1.55,
    paddingTop: mm(RESUME_PAGE_MARGIN_TOP_MM),
    paddingRight: mm(RESUME_PAGE_MARGIN_RIGHT_MM),
    paddingBottom: mm(RESUME_PAGE_MARGIN_BOTTOM_MM),
    paddingLeft: mm(RESUME_PAGE_MARGIN_LEFT_MM),
  },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: mm(8), marginBottom: mm(8), paddingBottom: mm(3), borderBottomWidth: mm(0.6), borderBottomColor: "#0f172a" },
  company: { color: "#64748b", fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2 },
  role: { marginTop: mm(1), fontSize: 14, fontWeight: 800 },
  documentName: { color: "#64748b", fontSize: 10, fontWeight: 700, maxWidth: "45%", textAlign: "right" },
  section: { marginBottom: mm(7) },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: mm(4), marginBottom: mm(3), paddingBottom: mm(1.5), borderBottomWidth: mm(0.3), borderBottomColor: "#0f172a" },
  sectionTitle: { fontSize: 13, fontWeight: 800 },
  duration: { color: "#475569", fontSize: 8.5, fontWeight: 700 },
  identity: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: mm(6) },
  identityCopy: { flexGrow: 1, flexShrink: 1 },
  identityHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: mm(4) },
  name: { fontSize: 26, fontWeight: 800, letterSpacing: -1 },
  contact: { color: "#64748b", fontSize: 8.5, lineHeight: 1.65, textAlign: "right" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: mm(3), marginTop: mm(3), paddingTop: mm(2), borderTopWidth: mm(0.2), borderTopColor: "#e2e8f0", color: "#64748b", fontSize: 8 },
  photo: { width: mm(24), height: mm(32), objectFit: "cover", borderWidth: mm(0.2), borderColor: "#e2e8f0" },
  empty: { color: "#94a3b8", fontSize: 9 },
  item: { flexDirection: "row", gap: mm(4), marginBottom: mm(4) },
  itemPeriod: { width: mm(26), flexShrink: 0, color: "#64748b", fontSize: 8.5, fontWeight: 700 },
  itemCopy: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  detailType: { color: "#ea580c", fontSize: 7.5, fontWeight: 800 },
  itemTitle: { fontSize: 10.5, fontWeight: 800 },
  itemSubtitle: { color: "#ea580c", fontSize: 8.5, fontWeight: 700 },
  itemBody: { marginTop: mm(1), color: "#475569", fontSize: 9, lineHeight: 1.65 },
  group: { paddingLeft: mm(3), borderLeftWidth: mm(0.5), borderLeftColor: "#cbd5e1", marginBottom: mm(5) },
  groupHeading: { marginBottom: mm(3) },
  groupTitle: { fontSize: 10.5, fontWeight: 800 },
  groupMeta: { color: "#64748b", fontSize: 8.5, fontWeight: 700 },
  warning: { color: "#b45309" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: mm(2) },
  tag: { paddingVertical: mm(1.5), paddingHorizontal: mm(3), backgroundColor: "#f1f5f9", fontSize: 9.5, fontWeight: 700 },
  narrative: { color: "#334155", lineHeight: 1.7, marginBottom: mm(2) },
  narrativeHeading: { color: "#0f172a", lineHeight: 1.25, fontWeight: 800, marginBottom: mm(2) },
  compact: { marginBottom: mm(4) },
  cards: { padding: mm(4), borderWidth: mm(0.2), borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  });
}

let styles: ReturnType<typeof createStyles>;

function Header({ snapshot }: { snapshot: ResumePdfSnapshot }) {
  return <View style={styles.header} wrap={false}>
    <View><Text style={styles.company}>{snapshot.company}</Text><Text style={styles.role}>{snapshot.role}</Text></View>
    <Text style={styles.documentName}>{snapshot.documentName}</Text>
  </View>;
}

function SectionHeading({ section, duration }: { section: ResumePdfSection; duration?: string | null }) {
  return <View minPresenceAhead={42} style={styles.sectionHeading} wrap={false}>
    <Text style={styles.sectionTitle}>{section.title}</Text>
    {duration ? <Text style={styles.duration}>{duration}</Text> : null}
  </View>;
}

function EmptyCopy({ children = EMPTY_COPY }: { children?: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}

function IdentitySection({ section }: { section: Extract<ResumePdfSection, { kind: "identity" }> }) {
  const { content } = section;
  const contacts = [content.email, content.phone, content.location, ...content.links].filter(Boolean) as string[];
  const facts = [content.birthDate && `생년월일 ${content.birthDate}`, content.gender && `성별 ${content.gender}`].filter(Boolean) as string[];
  // eslint-disable-next-line jsx-a11y/alt-text -- React PDF's Image primitive has no HTML alt prop.
  const photo = content.photo ? <Image src={content.photo} style={styles.photo} /> : null;
  return <View style={styles.identity} wrap={false}>
    <View style={styles.identityCopy}>
      <View style={styles.identityHeading}>
        <Text style={styles.name}>{content.name || "이름 미입력"}</Text>
        {contacts.length ? <View>{contacts.map((contact, index) => <Text key={`${contact}-${index}`} style={styles.contact}>{contact}</Text>)}</View> : null}
      </View>
      {facts.length ? <View style={styles.facts}>{facts.map((fact) => <Text key={fact}>{fact}</Text>)}</View> : null}
    </View>
    {photo}
  </View>;
}

function EligibilitySection({ section }: { section: Extract<ResumePdfSection, { kind: "eligibility" }> }) {
  const content = section.content;
  const facts = [
    content.militaryStatus && `병역 ${content.militaryStatus}`,
    content.veteranStatus && `보훈 ${content.veteranStatus}`,
    content.disabilityStatus && `장애 ${content.disabilityStatus}`,
    content.employmentProtectionStatus && `취업보호 ${content.employmentProtectionStatus}`,
  ].filter(Boolean) as string[];
  return <View wrap={false}><SectionHeading section={section} />{facts.length
    ? <View style={styles.facts}>{facts.map((fact) => <Text key={fact}>{fact}</Text>)}</View>
    : <EmptyCopy>선택한 정보가 없습니다.</EmptyCopy>}</View>;
}

function ResumeItem({ item, detailLabel }: { item: ItemContent; detailLabel?: string }) {
  const compact = item.body.length <= 700;
  return <View style={styles.item} wrap={!compact}>
    <Text style={styles.itemPeriod}>{formatItemPeriod(item)}</Text>
    <View style={styles.itemCopy}>
      <View minPresenceAhead={28} wrap={false}>
        {detailLabel ? <Text style={styles.detailType}>{detailLabel}</Text> : null}
        <Text style={styles.itemTitle}>{item.title || "제목 미입력"}</Text>
        {[item.relatedWorkTitle, item.subtitle].filter(Boolean).length ? <Text style={styles.itemSubtitle}>{[item.relatedWorkTitle, item.subtitle].filter(Boolean).join(" · ")}</Text> : null}
      </View>
      {item.body ? <Text orphans={3} style={styles.itemBody} widows={3}>{item.body}</Text> : <EmptyCopy />}
    </View>
  </View>;
}

function NarrativeSection({ section }: { section: Extract<ResumePdfSection, { kind: "narrative" }> }) {
  const blocks = section.content.blocks?.length
    ? section.content.blocks
    : section.content.body.replace(/\r\n?/gu, "\n").split(/\n\s*\n/gu).filter(Boolean).map((text, index) => ({ id: `${section.id}-legacy-${index + 1}`, type: "p" as const, runs: [{ text }] }));
  return <><SectionHeading section={section} />{blocks.length ? blocks.map((block) => {
    const heading = block.type !== "p";
    return <Text
      key={block.id}
      minPresenceAhead={heading ? 32 : 0}
      orphans={3}
      style={[heading ? styles.narrativeHeading : styles.narrative, { fontSize: narrativeSizes[block.type] }]}
      widows={3}
    >{block.runs.map((run, index) => <Text key={`${block.id}-${index}`} style={("bold" in run && run.bold) ? { fontWeight: 700 } : undefined}>{run.text}</Text>)}</Text>;
  }) : <EmptyCopy />}</>;
}

function TagsSection({ section }: { section: Extract<ResumePdfSection, { kind: "tags" }> }) {
  return <><SectionHeading section={section} />{section.content.items.length
    ? <View style={styles.tags}>{section.content.items.map((item, index) => <Text key={`${item}-${index}`} style={styles.tag}>{item}</Text>)}</View>
    : <EmptyCopy />}</>;
}

function GroupedCareerSection({ relatedWorkItems, section }: { relatedWorkItems: ItemContent[]; section: Extract<ResumePdfSection, { kind: "items" }> }) {
  const grouped = groupCareerDetails(relatedWorkItems, section.content.items, { detailSortDirection: section.content.sortDirection });
  const groups = [
    ...grouped.employmentGroups.filter((group) => group.details.length).map((group) => ({ id: group.work.id, title: group.work.title, meta: `${group.work.subtitle} · ${formatItemPeriod(group.work)}`, items: group.details, warning: false })),
    ...(grouped.independentDetails.length ? [{ id: "independent", title: "독립 프로젝트", meta: "", items: grouped.independentDetails, warning: false }] : []),
    ...(grouped.unresolvedDetails.length ? [{ id: "unresolved", title: "연결 확인 필요", meta: "", items: grouped.unresolvedDetails, warning: true }] : []),
  ];
  return <><SectionHeading section={section} />{groups.length ? groups.map((group) => <View key={group.id} style={styles.group}>
    <View minPresenceAhead={42} style={styles.groupHeading} wrap={false}>
      <Text style={[styles.groupTitle, group.warning ? styles.warning : {}]}>{group.title}</Text>
      {group.meta ? <Text style={styles.groupMeta}>{group.meta}</Text> : null}
    </View>
    {group.items.map((item) => <ResumeItem detailLabel={detailTypeLabels[item.detailType ?? "project"]} item={item} key={item.id} />)}
  </View>) : <EmptyCopy />}</>;
}

function ItemsSection({ currentMonth, relatedWorkItems, section }: { currentMonth?: string; relatedWorkItems: ItemContent[]; section: Extract<ResumePdfSection, { kind: "items" }> }) {
  if (section.id === "projects") return <GroupedCareerSection relatedWorkItems={relatedWorkItems} section={section} />;
  const items = section.id === "experience"
    ? sortExperienceItems(section.content.items, section.content.sortDirection)
    : section.content.items;
  const duration = section.id === "experience" && currentMonth
    ? formatCareerDuration(resolveCareerDurationMonths(items, section.content.careerDurationOverrideMonths, currentMonth))
    : null;
  return <><SectionHeading duration={duration} section={section} />{items.length
    ? items.map((item) => <ResumeItem item={item} key={item.id} />)
    : <EmptyCopy />}</>;
}

function PdfSection({ currentMonth, relatedWorkItems, section }: { currentMonth?: string; relatedWorkItems: ItemContent[]; section: ResumePdfSection }) {
  const layoutStyle = section.layout === "cards" ? styles.cards : section.layout === "compact" ? styles.compact : undefined;
  return <View break={section.pageBreakBefore} style={[styles.section, layoutStyle]}>
    {section.kind === "identity" ? <IdentitySection section={section} /> : null}
    {section.kind === "eligibility" ? <EligibilitySection section={section} /> : null}
    {section.kind === "narrative" ? <NarrativeSection section={section} /> : null}
    {section.kind === "tags" ? <TagsSection section={section} /> : null}
    {section.kind === "items" ? <ItemsSection currentMonth={currentMonth} relatedWorkItems={relatedWorkItems} section={section} /> : null}
  </View>;
}

export function ResumePdfDocument({
  renderer,
  snapshot,
}: {
  renderer: ReactPdfRenderer;
  snapshot: ResumePdfSnapshot;
}) {
  ({ Document, Image, Page, Text, View } = renderer);
  styles ??= createStyles(renderer.StyleSheet);
  const relatedWorkItems = snapshot.relatedWorkItems as ItemContent[];
  return <Document title={snapshot.documentName} author={snapshot.company}>
    <Page size="A4" style={styles.page} wrap>
      <Header snapshot={snapshot} />
      {snapshot.sections.filter((section) => !section.hidden).map((section) => <PdfSection
        currentMonth={snapshot.currentMonth}
        key={section.id}
        relatedWorkItems={relatedWorkItems}
        section={section}
      />)}
    </Page>
  </Document>;
}
