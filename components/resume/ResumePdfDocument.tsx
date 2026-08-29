import { Fragment } from "react";

import {
  formatCareerDuration,
  groupCareerDetails,
  orderCareerDetailDisplayGroups,
  resolveCareerDurationLabel,
  resolveCareerDurationMonths,
  resolveIndependentCareerDetailGroupTitle,
  sortExperienceItems,
} from "@/domain/resume-documents/experiencePresentation";
import { formatItemPeriod, type ItemContent } from "@/domain/resume-documents/model";
import { RESUME_DOCUMENT_LAYOUT, RESUME_NARRATIVE_FONT_SIZES_PT } from "@/domain/resume-documents/documentLayout";
import {
  RESUME_PAGE_MARGIN_BOTTOM_MM,
  RESUME_PDF_CONTENT_WIDTH_MM,
  RESUME_PAGE_MARGIN_LEFT_MM,
  RESUME_PAGE_MARGIN_RIGHT_MM,
  RESUME_PAGE_MARGIN_TOP_MM,
} from "@/domain/resume-documents/pdfLayout";
import type { ResumePdfSection, ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import {
  identityContactItems,
  identityFactItems,
  RESUME_IDENTITY_LAYOUT,
  wrapIdentityContact,
} from "@/domain/resume-documents/identityLayout";
import { RESUME_PDF_FONT_FAMILY } from "@/lib/services/resume/resumePdfFonts";
import { careerDetailLabel, careerDetailSubtitle, normalizeTagGroups } from "@/domain/resume-documents/contentPresentation";

const mm = (value: number) => value * 72 / 25.4;
const EMPTY_COPY = "입력된 정보가 없습니다.";
const SECTION_OPENING_PRESENCE_POINTS = 72;
const ITEM_UNBREAKABLE_BODY_UNITS = 220;
const ITEM_OPENING_BODY_UNITS = 180;
const ITEM_BODY_WIDOWS = 3;
const TAG_ROW_WIDTH_SAFETY_POINTS = 2;
const UNINTERRUPTED_TEXT = /\S{24,}/gu;
const FULL_WIDTH_GLYPH_EM = 0.94;

function estimatedGlyphWidth(character: string, fontSize: number) {
  if (/^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]$/u.test(character)) {
    return fontSize * FULL_WIDTH_GLYPH_EM;
  }
  if (/^[A-Z]$/u.test(character)) return fontSize * 0.68;
  if (/^[a-z0-9]$/u.test(character)) return fontSize * 0.55;
  return fontSize * 0.45;
}

function withSimpleLineWrap(text: string, fontSize: number, layout: ResumePdfSection["layout"], width?: number) {
  const horizontalInset = layout === "cards" ? mm(8) : 0;
  const availableWidth = width ?? mm(RESUME_PDF_CONTENT_WIDTH_MM) - horizontalInset - 1;
  return text.replace(UNINTERRUPTED_TEXT, (run) => {
    let lineWidth = 0;
    let wrapped = "";
    for (const character of Array.from(run)) {
      const characterWidth = estimatedGlyphWidth(character, fontSize);
      if (lineWidth > 0 && lineWidth + characterWidth > availableWidth) {
        wrapped += "\n";
        lineWidth = 0;
      }
      wrapped += character;
      lineWidth += characterWidth;
    }
    return wrapped;
  });
}

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
    fontSize: RESUME_DOCUMENT_LAYOUT.baseFontSizePt,
    lineHeight: RESUME_DOCUMENT_LAYOUT.baseLineHeight,
    paddingTop: mm(RESUME_PAGE_MARGIN_TOP_MM),
    paddingRight: mm(RESUME_PAGE_MARGIN_RIGHT_MM),
    paddingBottom: mm(RESUME_PAGE_MARGIN_BOTTOM_MM),
    paddingLeft: mm(RESUME_PAGE_MARGIN_LEFT_MM),
  },
  header: { marginBottom: mm(RESUME_DOCUMENT_LAYOUT.headerBottomGapMm), paddingBottom: mm(RESUME_DOCUMENT_LAYOUT.headerBottomPaddingMm), borderBottomWidth: mm(RESUME_DOCUMENT_LAYOUT.headerBorderWidthMm), borderBottomColor: "#0f172a" },
  company: { color: "#64748b", fontSize: RESUME_DOCUMENT_LAYOUT.companyFontSizePt, fontWeight: 700, letterSpacing: 1.2 },
  role: { marginTop: mm(RESUME_DOCUMENT_LAYOUT.roleTopGapMm), fontSize: RESUME_DOCUMENT_LAYOUT.roleFontSizePt, fontWeight: 800 },
  section: { marginBottom: mm(RESUME_DOCUMENT_LAYOUT.sectionGapMm) },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: mm(RESUME_DOCUMENT_LAYOUT.sectionHeadingGapMm), marginBottom: mm(RESUME_DOCUMENT_LAYOUT.sectionHeadingBottomGapMm), paddingBottom: mm(RESUME_DOCUMENT_LAYOUT.sectionHeadingBottomPaddingMm), borderBottomWidth: mm(RESUME_DOCUMENT_LAYOUT.sectionHeadingBorderWidthMm), borderBottomColor: "#0f172a" },
  sectionTitle: { fontSize: RESUME_DOCUMENT_LAYOUT.sectionTitleFontSizePt, fontWeight: 800 },
  duration: { color: "#475569", fontSize: RESUME_DOCUMENT_LAYOUT.durationFontSizePt, fontWeight: 700 },
  identity: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: mm(RESUME_IDENTITY_LAYOUT.columnGapMm) },
  identityCopy: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  identityHeading: { marginBottom: mm(RESUME_IDENTITY_LAYOUT.nameToContactsGapMm) },
  name: { fontSize: RESUME_IDENTITY_LAYOUT.nameFontSizePt, fontWeight: 800, letterSpacing: RESUME_IDENTITY_LAYOUT.nameLetterSpacingPt, lineHeight: RESUME_IDENTITY_LAYOUT.nameLineHeight },
  contactGrid: { gap: mm(RESUME_IDENTITY_LAYOUT.contactRowGapMm) },
  contactItem: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: mm(RESUME_IDENTITY_LAYOUT.contactColumnGapMm) },
  contactLabel: { width: mm(RESUME_IDENTITY_LAYOUT.contactLabelWidthMm), flexShrink: 0, color: "#94a3b8", fontSize: RESUME_IDENTITY_LAYOUT.contactLabelFontSizePt, fontWeight: 800, letterSpacing: RESUME_IDENTITY_LAYOUT.contactLabelLetterSpacingPt, paddingTop: mm(0.6) },
  contactValue: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0, color: "#334155", fontSize: RESUME_IDENTITY_LAYOUT.contactValueFontSizePt, lineHeight: RESUME_IDENTITY_LAYOUT.contactValueLineHeight },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: mm(3), marginTop: mm(RESUME_IDENTITY_LAYOUT.factsTopGapMm), paddingTop: mm(RESUME_IDENTITY_LAYOUT.factsTopPaddingMm), borderTopWidth: mm(0.2), borderTopColor: "#e2e8f0", color: "#64748b", fontSize: RESUME_IDENTITY_LAYOUT.factsFontSizePt },
  photo: { width: mm(RESUME_IDENTITY_LAYOUT.photoWidthMm), height: mm(RESUME_IDENTITY_LAYOUT.photoHeightMm), objectFit: "cover", borderWidth: mm(0.3), borderColor: "#cbd5e1" },
  empty: { color: "#94a3b8", fontSize: RESUME_DOCUMENT_LAYOUT.emptyFontSizePt },
  item: { flexDirection: "row", gap: mm(RESUME_DOCUMENT_LAYOUT.itemColumnGapMm), marginBottom: mm(RESUME_DOCUMENT_LAYOUT.itemGapMm) },
  itemFlow: { marginBottom: mm(RESUME_DOCUMENT_LAYOUT.itemGapMm) },
  itemRow: { flexDirection: "row", gap: mm(RESUME_DOCUMENT_LAYOUT.itemColumnGapMm) },
  itemPeriod: { width: mm(RESUME_DOCUMENT_LAYOUT.itemPeriodWidthMm), flexShrink: 0, color: "#64748b", fontSize: RESUME_DOCUMENT_LAYOUT.itemPeriodFontSizePt, fontWeight: 700 },
  itemPeriodSpacer: { width: mm(RESUME_DOCUMENT_LAYOUT.itemPeriodWidthMm), flexShrink: 0 },
  itemCopy: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  detailType: { color: "#ea580c", fontSize: RESUME_DOCUMENT_LAYOUT.detailTypeFontSizePt, fontWeight: 800 },
  itemTitle: { fontSize: RESUME_DOCUMENT_LAYOUT.itemTitleFontSizePt, fontWeight: 800 },
  itemSubtitle: { color: "#ea580c", fontSize: RESUME_DOCUMENT_LAYOUT.itemSubtitleFontSizePt, fontWeight: 700 },
  itemBody: { marginTop: mm(RESUME_DOCUMENT_LAYOUT.itemBodyTopGapMm), color: "#475569", fontSize: RESUME_DOCUMENT_LAYOUT.itemBodyFontSizePt, lineHeight: RESUME_DOCUMENT_LAYOUT.itemBodyLineHeight },
  itemBodyContinuation: { color: "#475569", fontSize: RESUME_DOCUMENT_LAYOUT.itemBodyFontSizePt, lineHeight: RESUME_DOCUMENT_LAYOUT.itemBodyLineHeight },
  group: { paddingLeft: mm(RESUME_DOCUMENT_LAYOUT.groupLeftPaddingMm), borderLeftWidth: mm(RESUME_DOCUMENT_LAYOUT.groupBorderWidthMm), borderLeftColor: "#cbd5e1", marginBottom: mm(RESUME_DOCUMENT_LAYOUT.groupGapMm) },
  groupHeading: { marginBottom: mm(RESUME_DOCUMENT_LAYOUT.groupHeadingBottomGapMm) },
  groupTitle: { fontSize: RESUME_DOCUMENT_LAYOUT.groupTitleFontSizePt, fontWeight: 800 },
  groupMeta: { color: "#64748b", fontSize: RESUME_DOCUMENT_LAYOUT.groupMetaFontSizePt, fontWeight: 700 },
  warning: { color: "#b45309" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: mm(RESUME_DOCUMENT_LAYOUT.tagGapMm) },
  tag: { paddingVertical: mm(RESUME_DOCUMENT_LAYOUT.tagVerticalPaddingMm), paddingHorizontal: mm(RESUME_DOCUMENT_LAYOUT.tagHorizontalPaddingMm), backgroundColor: "#f1f5f9", fontSize: RESUME_DOCUMENT_LAYOUT.tagFontSizePt, fontWeight: 700 },
  tagGroups: { gap: mm(3) },
  tagGroupOpening: {},
  tagGroupTitle: { marginBottom: mm(1.5), color: "#475569", fontSize: RESUME_DOCUMENT_LAYOUT.itemSubtitleFontSizePt, fontWeight: 800 },
  tagContinuation: { marginTop: mm(RESUME_DOCUMENT_LAYOUT.tagGapMm) },
  itemRichBody: { marginTop: mm(RESUME_DOCUMENT_LAYOUT.itemBodyTopGapMm), gap: mm(RESUME_DOCUMENT_LAYOUT.narrativeBlockGapMm) },
  narrative: { color: "#334155", lineHeight: RESUME_DOCUMENT_LAYOUT.narrativeBodyLineHeight, marginBottom: mm(RESUME_DOCUMENT_LAYOUT.narrativeBlockGapMm) },
  narrativeHeading: { color: "#0f172a", lineHeight: RESUME_DOCUMENT_LAYOUT.narrativeHeadingLineHeight, fontWeight: 800, marginBottom: mm(RESUME_DOCUMENT_LAYOUT.narrativeBlockGapMm) },
  compact: { marginBottom: mm(4) },
  cards: { padding: mm(4), borderWidth: mm(0.2), borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  highlightGrid: { flexDirection: "row", flexWrap: "wrap", gap: mm(RESUME_DOCUMENT_LAYOUT.highlightGapMm) },
  highlightCard: { width: "48%", minHeight: mm(RESUME_DOCUMENT_LAYOUT.highlightMinHeightMm), padding: mm(RESUME_DOCUMENT_LAYOUT.highlightPaddingMm), borderWidth: mm(RESUME_DOCUMENT_LAYOUT.highlightBorderWidthMm), borderColor: "#cbd5e1", backgroundColor: "#f8fafc" },
  highlightIndex: { color: "#ea580c", fontSize: RESUME_DOCUMENT_LAYOUT.highlightIndexFontSizePt, fontWeight: 800, letterSpacing: 0.8, marginBottom: mm(2) },
  highlightTitle: { fontSize: RESUME_DOCUMENT_LAYOUT.highlightTitleFontSizePt, fontWeight: 800 },
  highlightSubtitle: { color: "#64748b", fontSize: RESUME_DOCUMENT_LAYOUT.highlightSubtitleFontSizePt, fontWeight: 700, marginTop: mm(1) },
  highlightBody: { color: "#475569", fontSize: RESUME_DOCUMENT_LAYOUT.highlightBodyFontSizePt, lineHeight: RESUME_DOCUMENT_LAYOUT.highlightBodyLineHeight, marginTop: mm(2) },
  });
}

let styles: ReturnType<typeof createStyles>;

function Header({ snapshot }: { snapshot: ResumePdfSnapshot }) {
  return <View style={styles.header} wrap={false}>
    <Text style={styles.company}>{snapshot.company}</Text>
    <Text style={styles.role}>{snapshot.role}</Text>
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
  const contacts = identityContactItems(content);
  const facts = identityFactItems(content);
  const hasPhoto = Boolean(content.photo);
  // eslint-disable-next-line jsx-a11y/alt-text -- React PDF's Image primitive has no HTML alt prop.
  const photo = content.photo ? <Image src={content.photo} style={styles.photo} /> : null;
  return <View style={styles.identity} wrap={false}>
    <View style={styles.identityCopy}>
      <View style={styles.identityHeading}>
        <Text style={styles.name}>{content.name || "이름 미입력"}</Text>
      </View>
      {contacts.length ? <View style={styles.contactGrid}>{contacts.map((contact, index) => <View key={`${contact.label}-${contact.value}-${index}`} style={styles.contactItem}><Text style={styles.contactLabel}>{contact.label}</Text><Text style={styles.contactValue}>{wrapIdentityContact(contact.value, hasPhoto)}</Text></View>)}</View> : null}
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

function splitItemBodyOpening(body: string): [opening: string, continuation: string] {
  let units = 0;
  let index = 0;
  let nearbyBoundary = 0;
  for (const character of body) {
    index += character.length;
    units += /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(character) ? 2 : 1;
    if (units >= ITEM_OPENING_BODY_UNITS * 0.9 && /[\s.,;:!?\u2026\u00b7•。！？、]/u.test(character)) nearbyBoundary = index;
    if (units >= ITEM_OPENING_BODY_UNITS) {
      const splitAt = nearbyBoundary || index;
      return [body.slice(0, splitAt), body.slice(splitAt)];
    }
  }
  return [body, ""];
}

function itemBodyUnits(item: ItemContent) {
  const text = item.bodyBlocks?.length
    ? item.bodyBlocks.flatMap((block) => block.runs.map((run) => run.text)).join("\n")
    : item.body;
  let units = 0;
  for (const character of text) units += /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(character) ? 2 : 1;
  return units;
}

function RichItemBody({ item, variant = "item" }: { item: ItemContent; variant?: "item" | "highlight" }) {
  const plainStyle = variant === "highlight" ? styles.highlightBody : styles.itemBody;
  if (!item.bodyBlocks?.length) return item.body ? <Text style={plainStyle}>{item.body}</Text> : variant === "item" ? <EmptyCopy /> : null;
  return <View style={variant === "highlight" ? styles.highlightBody : styles.itemRichBody}>{item.bodyBlocks.map((block) => {
    const heading = variant === "item" && block.type !== "p";
    const fontSize = variant === "highlight" ? RESUME_DOCUMENT_LAYOUT.highlightBodyFontSizePt : heading ? Math.min(RESUME_NARRATIVE_FONT_SIZES_PT[block.type], 13) : RESUME_DOCUMENT_LAYOUT.itemBodyFontSizePt;
    return <Text key={block.id} minPresenceAhead={heading ? 24 : 0} orphans={3} style={variant === "highlight" ? undefined : [heading ? styles.narrativeHeading : styles.itemBody, { fontSize, marginTop: 0 }]} widows={3}>{block.runs.map((run, index) => <Text key={`${block.id}-${index}`} style={run.bold ? { fontWeight: 700 } : undefined}>{withSimpleLineWrap(run.text, fontSize, "standard")}</Text>)}</Text>;
  })}</View>;
}

function ResumeItem({ item, detailLabel, grouped = false }: { item: ItemContent; detailLabel?: string; grouped?: boolean }) {
  const compact = itemBodyUnits(item) <= ITEM_UNBREAKABLE_BODY_UNITS;
  const subtitle = careerDetailSubtitle(item, grouped);
  if (!compact && !item.bodyBlocks?.length) {
    const [openingBody, continuationBody] = splitItemBodyOpening(item.body);
    return <View style={styles.itemFlow} wrap>
      <View style={styles.itemRow} wrap={false}>
        <Text style={styles.itemPeriod}>{formatItemPeriod(item)}</Text>
        <View style={styles.itemCopy}>
          {detailLabel ? <Text style={styles.detailType}>{detailLabel}</Text> : null}
          <Text style={styles.itemTitle}>{item.title || "제목 미입력"}</Text>
          {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
          <Text style={styles.itemBody}>{openingBody}</Text>
        </View>
      </View>
      {continuationBody ? <View style={styles.itemRow}>
        <View style={styles.itemPeriodSpacer} />
        <Text orphans={ITEM_BODY_WIDOWS} style={[styles.itemCopy, styles.itemBodyContinuation]} widows={ITEM_BODY_WIDOWS}>{continuationBody}</Text>
      </View> : null}
    </View>;
  }
  return <View style={styles.item} wrap={Boolean(item.bodyBlocks?.length && !compact)}>
    <Text style={styles.itemPeriod}>{formatItemPeriod(item)}</Text>
    <View style={styles.itemCopy}>
      <View wrap={false}>
        {detailLabel ? <Text style={styles.detailType}>{detailLabel}</Text> : null}
        <Text style={styles.itemTitle}>{item.title || "제목 미입력"}</Text>
        {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
      </View>
      <RichItemBody item={item} />
    </View>
  </View>;
}

function NarrativeSection({ section }: { section: Extract<ResumePdfSection, { kind: "narrative" }> }) {
  const blocks = section.content.blocks?.length
    ? section.content.blocks
    : section.content.body.replace(/\r\n?/gu, "\n").split(/\n\s*\n/gu).filter(Boolean).map((text, index) => ({ id: `${section.id}-legacy-${index + 1}`, type: "p" as const, runs: [{ text }] }));
  return <><SectionHeading section={section} />{blocks.length ? blocks.map((block) => {
    const heading = block.type !== "p";
    const fontSize = RESUME_NARRATIVE_FONT_SIZES_PT[block.type];
    return <Text
      key={block.id}
      minPresenceAhead={heading ? 32 : 0}
      orphans={3}
      style={[heading ? styles.narrativeHeading : styles.narrative, { fontSize }]}
      widows={3}
    >{block.runs.map((run, index) => <Text key={`${block.id}-${index}`} style={("bold" in run && run.bold) ? { fontWeight: 700 } : undefined}>{withSimpleLineWrap(run.text, fontSize, section.layout)}</Text>)}</Text>;
  }) : <EmptyCopy />}</>;
}

function tagWidth(item: string) {
  const textWidth = Array.from(item).reduce((width, character) => width + estimatedGlyphWidth(character, RESUME_DOCUMENT_LAYOUT.tagFontSizePt), 0);
  return textWidth + mm(RESUME_DOCUMENT_LAYOUT.tagHorizontalPaddingMm * 2);
}

function splitTagOpeningRow(items: string[], layout: ResumePdfSection["layout"]) {
  const cardsInset = layout === "cards" ? mm(8) : 0;
  const availableWidth = mm(RESUME_PDF_CONTENT_WIDTH_MM) - cardsInset - TAG_ROW_WIDTH_SAFETY_POINTS;
  const gap = mm(RESUME_DOCUMENT_LAYOUT.tagGapMm);
  let occupiedWidth = 0;
  let openingCount = 0;

  for (const item of items) {
    const nextWidth = tagWidth(item) + (openingCount ? gap : 0);
    if (openingCount && occupiedWidth + nextWidth > availableWidth) break;
    occupiedWidth += nextWidth;
    openingCount += 1;
  }

  return [items.slice(0, openingCount), items.slice(openingCount)] as const;
}

function TagList({ items, continuation = false }: { items: string[]; continuation?: boolean }) {
  return <View style={[styles.tags, continuation ? styles.tagContinuation : undefined]}>{items.map((item, index) => <Text key={`${item}-${index}`} style={styles.tag} wrap={false}>{item}</Text>)}</View>;
}

function TagsSection({ section }: { section: Extract<ResumePdfSection, { kind: "tags" }> }) {
  const groups = normalizeTagGroups(section.content);
  return <><SectionHeading section={section} />{groups.some((group) => group.items.length)
    ? <View style={styles.tagGroups}>{groups.map((group) => {
      if (!group.title) return <TagList items={group.items} key={group.id} />;
      const [openingItems, continuationItems] = splitTagOpeningRow(group.items, section.layout);
      return <View key={group.id}>
        <View style={styles.tagGroupOpening} wrap={false}>
          <Text style={styles.tagGroupTitle}>{group.title}</Text>
          <TagList items={openingItems} />
        </View>
        {continuationItems.length ? <TagList continuation items={continuationItems} /> : null}
      </View>;
    })}</View>
    : <EmptyCopy />}</>;
}

function GroupedCareerSection({ relatedWorkItems, section }: { relatedWorkItems: ItemContent[]; section: Extract<ResumePdfSection, { kind: "items" }> }) {
  const grouped = groupCareerDetails(relatedWorkItems, section.content.items, { detailSortDirection: section.content.sortDirection });
  const independentGroupTitle = resolveIndependentCareerDetailGroupTitle(section.content);
  const unorderedGroups = [
    ...grouped.employmentGroups.filter((group) => group.details.length).map((group) => ({ id: group.work.id, orderKey: `work:${group.work.id}`, title: group.work.title, meta: `${group.work.subtitle} · ${formatItemPeriod(group.work)}`, items: group.details, warning: false })),
    ...(grouped.independentDetails.length ? [{ id: "independent", orderKey: "independent", title: independentGroupTitle, meta: "", items: grouped.independentDetails, warning: false }] : []),
    ...(grouped.unresolvedDetails.length ? [{ id: "unresolved", orderKey: "unresolved", title: "연결 확인 필요", meta: "", items: grouped.unresolvedDetails, warning: true }] : []),
  ];
  const groups = section.content.sortDirection
    ? unorderedGroups
    : orderCareerDetailDisplayGroups(unorderedGroups, grouped.detailGroupOrder);
  return <><SectionHeading section={section} />{groups.length ? groups.map((group) => <View key={group.id} style={styles.group}>
    <View minPresenceAhead={42} style={styles.groupHeading} wrap={false}>
      <Text style={[styles.groupTitle, group.warning ? styles.warning : {}]}>{group.title}</Text>
      {group.meta ? <Text style={styles.groupMeta}>{group.meta}</Text> : null}
    </View>
    {group.items.map((item) => <ResumeItem detailLabel={careerDetailLabel(item)} grouped item={item} key={item.id} />)}
  </View>) : <EmptyCopy />}</>;
}

function ItemsSection({ currentMonth, relatedWorkItems, section }: { currentMonth?: string; relatedWorkItems: ItemContent[]; section: Extract<ResumePdfSection, { kind: "items" }> }) {
  if (section.layout === "highlight-grid") return <><SectionHeading section={section} />{section.content.items.length
    ? <View style={styles.highlightGrid}>{section.content.items.map((item, index) => <View key={item.id} style={styles.highlightCard} wrap={false}><Text style={styles.highlightIndex}>{String(index + 1).padStart(2, "0")}</Text><Text style={styles.highlightTitle}>{item.title || "강점 제목"}</Text>{item.subtitle ? <Text style={styles.highlightSubtitle}>{item.subtitle}</Text> : null}<RichItemBody item={item} variant="highlight" /></View>)}</View>
    : <EmptyCopy />}</>;
  if (section.id === "projects") return <GroupedCareerSection relatedWorkItems={relatedWorkItems} section={section} />;
  const items = section.id === "experience"
    ? sortExperienceItems(section.content.items, section.content.sortDirection)
    : section.content.items;
  const duration = section.id === "experience" && currentMonth
    ? formatCareerDuration(
      resolveCareerDurationMonths(items, section.content.careerDurationOverrideMonths, currentMonth),
      resolveCareerDurationLabel(items, section.content.careerDurationLabel),
    )
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
      {snapshot.sections.filter((section) => !section.hidden).map((section) => <Fragment key={section.id}>
        <View minPresenceAhead={SECTION_OPENING_PRESENCE_POINTS} />
        <PdfSection
          currentMonth={snapshot.currentMonth}
          relatedWorkItems={relatedWorkItems}
          section={section}
        />
      </Fragment>)}
    </Page>
  </Document>;
}
