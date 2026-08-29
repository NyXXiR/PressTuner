import { createElement, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";

import {
  formatItemPeriod,
  type EligibilityContent,
  type IdentityContent,
  type ItemContent,
  type ItemsContent,
  type NarrativeBlockType,
  type NarrativeContent,
  type ResumeSection,
  type SectionContent,
  type SectionLayout,
  type TagsContent,
} from "@/domain/resume-documents/model";
import {
  formatCareerDuration,
  groupCareerDetails,
  resolveCareerDurationLabel,
  resolveCareerDurationMonths,
  sortExperienceItems,
} from "@/domain/resume-documents/experiencePresentation";
import {
  identityContactItems,
  identityFactItems,
  RESUME_DOCUMENT_FONT_FAMILY,
  RESUME_IDENTITY_LAYOUT,
  wrapIdentityContact,
} from "@/domain/resume-documents/identityLayout";
import { careerDetailLabel, careerDetailSubtitle, normalizeTagGroups } from "@/domain/resume-documents/contentPresentation";
import { RESUME_DOCUMENT_LAYOUT, RESUME_NARRATIVE_FONT_SIZES_PT } from "@/domain/resume-documents/documentLayout";

export const RESUME_DOCUMENT_CSS_VARIABLES = {
  "--resume-base-size": `${RESUME_DOCUMENT_LAYOUT.baseFontSizePt}pt`,
  "--resume-base-line-height": RESUME_DOCUMENT_LAYOUT.baseLineHeight,
  "--resume-header-bottom-gap": `${RESUME_DOCUMENT_LAYOUT.headerBottomGapMm}mm`,
  "--resume-header-bottom-padding": `${RESUME_DOCUMENT_LAYOUT.headerBottomPaddingMm}mm`,
  "--resume-header-border-width": `${RESUME_DOCUMENT_LAYOUT.headerBorderWidthMm}mm`,
  "--resume-company-size": `${RESUME_DOCUMENT_LAYOUT.companyFontSizePt}pt`,
  "--resume-role-top-gap": `${RESUME_DOCUMENT_LAYOUT.roleTopGapMm}mm`,
  "--resume-role-size": `${RESUME_DOCUMENT_LAYOUT.roleFontSizePt}pt`,
  "--resume-section-gap": `${RESUME_DOCUMENT_LAYOUT.sectionGapMm}mm`,
  "--resume-section-heading-gap": `${RESUME_DOCUMENT_LAYOUT.sectionHeadingGapMm}mm`,
  "--resume-section-heading-bottom-gap": `${RESUME_DOCUMENT_LAYOUT.sectionHeadingBottomGapMm}mm`,
  "--resume-section-heading-bottom-padding": `${RESUME_DOCUMENT_LAYOUT.sectionHeadingBottomPaddingMm}mm`,
  "--resume-section-heading-border-width": `${RESUME_DOCUMENT_LAYOUT.sectionHeadingBorderWidthMm}mm`,
  "--resume-section-title-size": `${RESUME_DOCUMENT_LAYOUT.sectionTitleFontSizePt}pt`,
  "--resume-duration-size": `${RESUME_DOCUMENT_LAYOUT.durationFontSizePt}pt`,
  "--resume-empty-size": `${RESUME_DOCUMENT_LAYOUT.emptyFontSizePt}pt`,
  "--resume-item-period-width": `${RESUME_DOCUMENT_LAYOUT.itemPeriodWidthMm}mm`,
  "--resume-item-column-gap": `${RESUME_DOCUMENT_LAYOUT.itemColumnGapMm}mm`,
  "--resume-item-gap": `${RESUME_DOCUMENT_LAYOUT.itemGapMm}mm`,
  "--resume-item-period-size": `${RESUME_DOCUMENT_LAYOUT.itemPeriodFontSizePt}pt`,
  "--resume-detail-type-size": `${RESUME_DOCUMENT_LAYOUT.detailTypeFontSizePt}pt`,
  "--resume-item-title-size": `${RESUME_DOCUMENT_LAYOUT.itemTitleFontSizePt}pt`,
  "--resume-item-subtitle-size": `${RESUME_DOCUMENT_LAYOUT.itemSubtitleFontSizePt}pt`,
  "--resume-item-body-size": `${RESUME_DOCUMENT_LAYOUT.itemBodyFontSizePt}pt`,
  "--resume-item-body-top-gap": `${RESUME_DOCUMENT_LAYOUT.itemBodyTopGapMm}mm`,
  "--resume-item-body-line-height": RESUME_DOCUMENT_LAYOUT.itemBodyLineHeight,
  "--resume-group-left-padding": `${RESUME_DOCUMENT_LAYOUT.groupLeftPaddingMm}mm`,
  "--resume-group-border-width": `${RESUME_DOCUMENT_LAYOUT.groupBorderWidthMm}mm`,
  "--resume-group-gap": `${RESUME_DOCUMENT_LAYOUT.groupGapMm}mm`,
  "--resume-group-heading-bottom-gap": `${RESUME_DOCUMENT_LAYOUT.groupHeadingBottomGapMm}mm`,
  "--resume-group-title-size": `${RESUME_DOCUMENT_LAYOUT.groupTitleFontSizePt}pt`,
  "--resume-group-meta-size": `${RESUME_DOCUMENT_LAYOUT.groupMetaFontSizePt}pt`,
  "--resume-tag-size": `${RESUME_DOCUMENT_LAYOUT.tagFontSizePt}pt`,
  "--resume-tag-gap": `${RESUME_DOCUMENT_LAYOUT.tagGapMm}mm`,
  "--resume-tag-vertical-padding": `${RESUME_DOCUMENT_LAYOUT.tagVerticalPaddingMm}mm`,
  "--resume-tag-horizontal-padding": `${RESUME_DOCUMENT_LAYOUT.tagHorizontalPaddingMm}mm`,
  "--resume-highlight-columns": RESUME_DOCUMENT_LAYOUT.highlightColumns,
  "--resume-highlight-gap": `${RESUME_DOCUMENT_LAYOUT.highlightGapMm}mm`,
  "--resume-highlight-min-height": `${RESUME_DOCUMENT_LAYOUT.highlightMinHeightMm}mm`,
  "--resume-highlight-padding": `${RESUME_DOCUMENT_LAYOUT.highlightPaddingMm}mm`,
  "--resume-highlight-border-width": `${RESUME_DOCUMENT_LAYOUT.highlightBorderWidthMm}mm`,
  "--resume-highlight-index-size": `${RESUME_DOCUMENT_LAYOUT.highlightIndexFontSizePt}pt`,
  "--resume-highlight-title-size": `${RESUME_DOCUMENT_LAYOUT.highlightTitleFontSizePt}pt`,
  "--resume-highlight-subtitle-size": `${RESUME_DOCUMENT_LAYOUT.highlightSubtitleFontSizePt}pt`,
  "--resume-highlight-body-size": `${RESUME_DOCUMENT_LAYOUT.highlightBodyFontSizePt}pt`,
  "--resume-highlight-body-line-height": RESUME_DOCUMENT_LAYOUT.highlightBodyLineHeight,
  "--resume-narrative-block-gap": `${RESUME_DOCUMENT_LAYOUT.narrativeBlockGapMm}mm`,
  "--resume-narrative-body-line-height": RESUME_DOCUMENT_LAYOUT.narrativeBodyLineHeight,
  "--resume-narrative-heading-line-height": RESUME_DOCUMENT_LAYOUT.narrativeHeadingLineHeight,
  "--resume-narrative-p-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.p}pt`,
  "--resume-narrative-h1-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.h1}pt`,
  "--resume-narrative-h2-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.h2}pt`,
  "--resume-narrative-h3-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.h3}pt`,
  "--resume-narrative-h4-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.h4}pt`,
  "--resume-narrative-h5-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.h5}pt`,
  "--resume-narrative-h6-size": `${RESUME_NARRATIVE_FONT_SIZES_PT.h6}pt`,
} as CSSProperties;

const isCareerTimelineSectionId = (sectionId: string) => sectionId === "experience" || sectionId === "projects";

export type ResumeEditorSection = ResumeSection & { hidden?: boolean };

export type ResumeEditorHeaderProps = {
  company: string;
  role: string;
};

export function ResumeEditorHeader({ company, role }: ResumeEditorHeaderProps) {
  return <header className="resume-print-header"><p className="resume-print-company">{company}</p><p className="resume-print-role">{role}</p></header>;
}

export function ResumeEditorSection({ currentMonth, relatedWorkItems = [], section }: {
  currentMonth?: string;
  relatedWorkItems?: ItemContent[];
  section: ResumeEditorSection;
}) {
  if (section.hidden) return null;
  const content = section.content;
  const experienceContent = section.id === "experience" && section.kind === "items" ? content as ItemsContent : null;
  const careerDuration = experienceContent && currentMonth
    ? formatCareerDuration(
      resolveCareerDurationMonths(experienceContent.items, experienceContent.careerDurationOverrideMonths, currentMonth),
      resolveCareerDurationLabel(experienceContent.items, experienceContent.careerDurationLabel),
    )
    : null;
  const splittable = section.kind === "items"
    ? (content as ItemsContent).items.length > 1
    : section.kind === "narrative"
      ? ((content as NarrativeContent).blocks?.length ?? (content as NarrativeContent).body.split(/\n\s*\n/).length) > 1
      : false;
  const heading = section.kind === "identity" ? null : careerDuration
    ? <div className="resume-section-heading"><h2>{section.title}</h2><p data-experience-duration>{careerDuration}</p></div>
    : <h2 className="resume-section-heading">{section.title}</h2>;
  return <section className="resume-document-section" data-resume-section-id={section.id} data-resume-splittable={splittable || undefined} data-section-kind={section.kind}>
    <ResumePrintableSectionBody content={content} heading={heading} layout={section.layout ?? "standard"} relatedWorkItems={relatedWorkItems} section={section} />
  </section>;
}

function ResumePrintableSectionBody({ content, heading, layout, relatedWorkItems, section }: {
  content: SectionContent;
  heading: ReactNode;
  layout: SectionLayout;
  relatedWorkItems: ItemContent[];
  section: ResumeEditorSection;
}) {
  if (section.kind === "identity") return <IdentityBody content={content as IdentityContent} layout={layout} />;
  if (section.kind === "eligibility") return <div className="resume-section-opening">{heading}<EligibilityBody content={content as EligibilityContent} /></div>;
  if (section.kind === "narrative") return <NarrativeBody content={content as NarrativeContent} heading={heading} layout={layout} sectionId={section.id} />;
  if (section.kind === "tags") return <div className="resume-section-opening">{heading}<div className={`resume-tag-groups resume-layout-${layout}`}>{normalizeTagGroups(content as TagsContent).map((group) => <div className="resume-tag-group" key={group.id}>{group.title && <h3 className="resume-tag-group-title">{group.title}</h3>}<div className="resume-tags">{group.items.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div>)}</div></div>;
  const itemContent = content as ItemsContent;
  if (layout === "highlight-grid") return <HighlightGridBody content={itemContent} heading={heading} />;
  if (section.id === "projects") return <GroupedCareerBody content={itemContent} heading={heading} relatedWorkItems={relatedWorkItems} />;
  const items = isCareerTimelineSectionId(section.id) ? sortExperienceItems(itemContent.items, itemContent.sortDirection) : itemContent.items;
  const [firstItem, ...remainingItems] = items;
  return <>{firstItem
    ? <div className="resume-section-opening">{heading}<div className={`resume-items resume-layout-${layout}`}><ResumeItem item={firstItem} /></div></div>
    : heading}
  {remainingItems.length > 0 && <div className={`resume-items resume-items-continuation resume-layout-${layout}`}>{remainingItems.map((item) => <ResumeItem item={item} key={item.id} />)}</div>}</>;
}

function HighlightGridBody({ content, heading }: { content: ItemsContent; heading: ReactNode }) {
  return <div className="resume-section-opening">{heading}{content.items.length > 0 ? <div className="resume-highlight-grid">{content.items.map((item, index) => <article className="resume-highlight-card" key={item.id}>
    <p className="resume-highlight-index">{String(index + 1).padStart(2, "0")}</p>
    <h3>{item.title || "강점 제목"}</h3>
    {item.subtitle && <p className="resume-highlight-subtitle">{item.subtitle}</p>}
    <ItemBody item={item} variant="highlight" />
  </article>)}</div> : null}</div>;
}

function IdentityBody({ content, layout }: { content: IdentityContent; layout: SectionLayout }) {
  const contactItems = identityContactItems(content);
  const factItems = identityFactItems(content);
  const identityStyle = {
    "--resume-document-font": RESUME_DOCUMENT_FONT_FAMILY,
    "--resume-identity-column-gap": `${RESUME_IDENTITY_LAYOUT.columnGapMm}mm`,
    "--resume-identity-name-gap": `${RESUME_IDENTITY_LAYOUT.nameToContactsGapMm}mm`,
    "--resume-identity-name-size": `${RESUME_IDENTITY_LAYOUT.nameFontSizePt}pt`,
    "--resume-identity-name-line-height": RESUME_IDENTITY_LAYOUT.nameLineHeight,
    "--resume-identity-name-letter-spacing": `${RESUME_IDENTITY_LAYOUT.nameLetterSpacingPt}pt`,
    "--resume-contact-row-gap": `${RESUME_IDENTITY_LAYOUT.contactRowGapMm}mm`,
    "--resume-contact-label-width": `${RESUME_IDENTITY_LAYOUT.contactLabelWidthMm}mm`,
    "--resume-contact-column-gap": `${RESUME_IDENTITY_LAYOUT.contactColumnGapMm}mm`,
    "--resume-contact-label-size": `${RESUME_IDENTITY_LAYOUT.contactLabelFontSizePt}pt`,
    "--resume-contact-label-letter-spacing": `${RESUME_IDENTITY_LAYOUT.contactLabelLetterSpacingPt}pt`,
    "--resume-contact-value-size": `${RESUME_IDENTITY_LAYOUT.contactValueFontSizePt}pt`,
    "--resume-contact-value-line-height": RESUME_IDENTITY_LAYOUT.contactValueLineHeight,
    "--resume-identity-facts-gap": `${RESUME_IDENTITY_LAYOUT.factsTopGapMm}mm`,
    "--resume-identity-facts-padding": `${RESUME_IDENTITY_LAYOUT.factsTopPaddingMm}mm`,
    "--resume-identity-facts-size": `${RESUME_IDENTITY_LAYOUT.factsFontSizePt}pt`,
    "--resume-identity-photo-width": `${RESUME_IDENTITY_LAYOUT.photoWidthMm}mm`,
    "--resume-identity-photo-height": `${RESUME_IDENTITY_LAYOUT.photoHeightMm}mm`,
  } as CSSProperties;
  return <div className={`resume-identity resume-layout-${layout}`} data-photo-position="right" style={identityStyle}>
    <div className="resume-identity-copy">
      <div className="resume-identity-heading"><h2>{content.name || "이름 미입력"}</h2></div>
      {contactItems.length > 0 && <div className="resume-contact-grid">{contactItems.map((item, index) => <div className="resume-contact-item" key={`${item.label}-${item.value}-${index}`}><span>{item.label}</span><p>{wrapIdentityContact(item.value, Boolean(content.photo))}</p></div>)}</div>}
      {factItems.length > 0 && <div className="resume-facts">{factItems.map((item) => <span key={item}>{item}</span>)}</div>}
    </div>
    {content.photo && <Image alt={`${content.name || "지원자"} 증명사진`} className="resume-profile-photo" height={640} loading="eager" src={content.photo} unoptimized width={480} />}
  </div>;
}

function EligibilityBody({ content }: { content: EligibilityContent }) {
  const facts = [content.militaryStatus && `병역 ${content.militaryStatus}`, content.veteranStatus && `보훈 ${content.veteranStatus}`, content.disabilityStatus && `장애 ${content.disabilityStatus}`, content.employmentProtectionStatus && `취업보호 ${content.employmentProtectionStatus}`].filter(Boolean) as string[];
  return facts.length > 0 ? <div className="resume-facts">{facts.map((item) => <span key={item}>{item}</span>)}</div> : <p className="resume-empty-copy">선택한 정보가 없습니다.</p>;
}

function ItemBody({ item, variant = "item" }: { item: ItemContent; variant?: "item" | "highlight" }) {
  const plainClassName = variant === "highlight" ? "resume-highlight-body" : "resume-item-body";
  if (!item.bodyBlocks?.length) return item.body ? <p className={plainClassName}>{item.body}</p> : null;
  if (variant === "highlight") return <div className="resume-highlight-body resume-highlight-rich-body">{item.bodyBlocks.map((block) => <p key={block.id}>{block.runs.map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : run.text)}</p>)}</div>;
  const classes: Record<NarrativeBlockType, string> = { p: "resume-item-body", h1: "resume-narrative-h1", h2: "resume-narrative-h2", h3: "resume-narrative-h3", h4: "resume-narrative-h4", h5: "resume-narrative-h5", h6: "resume-narrative-h6" };
  return <div className="resume-item-rich-body">{item.bodyBlocks.map((block) => createElement(block.type, { className: classes[block.type], key: block.id }, block.runs.map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : run.text)))}</div>;
}

function ResumeItem({ item, detailLabel, grouped = false }: { item: ItemContent; detailLabel?: string; grouped?: boolean }) {
  const subtitle = careerDetailSubtitle(item, grouped);
  return <article className="resume-item" data-resume-item-id={item.id}>
    <p className="resume-item-period">{formatItemPeriod(item)}</p>
    <div className="resume-item-copy"><div className="resume-item-header">{detailLabel && <p className="resume-detail-type">{detailLabel}</p>}<h3 className="resume-item-title">{item.title}</h3>{subtitle && <p className="resume-item-subtitle">{subtitle}</p>}</div><ItemBody item={item} /></div>
  </article>;
}

function GroupedCareerBody({ content, heading, relatedWorkItems }: { content: ItemsContent; heading: ReactNode; relatedWorkItems: ItemContent[] }) {
  const grouped = groupCareerDetails(relatedWorkItems, content.items, { detailSortDirection: content.sortDirection });
  const detail = (item: ItemContent) => <ResumeItem detailLabel={careerDetailLabel(item)} grouped item={item} key={item.id} />;
  const groups = [
    ...grouped.employmentGroups.filter((group) => group.details.length).map((group) => ({ id: group.work.id, title: group.work.title, meta: `${group.work.subtitle} · ${formatItemPeriod(group.work)}`, items: group.details, warning: false })),
    ...(grouped.independentDetails.length > 0 ? [{ id: "independent", title: "독립 프로젝트", meta: "", items: grouped.independentDetails, warning: false }] : []),
    ...(grouped.unresolvedDetails.length > 0 ? [{ id: "unresolved", title: "연결 확인 필요", meta: "", items: grouped.unresolvedDetails, warning: true }] : []),
  ];
  const [firstGroup, ...remainingGroups] = groups;
  if (!firstGroup) return <>{heading}</>;
  const [firstItem, ...remainingFirstItems] = firstGroup.items;
  const renderGroup = (group: typeof firstGroup, items: ItemContent[], showHeading: boolean, key = group.id) => <section className="resume-career-group" key={key}>
    {showHeading && <div className={`resume-group-heading${group.warning ? " resume-warning" : ""}`}><h3>{group.title}</h3>{group.meta && <p>{group.meta}</p>}</div>}
    <div className="resume-career-detail-list">{items.map(detail)}</div>
  </section>;
  return <>
    <div className="resume-section-opening">{heading}{renderGroup(firstGroup, [firstItem], true, `${firstGroup.id}-opening`)}</div>
    {(remainingFirstItems.length > 0 || remainingGroups.length > 0) && <div className="resume-career-detail-groups resume-career-detail-groups-continuation">
      {remainingFirstItems.length > 0 && renderGroup(firstGroup, remainingFirstItems, false, `${firstGroup.id}-continuation`)}
      {remainingGroups.map((group) => renderGroup(group, group.items, true))}
    </div>}
  </>;
}

function NarrativeBody({ content, heading, layout, sectionId }: { content: NarrativeContent; heading: ReactNode; layout: SectionLayout; sectionId: string }) {
  const textStyles: Record<NarrativeBlockType, string> = { p: "resume-narrative-p", h1: "resume-narrative-h1", h2: "resume-narrative-h2", h3: "resume-narrative-h3", h4: "resume-narrative-h4", h5: "resume-narrative-h5", h6: "resume-narrative-h6" };
  const paragraphs = content.blocks?.length
    ? content.blocks.map((block) => createElement(block.type, { className: textStyles[block.type], "data-resume-paragraph-id": block.id, key: block.id }, block.runs.map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : run.text)))
    : content.body.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((paragraph, index) => <p className="resume-narrative-p" data-resume-paragraph-id={`${sectionId}-legacy-${index + 1}`} key={index}>{paragraph}</p>);
  const [firstParagraph, ...remainingParagraphs] = paragraphs;
  return <>
    <div className="resume-section-opening">{heading}<div className={`resume-narrative resume-layout-${layout}`}>{firstParagraph}</div></div>
    {remainingParagraphs.length > 0 && <div className={`resume-narrative resume-narrative-continuation resume-layout-${layout}`}>{remainingParagraphs}</div>}
  </>;
}
